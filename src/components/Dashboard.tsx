import { useEffect, useState } from "react";
import { Sparkles, Image, RefreshCw, AlertTriangle, CheckCircle, ShieldAlert, Cpu, Eye, Hourglass, Terminal } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AiUsageSummary, SensorStatus, DetectionEvent } from "../types";
import { apiFetch } from "../api";

interface DashboardProps {
  currentStatus: SensorStatus;
  events: DetectionEvent[];
  onTriggerSummary: () => void;
}

interface AiSummaryResponse {
  summary: string;
  importantChanges: string[];
  attentionRequired: boolean;
  reason: string;
}

interface AiVisionResponse {
  objects: string[];
  anomalies: string[];
  safetyCheckResult: string;
  sceneDescription: string;
}

export default function Dashboard({ currentStatus, events }: DashboardProps) {
  const [latestFrame, setLatestFrame] = useState<string | null>(null);
  const [frameTimestamp, setFrameTimestamp] = useState<number | null>(null);
  
  // State for AI Intelligence Summary
  const [summaryData, setSummaryData] = useState<AiSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // State for AI Vision Inspection
  const [visionData, setVisionData] = useState<AiVisionResponse | null>(null);
  const [visionLoading, setVisionLoading] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);

  // Health check of optional external AI keys
  const [aiHealth, setAiHealth] = useState<{ configured: boolean; details: string; provider?: string; model?: string; localOnly?: boolean }>({
    configured: false,
    details: ""
  });
  const [aiUsage, setAiUsage] = useState<AiUsageSummary | null>(null);

  const fetchLatestFrame = async () => {
    try {
      const res = await apiFetch("/api/latest-frame");
      const data = await res.json();
      if (data.frame) {
        setLatestFrame(data.frame);
        setFrameTimestamp(data.timestamp);
      } else {
        setLatestFrame(null);
      }
    } catch (e) {
      console.error("Failed fetching latest snapshot:", e);
    }
  };

  const fetchAiHealth = async () => {
    try {
      const res = await apiFetch("/api/ai/health");
      const data = await res.json();
      setAiHealth(data);
    } catch (e) {
      console.error("Failed fetching credentials check status:", e);
    }
  };

  const fetchAiUsage = async () => {
    try {
      const res = await apiFetch("/api/ai/usage");
      const data = await res.json();
      setAiUsage(data);
    } catch (e) {
      console.error("Failed fetching AI usage metrics:", e);
    }
  };

  const runAiSummary = async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await apiFetch("/api/summarize", { method: "POST" });
      if (!res.ok) throw new Error("Backend server returned an error.");
      const data = await res.json();
      setSummaryData(data);
      fetchAiUsage();
    } catch (e: any) {
      setSummaryError(e.message || "Failed running summary analysis. Please adjust API key settings.");
    } finally {
      setSummaryLoading(false);
    }
  };

  const runVisionAnalysis = async () => {
    if (!latestFrame) return;
    setVisionLoading(true);
    setVisionError(null);
    try {
      const res = await apiFetch("/api/analyze-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameBase64: latestFrame })
      });
      if (!res.ok) throw new Error("Backend server failed to process the inspection.");
      const data = await res.json();
      setVisionData(data);
      fetchAiUsage();
    } catch (e: any) {
      setVisionError(e.message || "Failed examining baseline frame.");
    } finally {
      setVisionLoading(false);
    }
  };

  useEffect(() => {
    fetchLatestFrame();
    fetchAiHealth();
    fetchAiUsage();
    // Setup automated interval to fetch snapshots from server store
    const timer = setInterval(fetchLatestFrame, 3500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-6">
      
      {/* 1. Status Indicator Header Panel */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Monitoring State */}
        <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl flex items-center justify-between backdrop-blur-md">
          <div className="space-y-1">
            <span className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">Acoustic Guard Status</span>
            <div className="text-lg font-display font-medium text-slate-100 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${currentStatus.monitoring ? "bg-green-500 animate-pulse" : "bg-slate-650"}`} />
              {currentStatus.monitoring ? "Scanning Active" : "Suspended"}
            </div>
          </div>
          <Cpu className={`w-8 h-8 ${currentStatus.monitoring ? "text-blue-400 rotate-spin" : "text-slate-600"}`} />
        </div>

        {/* Cam State */}
        <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl flex items-center justify-between backdrop-blur-md">
          <div className="space-y-1">
            <span className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">Visual Guard Mode</span>
            <div className="text-lg font-display font-medium text-slate-100">
              {currentStatus.cameraActive ? "Camera Live" : "Deactivated"}
            </div>
          </div>
          <Eye className={`w-8 h-8 ${currentStatus.cameraActive ? "text-indigo-400 animate-pulse" : "text-slate-600"}`} />
        </div>

        {/* Active Nodes */}
        <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl flex items-center justify-between backdrop-blur-md">
          <div className="space-y-1">
            <span className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">Active Core Nodes</span>
            <div className="text-lg font-display font-medium text-slate-100">
              {currentStatus.activeNodes} Node Registered
            </div>
          </div>
          <Terminal className="w-8 h-8 text-blue-500" />
        </div>

        {/* AI Engine Check */}
        <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl flex items-center justify-between backdrop-blur-md">
          <div className="space-y-1">
            <span className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">Optional AI Engine</span>
            <div className={`text-sm font-display font-medium ${aiHealth.configured ? "text-blue-400 font-semibold" : "text-emerald-400"}`}>
              {aiHealth.configured ? "External API Enabled" : "Private Local Mode"}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">{aiHealth.model || "local-rules"}</div>
          </div>
          <Sparkles className={`w-6 h-6 ${aiHealth.configured ? "text-blue-400 animate-bounce" : "text-emerald-500"}`} />
        </div>
      </div>

      {/* 2. AI Live Room Summary Panel */}
      <div className="bg-slate-900/30 border border-slate-850 p-6 rounded-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-display font-medium text-slate-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400" />
              Private AI Ambient Summary
            </h3>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              Uses local rules by default. External AI only runs if you enable and configure an OpenAI-compatible endpoint.
            </p>
          </div>
          <button
            onClick={runAiSummary}
            disabled={summaryLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600/90 hover:bg-blue-600 text-white font-medium font-display text-sm disabled:opacity-50 transition cursor-pointer"
          >
            {summaryLoading ? <Hourglass className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>{summaryData ? "Recalculate Summary" : "Generate AI Summary"}</span>
          </button>
        </div>

        {summaryError && (
          <div className="bg-red-950/20 border border-red-900/50 p-4 rounded-xl text-xs text-red-300">
            {summaryError}
          </div>
        )}

        <AnimatePresence mode="wait">
          {summaryLoading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-12 flex flex-col items-center justify-center text-center space-y-3"
            >
              <div className="flex space-x-2">
                <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <p className="text-xs text-slate-400 font-mono tracking-wider">
                ANALYZING LOCAL SECURITY LOG ARRAYS...
              </p>
            </motion.div>
          ) : summaryData ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4"
            >
              {/* Attention flag banner */}
              <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                summaryData.attentionRequired 
                  ? "bg-red-955/20 border-red-800/40 text-red-105" 
                  : "bg-green-955/20 border-green-800/40 text-green-105"
              }`}>
                {summaryData.attentionRequired ? (
                  <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="text-sm font-semibold font-display">
                    {summaryData.attentionRequired ? "Ambient Alert: Review Required" : "Security State Verified: Secure"}
                  </div>
                  <div className="text-xs text-slate-350 mt-1">{summaryData.reason}</div>
                </div>
              </div>

              {/* Summary paragraph */}
              <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850/60 text-sm leading-relaxed text-slate-200">
                {summaryData.summary}
              </div>

              {/* Structural Bullet points of shifts */}
              {summaryData.importantChanges.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold font-display text-slate-400 block tracking-wider uppercase">Key Chronological Shifts</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {summaryData.importantChanges.map((change, idx) => (
                      <div key={idx} className="bg-slate-950/20 border border-slate-900 p-3 rounded-lg text-xs flex items-center gap-2 text-slate-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        <span>{change}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <div className="border border-dashed border-slate-800 py-8 text-center text-slate-500 rounded-xl">
              <Sparkles className="w-8 h-8 mx-auto text-slate-700 mb-2" />
              <p className="text-sm font-display">Intel summary engine awaiting query</p>
              <p className="text-xs text-slate-650 max-w-sm mx-auto mt-0.5">
                Click "Generate AI Summary" to parse local security logs and get automated status outputs.
              </p>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. AI Traffic Meter */}
      <div className="bg-slate-900/30 border border-slate-850 p-6 rounded-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-display font-medium text-slate-100 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-emerald-400" />
              AI Token & Traffic Meter
            </h3>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              Counts estimated local fallback tokens and real provider usage when an external API returns usage metadata.
            </p>
          </div>
          <button onClick={fetchAiUsage} className="text-xs text-slate-400 flex items-center gap-1 hover:text-slate-100 cursor-pointer">
            <RefreshCw className="w-3 h-3" />
            Refresh Usage
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          {[
            ["Requests", aiUsage?.requests ?? 0],
            ["Prompt Tokens", aiUsage?.promptTokens ?? 0],
            ["Output Tokens", aiUsage?.completionTokens ?? 0],
            ["Bytes In", aiUsage?.bytesIn ?? 0],
            ["Bytes Out", aiUsage?.bytesOut ?? 0]
          ].map(([label, value]) => (
            <div key={label} className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono block">{label}</span>
              <span className="text-lg text-slate-100 font-display font-semibold">{Number(value).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Visual Snapshot & AI Vision Check Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Side: Capture Frame View */}
        <div className="bg-slate-900/40 border border-slate-800/80 p-6 rounded-2xl flex flex-col justify-between backdrop-blur-md">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-display font-medium text-slate-100 flex items-center gap-2">
                <Image className="w-5 h-5 text-indigo-400" />
                Latest Guard Snapshot
              </h3>
              <button 
                onClick={fetchLatestFrame}
                className="text-xs text-slate-400 flex items-center gap-1 hover:text-slate-100 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh Snapshot Store
              </button>
            </div>
            <p className="text-xs text-slate-500 font-sans mb-4">
              Real-time snapshot stored locally when sensor thresholds are breached.
            </p>
          </div>

          <div className="bg-slate-950/70 border border-slate-900 rounded-xl overflow-hidden aspect-video flex items-center justify-center relative min-h-[220px]">
            {latestFrame ? (
              <img src={latestFrame} alt="Latest guard frame" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center p-6 text-slate-500 space-y-2">
                <Image className="w-10 h-10 mx-auto text-slate-750" />
                <p className="text-xs font-display">No alarm frames recorded yet</p>
              </div>
            )}

            {latestFrame && frameTimestamp && (
              <div className="absolute bottom-3 right-3 bg-slate-950/80 border border-slate-850 backdrop-blur-md font-mono text-[9px] text-indigo-300 py-0.5 px-2 rounded">
                CAPTURED: {new Date(frameTimestamp).toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: AI Vision Analysis Module */}
        <div className="bg-slate-900/40 border border-slate-800/80 p-6 rounded-2xl flex flex-col justify-between backdrop-blur-md">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-display font-medium text-slate-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-400" />
                AI Vision Scene Inspection
              </h3>
            </div>
            <p className="text-xs text-slate-500 font-sans mb-4">
              Keeps the frame local unless an external provider is explicitly configured and enabled.
            </p>
          </div>

          <div className="bg-slate-950/30 border border-slate-850 rounded-xl p-4 flex-grow flex flex-col justify-center">
            <AnimatePresence mode="wait">
              {visionLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="flex space-x-2">
                    <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <p className="text-xs text-slate-400 font-mono tracking-wider uppercase">
                    Inspecting snapshot through the configured AI path...
                  </p>
                </div>
              ) : visionData ? (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  {/* Status Banner */}
                  <div className="flex items-center justify-between border-b border-slate-850 pb-3">
                    <span className="text-xs text-slate-405 font-display uppercase tracking-wide">Scene Verification</span>
                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                      visionData.safetyCheckResult === "Secure" 
                        ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                        : "bg-red-500/10 text-red-400 border border-red-500/20"
                    }`}>
                      {visionData.safetyCheckResult}
                    </span>
                  </div>

                  {/* Scene Description Output */}
                  <div className="text-xs font-sans text-slate-300 bg-slate-950/50 p-3 rounded-lg leading-relaxed italic border border-slate-900">
                    "{visionData.sceneDescription}"
                  </div>

                  {/* Objects and Anomalies Grid */}
                  <div className="grid grid-cols-2 gap-4 text-[11px]">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-405 block mb-1">Identified Entities</span>
                      <div className="flex flex-wrap gap-1.5">
                        {visionData.objects.map((obj, i) => (
                          <span key={i} className="bg-slate-900 border border-slate-800 text-slate-350 py-0.5 px-2 rounded-md">
                            {obj}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] font-semibold text-slate-405 block mb-1">Alerts / Deviations</span>
                      <div className="space-y-1">
                        {visionData.anomalies.map((anom, i) => (
                          <div key={i} className="text-red-300 flex items-start gap-1">
                            <span className="mt-0.5 shrink-0 text-red-400">!</span>
                            <span>{anom}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="text-center py-8 text-slate-650 space-y-3">
                  <CheckCircle className="w-8 h-8 mx-auto text-slate-800" />
                  <p className="text-xs font-display">Awaiting camera snapshot selection</p>
                </div>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-4">
            <button
              onClick={runVisionAnalysis}
              disabled={visionLoading || !latestFrame}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-650 hover:bg-indigo-600 disabled:opacity-40 disabled:hover:bg-indigo-650 text-white font-medium font-display text-sm transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Inspect Latest Frame</span>
            </button>
          </div>
        </div>
        
      </div>

    </div>
  );
}
