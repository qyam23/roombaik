import { useState, useEffect } from "react";
import { Settings, Save, RefreshCw, Cpu, Volume2, ShieldAlert, Sparkles, CheckCircle } from "lucide-react";
import { ThresholdSettings } from "../types";
import { apiFetch } from "../api";

interface ControlSettingsProps {
  onSettingsSaved: (settings: ThresholdSettings) => void;
}

export default function ControlSettings({ onSettingsSaved }: ControlSettingsProps) {
  const [settings, setSettings] = useState<ThresholdSettings>({
    motionThreshold: 35,
    soundThreshold: 45,
    captureOnMotion: true,
    captureOnSound: true,
    retentionDays: 7,
    enableExternalAi: false,
    aiAnalysisOnDemand: true,
    aiProviderLabel: "OpenAI-compatible",
    aiModel: "local-rules"
  });
  
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/settings");
      const data = await res.json();
      setSettings(data);
    } catch (e) {
      console.error("Failed fetching settings:", e);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (data.success) {
        onSettingsSaved(data.settings);
        setMsg("Operational configurations synchronized completely.");
        setTimeout(() => setMsg(null), 3000);
      }
    } catch (e) {
      console.error("Failed saving settings:", e);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return (
    <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md max-w-4xl mx-auto">
      
      <div className="flex items-center justify-between mb-6 border-b border-slate-850 pb-4">
        <div>
          <h2 className="text-xl font-display font-medium text-slate-100 uppercase tracking-wide flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-400" />
            Node Operational Configurations
          </h2>
          <p className="text-xs text-slate-400 font-sans mt-0.5">
            Optimize motion vectors, sound decibel thresholds, and AI summarize rules.
          </p>
        </div>

        <button
          onClick={fetchSettings}
          disabled={loading}
          className="text-xs text-slate-400 hover:text-slate-100 p-2 rounded-lg border border-slate-800 hover:bg-slate-800/40 transition flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading && "animate-spin"}`} />
          <span>Reload</span>
        </button>
      </div>

      <div className="space-y-6">
        
        {/* Sliders Grid Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Motion Slider */}
          <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-200 font-display flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-400" />
                Motion Detection Sensitivity
              </span>
              <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 py-0.5 px-2 rounded">
                {settings.motionThreshold}% Limit
              </span>
            </div>
            <p className="text-xs text-slate-500 font-sans">
              Lower threshold values trigger alerts on minor pixel differences (e.g., visual wind/shadows).
            </p>
            <input
              type="range"
              min="10"
              max="90"
              value={settings.motionThreshold}
              onChange={(e) => setSettings({ ...settings, motionThreshold: parseInt(e.target.value, 10) })}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          {/* Sound Slider */}
          <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-200 font-display flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-indigo-400" />
                Microphone Trigger Amplitude
              </span>
              <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-500/10 py-0.5 px-2 rounded">
                {settings.soundThreshold}% Limit
              </span>
            </div>
            <p className="text-xs text-slate-500 font-sans">
              Threshold triggers SOUND_SPIKE when sound RMS exceeds limits. Lower matches soft whispering.
            </p>
            <input
              type="range"
              min="10"
              max="90"
              value={settings.soundThreshold}
              onChange={(e) => setSettings({ ...settings, soundThreshold: parseInt(e.target.value, 10) })}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>
        </div>

        {/* Binary Trigger Rules */}
        <div className="bg-slate-950/30 border border-slate-850 rounded-xl p-5 space-y-4">
          <span className="text-xs font-bold font-display uppercase tracking-wider text-slate-400 block">Trigger Integrations</span>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {/* Motion Snapshot trigger */}
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.captureOnMotion}
                onChange={(e) => setSettings({ ...settings, captureOnMotion: e.target.checked })}
                className="w-4.5 h-4.5 rounded text-blue-600 bg-slate-900 border-slate-805 accent-blue-500 mt-0.5 focus:ring-0 cursor-pointer"
              />
              <div className="space-y-0.5">
                <span className="font-display font-medium text-slate-200 block text-xs md:text-sm">Auto-Snap Camera on Motion</span>
                <span className="text-xs text-slate-500 block">Capture camera JPG frames to disk store when movement occurs.</span>
              </div>
            </label>

            {/* Sound Snapshot trigger */}
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.captureOnSound}
                onChange={(e) => setSettings({ ...settings, captureOnSound: e.target.checked })}
                className="w-4.5 h-4.5 rounded text-indigo-600 bg-slate-900 border-slate-805 accent-indigo-500 mt-0.5 focus:ring-0 cursor-pointer"
              />
              <div className="space-y-0.5">
                <span className="font-display font-medium text-slate-200 block text-xs md:text-sm">Auto-Snap Camera on Noise</span>
                <span className="text-xs text-slate-500 block">Record image frame snapshots when loud spikes trigger the mic.</span>
              </div>
            </label>
          </div>
        </div>

        {/* Data retention & AI features */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Data retention days selector */}
          <div className="bg-slate-950/30 border border-slate-850 p-5 rounded-xl space-y-3">
            <span className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400 block">Retention Policy</span>
            <p className="text-xs text-slate-500">
              Auto-prune old visual event data records after selected interval to preserve memory bounds.
            </p>
            <select
              value={settings.retentionDays}
              onChange={(e) => setSettings({ ...settings, retentionDays: parseInt(e.target.value, 10) })}
              className="w-full bg-slate-900 border border-slate-800 text-slate-200 py-2.5 px-3 rounded-lg text-xs md:text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="3">3 Days (Optimized Memory)</option>
              <option value="7">7 Days (Weekly History)</option>
              <option value="15">15 Days (Extended History)</option>
            </select>
          </div>

          {/* Optional AI provider rules */}
          <div className="bg-slate-950/30 border border-slate-850 p-5 rounded-xl space-y-3">
            <span className="text-xs font-bold font-display uppercase tracking-wider text-slate-400 block">AI Intelligent Analytics</span>
            <p className="text-xs text-slate-500">
              Default is private local rules. Enable this only after configuring an OpenAI-compatible endpoint in .env.local.
            </p>
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs text-slate-300 font-display flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                External AI Summaries & Vision
              </span>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.enableExternalAi}
                  onChange={(e) => setSettings({ ...settings, enableExternalAi: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 rounded-full peer peer-focus:ring-0 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-300 after:border-slate-800 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[10px] font-mono uppercase text-slate-500">Provider Label</span>
                <input
                  value={settings.aiProviderLabel}
                  onChange={(e) => setSettings({ ...settings, aiProviderLabel: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 text-slate-200 py-2 px-3 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-mono uppercase text-slate-500">Model Name</span>
                <input
                  value={settings.aiModel}
                  onChange={(e) => setSettings({ ...settings, aiModel: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 text-slate-200 py-2 px-3 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                />
              </label>
            </div>
          </div>

        </div>

        {/* Action button saved banner */}
        <div className="flex items-center justify-end gap-4 border-t border-slate-850 pt-6">
          {msg && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-sans">
              <CheckCircle className="w-4 h-4 animate-bounce" />
              <span>{msg}</span>
            </div>
          )}

          <button
            onClick={saveSettings}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-550 disabled:opacity-50 text-white font-medium font-display text-xs md:text-sm shadow-md transition cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Synchronizing Configuration..." : "Save Operational Configuration"}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
