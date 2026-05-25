import express from "express";
import https from "https";
import os from "os";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { generate } from "selfsigned";

dotenv.config({ path: [".env.local", ".env"] });

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 3443);
const USE_HTTPS = process.env.ROOMSENSE_HTTPS === "true";
const ACCESS_KEY = process.env.ROOMSENSE_ACCESS_KEY || "";

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

interface EventLog {
  id: string;
  timestampMs: number;
  eventType: string;
  confidence: number;
  message: string;
  snapshotUrl?: string;
  audioLevel?: number;
  metadata?: Record<string, unknown>;
}

interface AiUsageCall {
  id: string;
  timestampMs: number;
  provider: string;
  model: string;
  feature: "summary" | "vision" | "local";
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  bytesIn: number;
  bytesOut: number;
  status: "ok" | "fallback" | "error";
}

let eventsList: EventLog[] = [
  {
    id: "init-sys",
    timestampMs: Date.now() - 3600000 * 2,
    eventType: "SYSTEM_INFO",
    confidence: 1.0,
    message: "RoomSense AI private local sensor initialized.",
    audioLevel: 0.1,
    metadata: { info: "Local-first mode. No external AI provider is required." }
  },
  {
    id: "init-setup",
    timestampMs: Date.now() - 3600000,
    eventType: "SCENE_CHANGED",
    confidence: 0.95,
    message: "Scene baseline recalibrated. Private room boundary active.",
    audioLevel: 0.15
  }
];

let latestCapturedFrame: { dataUrl: string; timestamp: number } | null = null;

let currentSettings = {
  motionThreshold: 35,
  soundThreshold: 45,
  captureOnMotion: true,
  captureOnSound: true,
  retentionDays: 7,
  enableExternalAi: false,
  aiAnalysisOnDemand: true,
  aiProviderLabel: process.env.AI_PROVIDER_LABEL || "OpenAI-compatible",
  aiModel: process.env.AI_MODEL || "local-rules"
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

let aiUsageCalls: AiUsageCall[] = [];

function isExternalAiConfigured(): boolean {
  return Boolean(
    process.env.AI_API_KEY &&
    process.env.AI_API_BASE_URL &&
    process.env.AI_MODEL &&
    currentSettings.enableExternalAi
  );
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function byteLength(value: unknown): number {
  return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value), "utf8");
}

function recordAiUsage(call: Omit<AiUsageCall, "id" | "timestampMs" | "totalTokens">) {
  const entry: AiUsageCall = {
    ...call,
    id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestampMs: Date.now(),
    totalTokens: call.promptTokens + call.completionTokens
  };
  aiUsageCalls = [entry, ...aiUsageCalls].slice(0, 200);
  return entry;
}

function aiUsageSummary() {
  const totals = aiUsageCalls.reduce(
    (acc, call) => {
      acc.requests += 1;
      acc.promptTokens += call.promptTokens;
      acc.completionTokens += call.completionTokens;
      acc.totalTokens += call.totalTokens;
      acc.bytesIn += call.bytesIn;
      acc.bytesOut += call.bytesOut;
      return acc;
    },
    { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, bytesIn: 0, bytesOut: 0 }
  );

  return {
    ...totals,
    recentCalls: aiUsageCalls.slice(0, 20)
  };
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI response did not contain JSON.");
  return JSON.parse(candidate.slice(start, end + 1));
}

async function callOpenAiCompatibleJson<T>(
  feature: "summary" | "vision",
  messages: Array<Record<string, unknown>>,
  fallback: T
): Promise<T> {
  if (!isExternalAiConfigured()) {
    const payload = JSON.stringify(messages);
    recordAiUsage({
      provider: "local-rules",
      model: "local-rules",
      feature: "local",
      promptTokens: estimateTokens(payload),
      completionTokens: estimateTokens(JSON.stringify(fallback)),
      bytesIn: byteLength(payload),
      bytesOut: byteLength(fallback),
      status: "fallback"
    });
    return fallback;
  }

  const provider = currentSettings.aiProviderLabel || process.env.AI_PROVIDER_LABEL || "OpenAI-compatible";
  const model = currentSettings.aiModel || process.env.AI_MODEL || "unknown-model";
  const body = {
    model,
    messages,
    temperature: 0.2,
    response_format: { type: "json_object" }
  };

  try {
    const response = await fetch(`${process.env.AI_API_BASE_URL!.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AI_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`AI provider returned ${response.status}: ${raw.slice(0, 180)}`);
    }

    const data = JSON.parse(raw);
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = typeof content === "string" ? parseJsonObject(content) : content;
    const promptTokens = Number(data.usage?.prompt_tokens) || estimateTokens(JSON.stringify(messages));
    const completionTokens = Number(data.usage?.completion_tokens) || estimateTokens(JSON.stringify(parsed));

    recordAiUsage({
      provider,
      model,
      feature,
      promptTokens,
      completionTokens,
      bytesIn: byteLength(body),
      bytesOut: byteLength(raw),
      status: "ok"
    });

    return parsed as T;
  } catch (error) {
    recordAiUsage({
      provider,
      model,
      feature,
      promptTokens: estimateTokens(JSON.stringify(messages)),
      completionTokens: estimateTokens(JSON.stringify(fallback)),
      bytesIn: byteLength(body),
      bytesOut: byteLength(fallback),
      status: "error"
    });
    console.error("External AI failed, falling back locally:", error);
    return fallback;
  }
}

function getLocalSummary() {
  const latestEvents = [...eventsList].sort((a, b) => b.timestampMs - a.timestampMs).slice(0, 5);
  const highSignalEvents = latestEvents.filter(e => e.eventType !== "SYSTEM_INFO");
  const attentionRequired = highSignalEvents.some(e => e.eventType === "SOUND_SPIKE" || e.eventType === "MOTION_DETECTED");

  return {
    summary: `RoomSense is running in private local mode with ${eventsList.length} stored events. Recent indicators: ${latestEvents.map(e => e.eventType).join(", ") || "none"}.`,
    importantChanges: highSignalEvents.length
      ? highSignalEvents.map(e => `${e.eventType}: ${e.message}`)
      : ["No high-signal movement or sound events are currently stored."],
    attentionRequired,
    reason: attentionRequired
      ? "Recent motion or sound events crossed your local thresholds."
      : "Only system or baseline events are present."
  };
}

function getLocalVision(frame?: string) {
  const approxBytes = frame ? Math.round(frame.length * 0.75) : 0;
  return {
    objects: ["Local camera frame available"],
    anomalies: ["External vision AI is disabled. Snapshot stayed on this local server."],
    safetyCheckResult: "Local Only",
    sceneDescription: `A snapshot is available for local review (${Math.round(approxBytes / 1024)} KB approximate payload). Enable an OpenAI-compatible local or remote provider only when you want cloud analysis.`
  };
}

function sanitizeSettings(input: Record<string, unknown>) {
  return {
    motionThreshold: clampNumber(input.motionThreshold, currentSettings.motionThreshold, 10, 90),
    soundThreshold: clampNumber(input.soundThreshold, currentSettings.soundThreshold, 10, 90),
    captureOnMotion: typeof input.captureOnMotion === "boolean" ? input.captureOnMotion : currentSettings.captureOnMotion,
    captureOnSound: typeof input.captureOnSound === "boolean" ? input.captureOnSound : currentSettings.captureOnSound,
    retentionDays: clampNumber(input.retentionDays, currentSettings.retentionDays, 1, 30),
    enableExternalAi: typeof input.enableExternalAi === "boolean" ? input.enableExternalAi : currentSettings.enableExternalAi,
    aiAnalysisOnDemand: typeof input.aiAnalysisOnDemand === "boolean" ? input.aiAnalysisOnDemand : currentSettings.aiAnalysisOnDemand,
    aiProviderLabel: typeof input.aiProviderLabel === "string" ? input.aiProviderLabel.slice(0, 60) : currentSettings.aiProviderLabel,
    aiModel: typeof input.aiModel === "string" ? input.aiModel.slice(0, 80) : currentSettings.aiModel
  };
}

app.use("/api", (req, res, next) => {
  if (!ACCESS_KEY) {
    next();
    return;
  }

  const provided =
    req.header("X-RoomSense-Key") ||
    req.header("Authorization")?.replace(/^Bearer\s+/i, "") ||
    (typeof req.query.access_key === "string" ? req.query.access_key : "");

  if (provided === ACCESS_KEY) {
    next();
    return;
  }

  res.status(401).json({ error: "RoomSense access key is required." });
});

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, Math.round(next)));
}

function clampFloat(value: unknown, fallback: number, min: number, max: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, next));
}

app.get("/api/ai/health", (req, res) => {
  res.json({
    configured: isExternalAiConfigured(),
    provider: currentSettings.aiProviderLabel,
    model: currentSettings.aiModel,
    localOnly: !isExternalAiConfigured(),
    details: isExternalAiConfigured()
      ? "External AI is enabled through an OpenAI-compatible endpoint."
      : "Private local mode is active. No AI API traffic leaves this server."
  });
});

app.get("/api/gemini/health", (req, res) => {
  res.redirect(307, "/api/ai/health");
});

app.get("/api/ai/usage", (req, res) => {
  res.json(aiUsageSummary());
});

app.delete("/api/ai/usage", (req, res) => {
  aiUsageCalls = [];
  res.json({ success: true });
});

app.get("/api/status", (req, res) => {
  res.json({
    ...sensorStatus,
    externalAiActive: isExternalAiConfigured(),
    localOnly: !isExternalAiConfigured()
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
  sensorStatus.activeNodes = sensorStatus.cameraActive || sensorStatus.microphoneActive ? 1 : 0;
  res.json({ success: true, status: sensorStatus });
});

app.get("/api/events", (req, res) => {
  const limit = clampNumber(req.query.limit, eventsList.length, 1, 500);
  res.json([...eventsList].sort((a, b) => b.timestampMs - a.timestampMs).slice(0, limit));
});

app.post("/api/events", (req, res) => {
  const { eventType, confidence, message, audioLevel, snapshotUrl, metadata } = req.body;
  if (typeof eventType !== "string" || eventType.length > 60) {
    res.status(400).json({ error: "eventType is required and must be a short string." });
    return;
  }

  const newEvent: EventLog = {
    id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestampMs: Date.now(),
    eventType,
    confidence: clampFloat(confidence, 1, 0, 1),
    message: typeof message === "string" ? message.slice(0, 600) : "Activity flagged.",
    audioLevel: typeof audioLevel === "number" ? audioLevel : undefined,
    snapshotUrl: typeof snapshotUrl === "string" ? snapshotUrl : undefined,
    metadata: metadata && typeof metadata === "object" ? metadata : undefined
  };

  eventsList.push(newEvent);
  sensorStatus.latestEventTime = newEvent.timestampMs;

  const cutOffTime = Date.now() - currentSettings.retentionDays * 24 * 60 * 60 * 1000;
  eventsList = eventsList.filter(e => e.timestampMs > cutOffTime || e.id === "init-sys");

  res.json({ success: true, event: newEvent });
});

app.delete("/api/events", (req, res) => {
  eventsList = [
    {
      id: "clear-sys",
      timestampMs: Date.now(),
      eventType: "SYSTEM_INFO",
      confidence: 1.0,
      message: "Event database cleared and reset by user."
    }
  ];
  sensorStatus.latestEventTime = null;
  res.json({ success: true, message: "Logs successfully cleared." });
});

app.get("/api/settings", (req, res) => {
  res.json(currentSettings);
});

app.post("/api/settings", (req, res) => {
  currentSettings = sanitizeSettings(req.body);
  res.json({ success: true, settings: currentSettings });
});

app.post("/api/upload-frame", (req, res) => {
  const { dataUrl } = req.body;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/jpeg;base64,")) {
    res.status(400).json({ error: "dataUrl must be a JPEG data URL." });
    return;
  }

  latestCapturedFrame = { dataUrl, timestamp: Date.now() };
  res.json({ success: true, timestamp: latestCapturedFrame.timestamp });
});

app.get("/api/latest-frame", (req, res) => {
  if (!latestCapturedFrame) {
    res.json({ frame: null, message: "No snapshots captured yet." });
    return;
  }
  res.json({ frame: latestCapturedFrame.dataUrl, timestamp: latestCapturedFrame.timestamp });
});

app.post("/api/summarize", async (req, res) => {
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

  const fallback = getLocalSummary();
  const result = await callOpenAiCompatibleJson("summary", [
    {
      role: "system",
      content: "You summarize private home sensor logs. Return compact valid JSON only."
    },
    {
      role: "user",
      content: `Summarize these RoomSense logs for the home owner. JSON schema: {"summary": string, "importantChanges": string[], "attentionRequired": boolean, "reason": string}\n${JSON.stringify(recentLogs, null, 2)}`
    }
  ], fallback);

  res.json(result);
});

app.post("/api/analyze-frame", async (req, res) => {
  const targetFrame = req.body.frameBase64 || latestCapturedFrame?.dataUrl;
  if (!targetFrame) {
    res.status(400).json({ error: "No image has been sent or stored." });
    return;
  }

  const fallback = getLocalVision(targetFrame);
  const result = await callOpenAiCompatibleJson("vision", [
    {
      role: "system",
      content: "You analyze one private home sensor snapshot. Return compact valid JSON only."
    },
    {
      role: "user",
      content: [
        { type: "text", text: "Analyze the snapshot. JSON schema: {\"objects\": string[], \"anomalies\": string[], \"safetyCheckResult\": string, \"sceneDescription\": string}" },
        { type: "image_url", image_url: { url: targetFrame } }
      ]
    }
  ], fallback);

  res.json(result);
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  const listenHttp = () => {
    console.log(`[RoomSense AI] private local server running at http://localhost:${PORT}`);
    for (const ip of getLanIps()) {
      console.log(`[RoomSense AI] desktop/LAN URL: http://${ip}:${PORT}`);
    }
  };

  app.listen(PORT, "0.0.0.0", listenHttp);

  if (USE_HTTPS) {
    const cert = await generate(
      [{ name: "commonName", value: "RoomSense AI Local" }],
      {
        notAfterDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        keySize: 2048,
        extensions: [
          {
            name: "subjectAltName",
            altNames: [
              { type: 2 as const, value: "localhost" },
              { type: 7 as const, ip: "127.0.0.1" },
              ...getLanIps().map(ip => ({ type: 7 as const, ip }))
            ]
          }
        ]
      }
    );
    https.createServer({ key: cert.private, cert: cert.cert }, app).listen(HTTPS_PORT, "0.0.0.0", () => {
      console.log(`[RoomSense AI] phone camera URL: https://localhost:${HTTPS_PORT}`);
      for (const ip of getLanIps()) {
        console.log(`[RoomSense AI] phone camera URL: https://${ip}:${HTTPS_PORT}`);
      }
      console.log("[RoomSense AI] HTTPS uses a temporary local certificate. Your phone may ask you to continue once.");
    });
  }
}

startServer();

function getLanIps() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item): item is os.NetworkInterfaceInfo => Boolean(item && item.family === "IPv4" && !item.internal))
    .map(item => item.address);
}
