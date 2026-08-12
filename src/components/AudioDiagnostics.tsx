import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";

type StepStatus = "idle" | "running" | "pass" | "fail";

interface StepState {
  status: StepStatus;
  message?: string;
}

interface AudioDiagnosticsProps {
  onClose: () => void;
}

// Mirrors the real capture path in useInterviewAudio.ts: this app listens to
// system-audio LOOPBACK via getDisplayMedia (what the interviewer says through
// Zoom/Meet/Teams), not the physical microphone. Most "mic not working" reports
// turn out to be this step failing silently — usually because "Share system
// audio" wasn't checked in the OS share picker, or there's no audio playing at
// all. This panel makes that failure visible instead of a blank transcript.
export const AudioDiagnostics: React.FC<AudioDiagnosticsProps> = ({ onClose }) => {
  const deepgramApiKey = useStore(
    (s) => s.settings.deepgramApiKey || (import.meta as any).env?.VITE_DEEPGRAM_API_KEY || ""
  );

  const [captureStep, setCaptureStep] = useState<StepState>({ status: "idle" });
  const [deepgramStep, setDeepgramStep] = useState<StepState>({ status: "idle" });
  const [level, setLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef(true);

  const cleanupCapture = () => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
    streamRef.current = null;
    displayStreamRef.current?.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
    displayStreamRef.current = null;
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch { /* ignore */ } audioCtxRef.current = null; }
    setLevel(0);
  };

  const cleanupDeepgram = () => {
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      try { wsRef.current.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanupCapture();
      cleanupDeepgram();
    };
  }, []);

  const runCaptureTest = async () => {
    cleanupCapture();
    setCaptureStep({ status: "running" });
    try {
      const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 },
      });
      displayStreamRef.current = displayStream;
      displayStream.getVideoTracks().forEach((t: MediaStreamTrack) => t.stop());

      const audioTracks = displayStream.getAudioTracks();
      if (!audioTracks.length) {
        setCaptureStep({
          status: "fail",
          message: "No audio track received. When the share picker opens, make sure \"Share system/tab audio\" is checked — this is the #1 cause of silent transcripts.",
        });
        return;
      }

      const sysStream = new MediaStream(audioTracks);
      streamRef.current = sysStream;
      setCaptureStep({ status: "pass", message: `Audio track captured: ${audioTracks[0].label || "loopback"}` });

      const audioCtx = new window.AudioContext();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === "suspended") await audioCtx.resume();
      const source = audioCtx.createMediaStreamSource(sysStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (!isMountedRef.current || !audioCtxRef.current) return;
        analyser.getByteTimeDomainData(data);
        let sumSq = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / data.length);
        setLevel(Math.min(1, rms * 4));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setCaptureStep({ status: "fail", message: msg });
    }
  };

  const runDeepgramTest = () => {
    cleanupDeepgram();
    if (!deepgramApiKey) {
      setDeepgramStep({ status: "fail", message: "No Deepgram key set — add one in Settings first." });
      return;
    }
    setDeepgramStep({ status: "running" });

    const params = new URLSearchParams({ model: "nova-2", encoding: "linear16", sample_rate: "16000", channels: "1" });
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ["token", deepgramApiKey]);
    wsRef.current = ws;
    // Local closure flag, not component state — avoids reading a stale
    // `deepgramStep` captured at call time in the onclose handler below.
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        setDeepgramStep({ status: "fail", message: "Timed out waiting for connection (10s) — check your network." });
        cleanupDeepgram();
      }
    }, 10000);

    ws.onopen = () => {
      settled = true;
      clearTimeout(timeout);
      setDeepgramStep({ status: "pass", message: "Connected to Deepgram successfully." });
      cleanupDeepgram();
    };
    ws.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      setDeepgramStep({ status: "fail", message: "Connection error — the key was likely rejected." });
    };
    ws.onclose = (ev) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      setDeepgramStep({
        status: "fail",
        message: ev.code === 1008 || ev.code === 4001
          ? "Rejected: invalid Deepgram API key."
          : `Closed unexpectedly (code ${ev.code}).`,
      });
    };
  };

  const statusColor = (s: StepStatus) =>
    s === "pass" ? "#4ade80" : s === "fail" ? "#f87171" : s === "running" ? "#a78bfa" : "rgba(255,255,255,0.3)";
  const statusIcon = (s: StepStatus) => (s === "pass" ? "✔" : s === "fail" ? "✕" : s === "running" ? "…" : "○");

  return (
    <div
      className="fixed inset-0 flex justify-center items-center z-[60]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ pointerEvents: "auto", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="rounded-[22px] w-[320px] max-h-[80vh] overflow-y-auto flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "rgba(13,13,20,0.96)",
          backdropFilter: "blur(32px)",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.06) inset",
          fontFamily: "'Inter', -apple-system, sans-serif",
          pointerEvents: "auto",
        }}
      >
        <div className="h-0.5 w-full shrink-0" style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.7), rgba(99,102,241,0.5), transparent)" }} />
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[15px]">🎙️</span>
              <span className="text-[14px] font-black tracking-tight" style={{ color: "rgba(255,255,255,0.9)" }}>Audio Diagnostics</span>
            </div>
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[11px]"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
              ✕
            </button>
          </div>

          {/* Step 1: capture test */}
          <div className="p-3 rounded-[14px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold" style={{ color: "rgba(255,255,255,0.7)" }}>1. System Audio Capture</span>
              <span className="text-[12px] font-black" style={{ color: statusColor(captureStep.status) }}>{statusIcon(captureStep.status)}</span>
            </div>
            {captureStep.message && (
              <p className="text-[10px] mb-2 leading-relaxed" style={{ color: statusColor(captureStep.status) }}>{captureStep.message}</p>
            )}
            {captureStep.status === "pass" && (
              <div className="w-full h-2 rounded-full overflow-hidden mb-2" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(level * 100)}%`, background: level > 0.05 ? "#4ade80" : "rgba(255,255,255,0.15)" }} />
              </div>
            )}
            <button onClick={runCaptureTest} disabled={captureStep.status === "running"}
              className="w-full py-2 rounded-xl text-[10px] font-bold transition-all"
              style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#a78bfa" }}>
              {captureStep.status === "running" ? "Select a screen/tab to share…" : "Run Capture Test"}
            </button>
            <p className="text-[9px] mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
              Play some audio (e.g. a YouTube video) while testing — the bar above should move.
            </p>
          </div>

          {/* Step 2: deepgram connectivity */}
          <div className="p-3 rounded-[14px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold" style={{ color: "rgba(255,255,255,0.7)" }}>2. Deepgram Connection</span>
              <span className="text-[12px] font-black" style={{ color: statusColor(deepgramStep.status) }}>{statusIcon(deepgramStep.status)}</span>
            </div>
            {deepgramStep.message && (
              <p className="text-[10px] mb-2 leading-relaxed" style={{ color: statusColor(deepgramStep.status) }}>{deepgramStep.message}</p>
            )}
            <button onClick={runDeepgramTest} disabled={deepgramStep.status === "running"}
              className="w-full py-2 rounded-xl text-[10px] font-bold transition-all"
              style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#a78bfa" }}>
              {deepgramStep.status === "running" ? "Connecting…" : "Test Deepgram Connection"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
