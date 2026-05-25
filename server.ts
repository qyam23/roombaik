import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Enable parsing of large base64 JSON structures for image capture
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// --- IN-MEMORY DATABASE STATE (To keep it agile, lightweight, and resilient on Cloud Run) ---

interface EventLog {
  id: string;
  timestampMs: number;
  eventType: string;
  confidence: number;
  message: string;
  snapshotUrl?: string;
  audioLevel?: number;
  metadata?: any;
}

let eventsList: EventLog[] = [
  {
    id: "init-sys",
    timestampMs: Date.now() - 3600000 * 2,
    eventType: "SYSTEM_INFO",
    confidence: 1.0,
    message: "RoomSense AI security node successfully initialized.",
    audioLevel: 0.1,
    metadata: { info: "Node started standard operational diagnostics." }
  },
  {
    id: "init-setup",
    timestampMs: Date.now() - 3600000 * 1,
    eventType: "SCENE_CHANGED",
    confidence: 0.95,
    message: "Scene baseline recalibrated. Safe boundary active.",
    audioLevel: 0.15,
  }
];

let latestCapturedFrame: {
  dataUrl: string; // Base64 raw URL
  timestamp: number;
} | null = null;

let currentSettings = {
  motionThreshold: 35,
  soundThreshold: 45,
  captureOnMotion: true,
  captureOnSound: true,
  retentionDays: 7,
  enableGeminiAlerts: true,
  geminiAnalysisOnDemand: true
};

let sensorStatus = {
  monitoring: false,
  cameraActive: false,
  microphoneActive: false,
  apiActive: true,
  activeNodes: 0,
  fps: 0,
  latestEventTime: null as number | null,
  currentAudioLevel: 0,
  currentMotionLevel: 0
};

// --- GEMINI CLIENT DELEGATOR WITH LAZY CLIENT CREATION ---

let aiClient: GoogleGenAI | null = null;

function getGeminiAI(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is not defined.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Check if Gemini is configured (for UI indicators)
function isGeminiConfigured(): boolean {
  return typeof process.env.GEMINI_API_KEY === 'string' && process.env.GEMINI_API_KEY.length > 5;
}

// --- API ROUTE HANDLERS ---

// Endpoint: AI Credentials Check
app.get("/api/gemini/health", (req, res) => {
  res.json({
    configured: isGeminiConfigured(),
    model: "gemini-3.5-flash",
    details: isGeminiConfigured() ? "Full-stack Gemini API Key configured successfully." : "Gemini API key is not configured. Run of summaries and Vision analysis will fall back to local rule patterns."
  });
});

// Endpoint: Sensor Nodes State Status
app.get("/api/status", (req, res) => {
  res.json({
    ...sensorStatus,
    geminiActive: isGeminiConfigured()
  });
});

app.post("/api/status", (req, res) => {
  const { monitoring, cameraActive, microphoneActive, fps, currentAudioLevel, currentMotionLevel } = req.body;
  if (typeof monitoring === "boolean") sensorStatus.monitoring = monitoring;
  if (typeof cameraActive === "boolean") sensorStatus.cameraActive = cameraActive;
  if (typeof microphoneActive === "boolean") sensorStatus.microphoneActive = microphoneActive;
  if (typeof fps === "number") sensorStatus.fps = fps;
  if (typeof currentAudioLevel === "number") sensorStatus.currentAudioLevel = currentAudioLevel;
  if (typeof currentMotionLevel === "number") sensorStatus.currentMotionLevel = currentMotionLevel;
  
  if (cameraActive || microphoneActive) {
    sensorStatus.activeNodes = 1;
  } else {
    sensorStatus.activeNodes = 0;
  }
  
  res.json({ success: true, status: sensorStatus });
});

// Endpoint: Retrieve Events list
app.get("/api/events", (req, res) => {
  const { limit } = req.query;
  let responseList = [...eventsList].sort((a, b) => b.timestampMs - a.timestampMs);
  if (limit) {
    responseList = responseList.slice(0, parseInt(limit as string, 10));
  }
  res.json(responseList);
});

// Endpoint: Create/Log detection event from sensor node
app.post("/api/events", (req, res) => {
  const { eventType, confidence, message, audioLevel, snapshotUrl, metadata } = req.body;
  
  if (!eventType) {
    res.status(400).json({ error: "eventType is a required field." });
    return;
  }
  
  const newEvent: EventLog = {
    id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestampMs: Date.now(),
    eventType,
    confidence: confidence ?? 1.0,
    message: message ?? "Activity flagged.",
    audioLevel,
    snapshotUrl,
    metadata
  };
  
  eventsList.push(newEvent);
  sensorStatus.latestEventTime = newEvent.timestampMs;
  
  // Clean up according to retention policy
  const cutOffTime = Date.now() - currentSettings.retentionDays * 24 * 60 * 60 * 1000;
  eventsList = eventsList.filter(e => e.timestampMs > cutOffTime || e.id === "init-sys");
  
  res.json({ success: true, event: newEvent });
});

// Endpoint: Clear events logs
app.delete("/api/events", (req, res) => {
  eventsList = [
    {
      id: "clear-sys",
      timestampMs: Date.now(),
      eventType: "SYSTEM_INFO",
      confidence: 1.0,
      message: "Event database cleared and reset by user.",
    }
  ];
  sensorStatus.latestEventTime = null;
  res.json({ success: true, message: "Logs successfully cleared." });
});

// Endpoint: Settings retrieval
app.get("/api/settings", (req, res) => {
  res.json(currentSettings);
});

// Endpoint: Update Settings
app.post("/api/settings", (req, res) => {
  const updated = req.body;
  currentSettings = {
    ...currentSettings,
    ...updated
  };
  res.json({ success: true, settings: currentSettings });
});

// Endpoint: Store latest captured snapshot base64 image
app.post("/api/upload-frame", (req, res) => {
  const { dataUrl } = req.body;
  if (!dataUrl) {
    res.status(400).json({ error: "dataUrl payload missing." });
    return;
  }
  
  latestCapturedFrame = {
    dataUrl,
    timestamp: Date.now()
  };
  
  res.json({ success: true, timestamp: latestCapturedFrame.timestamp });
});

// Endpoint: Fetch latest captured frame
app.get("/api/latest-frame", (req, res) => {
  if (!latestCapturedFrame) {
    res.json({ frame: null, message: "No snapshots captured yet." });
    return;
  }
  res.json({
    frame: latestCapturedFrame.dataUrl,
    timestamp: latestCapturedFrame.timestamp
  });
});

// Endpoint: Summarize logs using Gemini API
app.post("/api/summarize", async (req, res) => {
  try {
    if (!isGeminiConfigured()) {
      // Local fallback summary
      const latestEvents = [...eventsList].sort((a, b) => b.timestampMs - a.timestampMs).slice(0, 5);
      const types = latestEvents.map(e => e.eventType);
      const fallbackSummary = `RoomSense safe monitoring active. The log contains ${eventsList.length} events. Recent indicators show: ${types.join(', ') || 'No activities registered.'}`;
      res.json({
        summary: fallbackSummary,
        importantChanges: ["No custom API Key to run advanced Gemini summary. General local rules are active."],
        attentionRequired: false,
        reason: "Local simple status check of events list."
      });
      return;
    }

    const ai = getGeminiAI();
    
    // Prepare log details
    const recentLogs = [...eventsList]
      .sort((a, b) => b.timestampMs - a.timestampMs)
      .slice(0, 15)
      .map(e => ({
        time: new Date(e.timestampMs).toLocaleTimeString(),
        type: e.eventType,
        message: e.message,
        confidence: e.confidence,
        audioLevel: e.audioLevel
      }));

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `You are the core intelligence of RoomSense AI, acting as a security and ambient analytics companion.
Based strictly on the following JSON array of room activity log elements, write a brief, highly structural, and conversational human-readable summary about what took place in the room.

Recent Event Logs:
${JSON.stringify(recentLogs, null, 2)}

Provide your response in JSON matching this structured schema:
{
  "summary": "Clear, friendly, professional 2-3 sentence overview of current room state",
  "importantChanges": ["List key event shifts, e.g., 'Unusual sound spike around 10:15 AM'", "No activity registered during morning hours"],
  "attentionRequired": true_or_false,
  "reason": "Simple 1-sentence reason why attention is or is not required based strictly on high confidence alerts"
}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "Clear, warm summaries of logs" },
            importantChanges: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING }, 
              description: "Key findings or deviations" 
            },
            attentionRequired: { type: Type.BOOLEAN, description: "Whether immediate attention is needed (e.g., sound spikes/motion alerts)" },
            reason: { type: Type.STRING, description: "Simple reason of the assessment" }
          },
          required: ["summary", "importantChanges", "attentionRequired", "reason"]
        }
      }
    });

    const parsedResponse = JSON.parse(response.text ?? "{}");
    res.json(parsedResponse);
  } catch (error: any) {
    console.error("Gemini summary error:", error);
    res.status(500).json({ error: error.message || "Failed generating AI Summaries." });
  }
});

// Endpoint: Analyze live captured video frame with Gemini Vision API
app.post("/api/analyze-frame", async (req, res) => {
  try {
    const { frameBase64 } = req.body;
    const targetFrame = frameBase64 || latestCapturedFrame?.dataUrl;

    if (!targetFrame) {
      res.status(400).json({ error: "No image has been sent or resides in server snapshot store." });
      return;
    }

    if (!isGeminiConfigured()) {
      res.json({
        objects: ["Webcam active"],
        anomalies: ["Local Vision pattern matches are active. Gemini Vision requires an API key."],
        safetyCheckResult: "Undetermined",
        sceneDescription: "Unable to run Gemini Vision. Please configure your key in Settings > Secrets."
      });
      return;
    }

    const ai = getGeminiAI();

    // Clean dataURL prefix if present
    const cleanBase64 = targetFrame.replace(/^data:image\/\w+;base64,/, "");

    const imagePart = {
      inlineData: {
        mimeType: "image/jpeg",
        data: cleanBase64
      }
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        imagePart,
        `You are RoomSense AI. Analyze this direct visual snapshot captured by the smart sensor. Include objects detected in the room, structural scene changes (e.g. lights on/off, unexpected movement, doors open/close), and standard safety check validation.
Provide output as a valid structured JSON object matching this schema:
{
  "objects": ["List of objects identified matching space parameters"],
  "anomalies": ["Alerts or items out of place"],
  "safetyCheckResult": "Secure | Action Advised | Alert",
  "sceneDescription": "A informative 2-sentence description of the current room visual state"
}`
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            objects: { type: Type.ARRAY, items: { type: Type.STRING } },
            anomalies: { type: Type.ARRAY, items: { type: Type.STRING } },
            safetyCheckResult: { type: Type.STRING },
            sceneDescription: { type: Type.STRING }
          },
          required: ["objects", "anomalies", "safetyCheckResult", "sceneDescription"]
        }
      }
    });

    const parsedResult = JSON.parse(response.text ?? "{}");
    res.json(parsedResult);
  } catch (error: any) {
    console.error("Gemini Vision error:", error);
    res.status(500).json({ error: error.message || "Failed running vision analysis" });
  }
});

// --- VITE DEV OR PROD SERVER WIREUP ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[RoomSense AI Server] running fully local on http://localhost:${PORT}`);
  });
}

startServer();
