export type EventType = 
  | 'MOTION_DETECTED' 
  | 'SOUND_SPIKE' 
  | 'OBJECT_DETECTED' 
  | 'SCENE_CHANGED' 
  | 'SYSTEM_INFO' 
  | 'ERROR';

export interface DetectionEvent {
  id: string;
  timestampMs: number;
  eventType: EventType;
  confidence: number;
  message: string;
  snapshotUrl?: string; // Data URL or relative API path
  audioLevel?: number;   // Calculated RMS level
  metadata?: Record<string, any>;
}

export interface SensorStatus {
  monitoring: boolean;
  cameraActive: boolean;
  microphoneActive: boolean;
  apiActive: boolean;
  activeNodes: number;
  fps: number;
  latestEventTime: number | null;
  currentAudioLevel: number;
  currentMotionLevel: number;
  externalAiActive?: boolean;
  localOnly?: boolean;
}

export interface ThresholdSettings {
  motionThreshold: number; // 0-100 threshold
  soundThreshold: number;  // 0-100 threshold
  captureOnMotion: boolean;
  captureOnSound: boolean;
  retentionDays: number;
  enableExternalAi: boolean;
  aiAnalysisOnDemand: boolean;
  aiProviderLabel: string;
  aiModel: string;
}

export interface AiUsageCall {
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

export interface AiUsageSummary {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  bytesIn: number;
  bytesOut: number;
  recentCalls: AiUsageCall[];
}
