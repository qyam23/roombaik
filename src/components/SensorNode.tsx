import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Volume2, VolumeX, Shield, Play, Square, Settings, Wifi } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ThresholdSettings, SensorStatus, DetectionEvent } from "../types";
import { apiFetch } from "../api";

interface SensorNodeProps {
  settings: ThresholdSettings;
  onStatusUpdate: (status: Partial<SensorStatus>) => void;
  onEventTriggered: (event: Omit<DetectionEvent, "id" | "timestampMs">) => void;
  currentStatus: SensorStatus;
}

export default function SensorNode({
  settings,
  onStatusUpdate,
  onEventTriggered,
  currentStatus
}: SensorNodeProps) {
  const [active, setActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioAnalRef = useRef<AnalyserNode | null>(null);
  const streamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Canvas for frame differencing motion detection
  const processingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  
  // Rate limiting to prevent event floods
  const lastMotionEventTimeRef = useRef<number>(0);
  const lastSoundEventTimeRef = useRef<number>(0);

  // Toggle sensor monitoring
  const toggleMonitoring = async () => {
    if (active) {
      stopMonitoring();
    } else {
      await startMonitoring();
    }
  };

  const startMonitoring = async () => {
    setErrorMsg(null);
    try {
      // 1. Request user media permissions explicitly
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "environment" },
        audio: true
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // 2. Initialize Web Audio API for noise levels
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      audioAnalRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      streamSourceRef.current = source;
      source.connect(analyser);

      setActive(true);
      onStatusUpdate({
        monitoring: true,
        cameraActive: true,
        microphoneActive: true,
      });

      // Synchronize with API backend express server
      await apiFetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monitoring: true,
          cameraActive: true,
          microphoneActive: true,
        })
      });

      // Log initial operational telemetry
      onEventTriggered({
        eventType: "SYSTEM_INFO",
        confidence: 1.0,
        message: "Telemetry sensor node startup completed. Active room security scanning initialized."
      });

    } catch (err: any) {
      console.error("Camera/Mic access denied or failed:", err);
      setErrorMsg("Failed to access Camera or Microphone. Please grant browser permissions first.");
      setActive(false);
      onStatusUpdate({
        monitoring: false,
        cameraActive: false,
        microphoneActive: false
      });
    }
  };

  const stopMonitoring = async () => {
    // Stop all media tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // Stop audio context
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close();
    }
    audioCtxRef.current = null;
    audioAnalRef.current = null;
    streamSourceRef.current = null;

    // Clear frame difference memory
    prevFrameDataRef.current = null;

    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }

    setActive(false);
    onStatusUpdate({
      monitoring: false,
      cameraActive: false,
      microphoneActive: false,
      currentAudioLevel: 0,
      currentMotionLevel: 0
    });

    // Notify backend
    await apiFetch("/api/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        monitoring: false,
        cameraActive: false,
        microphoneActive: false,
        currentAudioLevel: 0,
        currentMotionLevel: 0
      })
    });

    onEventTriggered({
      eventType: "SYSTEM_INFO",
      confidence: 1.0,
      message: "Sensor node deactivated cleanly. Offline state."
    });
  };

  // Run analyzing loop
  useEffect(() => {
    if (!active) return;

    let frameCount = 0;
    let lastFpsCalc = Date.now();

    const processingCanvas = processingCanvasRef.current || document.createElement("canvas");
    processingCanvas.width = 160;
    processingCanvas.height = 120;
    processingCanvasRef.current = processingCanvas;
    const ctx = processingCanvas.getContext("2d", { willReadFrequently: true });

    const analyzeLoop = () => {
      if (!ctx || !videoRef.current) {
        requestRef.current = requestAnimationFrame(analyzeLoop);
        return;
      }

      const now = Date.now();

      // --- 1. FPS Tracker ---
      frameCount++;
      if (now - lastFpsCalc >= 1000) {
        const calculatedFps = Math.round((frameCount * 1000) / (now - lastFpsCalc));
        onStatusUpdate({ fps: calculatedFps });
        frameCount = 0;
        lastFpsCalc = now;
      }

      // --- 2. Real-Time Audio (RMS) Analysis ---
      let audioLevel = 0;
      if (audioAnalRef.current) {
        const bufferLength = audioAnalRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        audioAnalRef.current.getByteTimeDomainData(dataArray);

        // Compute Root Mean Square (RMS) of window values
        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          const norm = (dataArray[i] - 128) / 128; // Normalize to [-1.0, 1.0]
          sumSquares += norm * norm;
        }
        audioLevel = Math.round(Math.sqrt(sumSquares / bufferLength) * 100);
        onStatusUpdate({ currentAudioLevel: audioLevel });
      }

      // --- 3. Camera Motion Differencing ---
      let motionLevel = 0;
      if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        ctx.drawImage(videoRef.current, 0, 0, 160, 120);
        const currentFrameData = ctx.getImageData(0, 0, 160, 120).data;

        if (prevFrameDataRef.current) {
          let totalDiff = 0;
          const pixelCount = currentFrameData.length / 4;

          // Compare grayscaled changes at steps
          for (let i = 0; i < currentFrameData.length; i += 8) {
            const r1 = currentFrameData[i];
            const g1 = currentFrameData[i + 1];
            const b1 = currentFrameData[i + 2];

            const r2 = prevFrameDataRef.current[i];
            const g2 = prevFrameDataRef.current[i + 1];
            const b2 = prevFrameDataRef.current[i + 2];

            const brightness1 = (r1 + g1 + b1) / 3;
            const brightness2 = (r2 + g2 + b2) / 3;

            if (Math.abs(brightness1 - brightness2) > 20) {
              totalDiff++;
            }
          }

          // Compute percentage change out of 100
          motionLevel = Math.round((totalDiff / (pixelCount / 2)) * 100);
          onStatusUpdate({ currentMotionLevel: motionLevel });
        }

        prevFrameDataRef.current = currentFrameData;
      }

      // --- 4. Event Logic & Snapshot Uploads ---
      
      // Trigger: Loud Sound Spikes
      if (audioLevel >= settings.soundThreshold && now - lastSoundEventTimeRef.current > 5000) {
        lastSoundEventTimeRef.current = now;
        
        // Push event to table
        onEventTriggered({
          eventType: "SOUND_SPIKE",
          confidence: Math.min(0.5 + audioLevel / 200, 1.0),
          message: `Loud spike detected! Intrusive level measured at ${audioLevel} decibel index.`,
          audioLevel: audioLevel / 100
        });

        // Trigger auto image capture if configured
        if (settings.captureOnSound) {
          triggerSnapshotCapture("Sound threshold exceeded");
        }
      }

      // Trigger: Visual Movement Motion
      if (motionLevel >= settings.motionThreshold && now - lastMotionEventTimeRef.current > 5000) {
        lastMotionEventTimeRef.current = now;

        onEventTriggered({
          eventType: "MOTION_DETECTED",
          confidence: Math.min(0.6 + motionLevel / 150, 1.0),
          message: `Movement in visual frame! Activity index calculated at ${motionLevel}%.`
        });

        if (settings.captureOnMotion) {
          triggerSnapshotCapture("Motion threshold exceeded");
        }
      }

      requestRef.current = requestAnimationFrame(analyzeLoop);
    };

    requestRef.current = requestAnimationFrame(analyzeLoop);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [active, settings, onStatusUpdate, onEventTriggered]);

  // Clean-up on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Helper: Captures Snapshot from Video Node and Uploads it to HTTP server
  const triggerSnapshotCapture = async (triggerReason: string) => {
    if (!videoRef.current) return;
    
    try {
      const snapCanvas = document.createElement("canvas");
      snapCanvas.width = 640;
      snapCanvas.height = 480;
      const snapCtx = snapCanvas.getContext("2d");
      
      if (snapCtx) {
        snapCtx.drawImage(videoRef.current, 0, 0, 640, 480);
        const dataUrl = snapCanvas.toDataURL("image/jpeg", 0.7);
        
        // POST base64 data to Express API Store
        await apiFetch("/api/upload-frame", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl, reason: triggerReason })
        });
      }
    } catch (e) {
      console.error("Failed capturing snap frame:", e);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md relative overflow-hidden">
      {/* Visual Scanning Line overlay when monitoring active */}
      {active && <div className="absolute inset-0 pointer-events-none scanning-line z-10" />}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 relative z-20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2.5 h-2.5 rounded-full ${active ? "bg-blue-500 animate-pulse" : "bg-slate-600"}`} />
            <h2 className="text-xl font-display font-medium text-slate-100 uppercase tracking-wide">
              Secure Sensor Node Controller
            </h2>
          </div>
          <p className="text-xs text-slate-400 font-mono">
            IP BOUND: LOCAL WI-FI STREAM & BULLSEYE HARNESS
          </p>
        </div>

        <button
          onClick={toggleMonitoring}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium font-display transition-all duration-300 shadow-lg ${
            active
              ? "bg-red-500 hover:bg-red-650 text-white cursor-pointer"
              : "bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
          }`}
        >
          {active ? (
            <>
              <Square className="w-4 h-4" />
              <span>Deactivate Sensor</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>Initialize Sensor</span>
            </>
          )}
        </button>
      </div>

      {errorMsg && (
        <div className="bg-red-900/20 border border-red-800/50 text-red-300 p-4 rounded-xl text-xs font-sans mb-4">
          {errorMsg}
        </div>
      )}

      {/* Screen Monitor Container */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-20">
        {/* Left Video Area */}
        <div className="lg:col-span-2 bg-[#06080b] border border-slate-950 rounded-xl overflow-hidden min-h-[300px] flex items-center justify-center relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover aspect-video transition-transform duration-500 ${!active && "scale-105 opacity-20"}`}
          />

          {!active && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-950/40">
              <CameraOff className="w-12 h-12 text-slate-600 mb-3" />
              <p className="text-sm text-slate-400 font-display">Monitoring Engine Offline</p>
              <p className="text-xs text-slate-500 max-w-xs mt-1">
                Click "Initialize Sensor" to enable secure camera frame differencing and audio assessment.
              </p>
            </div>
          )}

          {active && (
            <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-slate-950/70 border border-slate-800 backdrop-blur-md text-white py-1 px-2.5 rounded-md font-mono text-[10px] tracking-widest uppercase">
              <Wifi className="w-3 h-3 text-blue-400 animate-pulse" />
              <span>NODE_OK // FPS: {currentStatus.fps}</span>
            </div>
          )}
        </div>

        {/* Right Gauge Bar Metrics Feed */}
        <div className="flex flex-col justify-between gap-4">
          {/* Motion gauge */}
          <div className="bg-slate-950/40 border border-slate-800/40 p-5 rounded-xl flex flex-col justify-between h-[140px]">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-300 font-display">Video Motion Analysis</span>
                <span className="text-xs font-mono font-semibold text-blue-400">
                  {currentStatus.currentMotionLevel}% / {settings.motionThreshold}%
                </span>
              </div>
              
              {/* Threshold indicator line */}
              <div className="w-full h-3 bg-slate-850 rounded-full overflow-hidden relative border border-slate-900">
                <div
                  className={`h-full rounded-full transition-all duration-100 ${
                    currentStatus.currentMotionLevel >= settings.motionThreshold ? "bg-red-500" : "bg-blue-500"
                  }`}
                  style={{ width: `${Math.min(currentStatus.currentMotionLevel, 100)}%` }}
                />
                <div 
                  className="absolute h-full w-0.5 bg-slate-400 top-0" 
                  style={{ left: `${settings.motionThreshold}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>ACTIVE SCANNING GRID</span>
              <span>LIMIT: {settings.motionThreshold}%</span>
            </div>
          </div>

          {/* Audio volume gauge */}
          <div className="bg-slate-950/40 border border-slate-800/40 p-5 rounded-xl flex flex-col justify-between h-[140px]">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-300 font-display flex items-center gap-1">
                  {currentStatus.currentAudioLevel >= settings.soundThreshold ? (
                    <Volume2 className="w-4 h-4 text-red-400" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-slate-400" />
                  )}
                  Microphone Amplitude
                </span>
                <span className="text-xs font-mono font-semibold text-indigo-400">
                  {currentStatus.currentAudioLevel}% / {settings.soundThreshold}%
                </span>
              </div>

              {/* Threshold indicator line */}
              <div className="w-full h-3 bg-slate-850 rounded-full overflow-hidden relative border border-slate-900">
                <div
                  className={`h-full rounded-full transition-all duration-100 ${
                    currentStatus.currentAudioLevel >= settings.soundThreshold ? "bg-red-500" : "bg-indigo-500"
                  }`}
                  style={{ width: `${Math.min(currentStatus.currentAudioLevel, 100)}%` }}
                />
                <div 
                  className="absolute h-full w-0.5 bg-slate-400 top-0" 
                  style={{ left: `${settings.soundThreshold}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>REALTIME RMS DEPT</span>
              <span>LIMIT: {settings.soundThreshold}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
