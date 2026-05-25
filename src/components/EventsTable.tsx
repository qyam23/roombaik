import { useState } from "react";
import { Trash2, ShieldAlert, Cpu, Eye, Volume2, HelpCircle, Terminal, RefreshCw } from "lucide-react";
import { DetectionEvent, EventType } from "../types";

interface EventsTableProps {
  events: DetectionEvent[];
  onClearLogs: () => void;
  onRefreshLogs: () => void;
}

export default function EventsTable({ events, onClearLogs, onRefreshLogs }: EventsTableProps) {
  const [filter, setFilter] = useState<string>("ALL");

  const getEventIcon = (type: EventType) => {
    switch (type) {
      case "MOTION_DETECTED":
        return <Eye className="w-4 h-4 text-blue-400" />;
      case "SOUND_SPIKE":
        return <Volume2 className="w-4 h-4 text-indigo-400" />;
      case "SYSTEM_INFO":
        return <Terminal className="w-4 h-4 text-emerald-400" />;
      case "SCENE_CHANGED":
        return <Cpu className="w-4 h-4 text-purple-400" />;
      case "ERROR":
        return <ShieldAlert className="w-4 h-4 text-red-400" />;
      default:
        return <HelpCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  const getEventBadgeClass = (type: EventType) => {
    switch (type) {
      case "MOTION_DETECTED":
        return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
      case "SOUND_SPIKE":
        return "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20";
      case "SYSTEM_INFO":
        return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      case "SCENE_CHANGED":
        return "bg-purple-500/10 text-purple-400 border border-purple-500/20";
      case "ERROR":
        return "bg-red-500/10 text-red-400 border border-red-500/20";
      default:
        return "bg-slate-500/10 text-slate-400 border border-slate-500/20";
    }
  };

  const filteredEvents = filter === "ALL" 
    ? events 
    : events.filter(e => e.eventType === filter);

  return (
    <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
      
      {/* Table header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-display font-medium text-slate-100 uppercase tracking-wide">
            Telemetry Chronological Event Logs
          </h2>
          <p className="text-xs text-slate-500 font-sans mt-0.5">
            Decentralized record logs registered by operational sensor nodes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefreshLogs}
            className="flex items-center gap-1.5 px-3.5 py-2 hover:bg-slate-800/50 text-slate-400 hover:text-slate-100 rounded-xl transition duration-300 font-display text-xs border border-slate-800 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync Logs</span>
          </button>

          <button
            onClick={onClearLogs}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-red-950/20 hover:bg-red-950/40 text-red-400 hover:text-red-300 rounded-xl border border-red-800/20 hover:border-red-800/40 transition duration-300 font-display text-xs cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Format Log Drive</span>
          </button>
        </div>
      </div>

      {/* Filter tab selectors */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-850 pb-4">
        {["ALL", "MOTION_DETECTED", "SOUND_SPIKE", "SCENE_CHANGED", "SYSTEM_INFO"].map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-display transition duration-300 cursor-pointer ${
              filter === tab
                ? "bg-blue-600 text-white font-medium"
                : "bg-slate-950/40 text-slate-410 border border-slate-850 hover:text-slate-200 hover:border-slate-800"
            }`}
          >
            {tab.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Logs Table */}
      <div className="overflow-x-auto">
        {filteredEvents.length > 0 ? (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-850 text-slate-405 font-mono text-[10px] tracking-widest uppercase">
                <th className="pb-3 font-semibold">Registered Timestamp</th>
                <th className="pb-3 font-semibold">Alert Class</th>
                <th className="pb-3 font-semibold">Integrity / Confidence</th>
                <th className="pb-3 font-semibold">Diagnostic Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850/60 font-sans text-xs">
              {filteredEvents.map((event) => (
                <tr key={event.id} className="hover:bg-slate-950/25 transition duration-150">
                  <td className="py-3.5 text-slate-350 font-mono text-[11px]">
                    {new Date(event.timestampMs).toLocaleDateString()} &mdash;{" "}
                    {new Date(event.timestampMs).toLocaleTimeString()}
                  </td>
                  <td className="py-3.5">
                    <span className={`inline-flex items-center gap-1 py-1 px-2 rounded-md font-mono text-[10px] uppercase font-medium ${getEventBadgeClass(event.eventType)}`}>
                      {getEventIcon(event.eventType)}
                      {event.eventType.replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-3.5 text-slate-350">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-900">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${event.confidence * 100}%` }}
                        />
                      </div>
                      <span className="font-mono text-[11px] text-blue-400/90 font-semibold">
                        {(event.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 text-slate-200 leading-relaxed font-sans font-light">
                    {event.message}
                    {event.audioLevel !== undefined && (
                      <span className="text-[10px] font-mono block text-slate-500 mt-1 uppercase">
                        RMS AMPLITUDE LEVEL: {event.audioLevel.toFixed(2)} Index
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="border border-dashed border-slate-800 py-12 text-center text-slate-550 rounded-xl">
            <Cpu className="w-10 h-10 mx-auto text-slate-800 mb-2" />
            <p className="text-sm font-display font-medium text-slate-400">Empty Filter Registry</p>
            <p className="text-xs text-slate-650 mt-0.5">
              No matching diagnostic alerts meet current filter classifications.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
