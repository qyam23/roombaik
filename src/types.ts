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
}

export interface ThresholdSettings {
  motionThreshold: number; // 0-100 threshold
  soundThreshold: number;  // 0-100 threshold
  captureOnMotion: boolean;
  captureOnSound: boolean;
  retentionDays: number;
  enableGeminiAlerts: boolean;
  geminiAnalysisOnDemand: boolean;
}
