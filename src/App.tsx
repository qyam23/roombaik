import { useState, useEffect } from "react";
import { Shield, LayoutDashboard, Terminal, Settings, Radio, Cpu, Bell, CheckCircle, Wifi, Heart } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SensorStatus, DetectionEvent, ThresholdSettings } from "./types";

import SensorNode from "./components/SensorNode";
import Dashboard from "./components/Dashboard";
import EventsTable from "./components/EventsTable";
import ControlSettings from "./components/ControlSettings";

export default function App() {
  const [activeTab, setActiveTab] = useState<"sensor" | "dashboard" | "logs" | "settings">("sensor");
  
  // App-wide synchronized database states
  const [currentStatus, setCurrentStatus] = useState<SensorStatus>({
    monitoring: false,
    cameraActive: false,
    microphoneActive: false,
    apiActive: true,
    activeNodes: 0,
    fps: 0,
    latestEventTime: null,
    currentAudioLevel: 0,
    currentMotionLevel: 0
  });

  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [settings, setSettings] = useState<ThresholdSettings>({
    motionThreshold: 35,
    soundThreshold: 45,
    captureOnMotion: true,
    captureOnSound: true,
    retentionDays: 7,
    enableGeminiAlerts: true,
    geminiAnalysisOnDemand: true
  });

  // Recent banner alert notification state
  const [activeAlert, setActiveAlert] = useState<DetectionEvent | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      setCurrentStatus(prev => ({
        ...prev,
        ...data
      }));
    } catch (e) {
      console.error("Failed fetching standard operational status:", e);
    }
  };

  const fetchEvents = async () => {
    try {
      const res = await fetch("/api/events");
      const data = await res.json();
      setEvents(data);
    } catch (e) {
      console.error("Failed fetching occurrences logs:", e);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setSettings(data);
    } catch (e) {
      console.error("Failed fetching settings parameters:", e);
    }
  };

  const syncStatusChange = (updated: Partial<SensorStatus>) => {
    setCurrentStatus(prev => ({
      ...prev,
      ...updated
    }));
  };

  // Helper: Trigger event creation and push to backend
  const handleEventTriggered = async (eventData: Omit<DetectionEvent, "id" | "timestampMs">) => {
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventData)
      });
      const data = await res.json();
      if (data.success) {
        // Sync local logs array
        setEvents(prev => [data.event, ...prev]);
        
        // Exclude system info alerts from popping intrusive banners
        if (eventData.eventType !== "SYSTEM_INFO") {
          setActiveAlert(data.event);
          // Play ambient audio chime if browser allowed
          try {
            const context = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = context.createOscillator();
            const gain = context.createGain();
            osc.connect(gain);
            gain.connect(context.destination);
            osc.type = "sine";
            osc.frequency.setValueAtTime(eventData.eventType === "SOUND_SPIKE" ? 620 : 880, context.currentTime);
            gain.gain.setValueAtTime(0.08, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
            osc.start();
            osc.stop(context.currentTime + 0.35);
          } catch (_) {}

          // Fade alerting toast after 4 seconds
          setTimeout(() => {
            setActiveAlert(null);
          }, 4500);
        }
      }
    } catch (e) {
      console.error("Failed synchronizing logged events:", e);
    }
  };

  const handleClearLogs = async () => {
    try {
      const res = await fetch("/api/events", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchEvents();
      }
    } catch (e) {
      console.error("Failed formatting database logs drive:", e);
    }
  };

  // Initial Boot loader
  useEffect(() => {
    fetchStatus();
    fetchEvents();
    fetchSettings();

    // Event loops to keep logs synchronized
    const statusTimer = setInterval(fetchStatus, 3000);
    const eventsTimer = setInterval(fetchEvents, 4500);

    return () => {
      clearInterval(statusTimer);
      clearInterval(eventsTimer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#080a0d] text-slate-100 flex flex-col font-sans select-none selection:bg-blue-600/30">
      
      {/* Intrusive Active Alarm Notification Toast Banner */}
      <AnimatePresence>
        {activeAlert && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92, y: -20 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-lg bg-red-950/90 border border-red-500/30 py-4 px-5 rounded-2xl flex items-start gap-4 shadow-[#000000_0px_10px_40px_-10px] backdrop-blur-md"
          >
            <Bell className="w-5 h-5 text-red-400 animate-bounce mt-0.5 shrink-0" />
            <div className="flex-grow space-y-0.5">
              <span className="font-display font-semibold text-red-105 text-sm uppercase tracking-wider block">
                Activity Alarm Tripped
              </span>
              <span className="text-xs text-slate-300 leading-relaxed block font-sans">
                {activeAlert.message}
              </span>
              <span className="text-[9px] font-mono text-red-400 block tracking-widest uppercase mt-1">
                INTEGRITY CONFIDENCE VALUE: {(activeAlert.confidence * 100).toFixed(0)}% // DEVIATION
              </span>
            </div>
            <button
              onClick={() => setActiveAlert(null)}
              className="text-slate-500 hover:text-slate-350 font-display text-xs px-2 py-1 transition cursor-pointer"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modern High-Performance Navigation Header Bar */}
      <header className="border-b border-slate-900 bg-slate-950/60 backdrop-blur-md sticky top-0 z-40 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Logo Brand Signature */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Shield className="w-5.5 h-5.5 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-display font-bold tracking-tight text-white uppercase">
                  RoomSense AI
                </h1>
                <span className="bg-blue-600/10 border border-blue-500/20 text-blue-400 py-0.5 px-1.5 rounded font-mono text-[9px] font-semibold uppercase">
                  v1.0 MVP
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-mono tracking-wider uppercase">
                Visible Smart Sensor Hub & Audio-Visual Assessment Node
              </p>
            </div>
          </div>

          {/* Quick Stats Ticker */}
          <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-850/60 p-2 rounded-xl">
              <span className={`w-2 h-2 rounded-full ${currentStatus.monitoring ? "bg-green-500 animate-pulse" : "bg-slate-600"}`} />
              <span className="text-slate-200">
                SENSOR: {currentStatus.monitoring ? "ONLINE" : "OFFLINE"}
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-850/60 p-2 rounded-xl">
              <Wifi className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-slate-205">
                API GATE: ACTIVE
              </span>
            </div>
          </div>

        </div>
      </header>

      {/* Main Container Content */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 md:px-8 py-8 space-y-8 relative">
        
        {/* Navigation Tabs Controller */}
        <div className="flex flex-wrap items-center gap-2 max-w-md bg-slate-950/50 border border-slate-850 p-1.5 rounded-2xl">
          <button
            onClick={() => setActiveTab("sensor")}
            className={`flex-grow flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-display text-xs font-medium cursor-pointer transition duration-300 ${
              activeTab === "sensor"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/10 font-bold"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Sensor Mode</span>
          </button>

          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex-grow flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-display text-xs font-medium cursor-pointer transition duration-300 ${
              activeTab === "dashboard"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/10 font-bold"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab("logs")}
            className={`flex-grow flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-display text-xs font-medium cursor-pointer transition duration-300 relative ${
              activeTab === "logs"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/10 font-bold"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Event Logs</span>
            {events.length > 2 && (
              <span className="absolute -top-1 -right-1 bg-indigo-500 text-white text-[9px] font-mono font-bold w-4 h-4 rounded-full flex items-center justify-center border border-slate-950 animate-pulse">
                {events.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            className={`flex-grow flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-display text-xs font-medium cursor-pointer transition duration-300 ${
              activeTab === "settings"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/10 font-bold"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>

        {/* Dynamic Nav Tabs renderer */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "sensor" && (
              <SensorNode
                settings={settings}
                currentStatus={currentStatus}
                onStatusUpdate={syncStatusChange}
                onEventTriggered={handleEventTriggered}
              />
            )}

            {activeTab === "dashboard" && (
              <Dashboard
                currentStatus={currentStatus}
                events={events}
                onTriggerSummary={fetchEvents}
              />
            )}

            {activeTab === "logs" && (
              <EventsTable
                events={events}
                onClearLogs={handleClearLogs}
                onRefreshLogs={fetchEvents}
              />
            )}

            {activeTab === "settings" && (
              <ControlSettings
                onSettingsSaved={(newSettings) => setSettings(newSettings)}
              />
            )}
          </motion.div>
        </AnimatePresence>

      </main>

      {/* Decorative Brand footer */}
      <footer className="border-t border-slate-900 bg-slate-950/40 py-8 relative mt-auto text-xs text-slate-500 font-sans">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="block font-display font-medium text-slate-405 uppercase">
              רומסנס AI &mdash; RoomSense AI Security Companion
            </span>
            <span className="block font-light">
              Explicit, visible guard sensor node respecting individual space privacy boundaries completely.
            </span>
          </div>

          <div className="flex items-center gap-1 font-mono text-[10px] uppercase">
            <span>Made with</span>
            <Heart className="w-3 h-3 text-red-500 fill-current animate-pulse" />
            <span>for secure homes</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
