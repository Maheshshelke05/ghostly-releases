import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";

type StepStatus = "idle" | "running" | "pass" | "fail";

interface StepState {
  status: StepStatus;
  message?: string;
}

const INK = "#15162b";
const SUBTLE = "#6b7280";
const FAINT = "#9ca3af";
const BORDER = "#e8e8ee";
const SURFACE = "#f7f7fa";
const ACCENT = "#5b5da8";
const ACCENT_BG = "#f0f0fb";
const ACCENT_BORDER = "#c7c9f0";
const GREEN = "#16a34a";
const RED = "#dc2626";

interface AudioDiagnosticsProps {
  onClose: () => void;
}

// Mirrors the real capture path in useInterviewAudio.ts: this app listens to
// system-audio LOOPBACK via getDisplayMedia (what the interviewer says through
// Zoom/Meet/Teams), not the physical microphone — main.ts's
// setDisplayMediaRequestHandler resolves this automatically (useSystemPicker:
// false), so there is no OS share dialog to interact with. Most "mic not
// working" reports turn out to be this step failing silently — usually
// because the interviewer's app is outputting through a device (e.g. a
// headset) that isn't Windows' current DEFAULT playback device, so loopback
// captures a device with nothing playing on it. This panel makes that
// failure visible instead of a blank transcript.
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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
          message: "No audio track available at all — check Windows Sound Settings for a working default playback device.",
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

  const statusColor = (st: StepStatus) =>
    st === "pass" ? GREEN : st === "fail" ? RED : st === "running" ? ACCENT : FAINT;
  const statusIcon = (st: StepStatus) => (st === "pass" ? "✔" : st === "fail" ? "✕" : st === "running" ? "…" : "○");

  const testBtn = (busy: boolean): React.CSSProperties => ({
    background: ACCENT_BG,
    border: `1px solid ${ACCENT_BORDER}`,
    color: ACCENT,
    opacity: busy ? 0.7 : 1,
    cursor: busy ? "default" : "pointer",
  });

  // No dimmed backdrop: the window is transparent and click-through everywhere
  // except over the card, so whatever is underneath stays visible and clickable.
  return (
    <div
      className="fixed inset-0 flex justify-center items-center z-[60] p-4"
      style={{ pointerEvents: "none", fontFamily: "'Inter', -apple-system, sans-serif" }}
    >
      <div
        role="dialog"
        aria-label="Audio diagnostics"
        className="rounded-[22px] w-[340px] max-h-[86vh] overflow-y-auto flex flex-col"
        onMouseEnter={() => window.ghostly.enableMouse()}
        onMouseLeave={() => window.ghostly.disableMouse()}
        style={{
          background: "#ffffff",
          border: `1px solid ${BORDER}`,
          boxShadow: "0 32px 80px rgba(20,20,40,0.28), 0 2px 8px rgba(20,20,40,0.08)",
          pointerEvents: "auto",
        }}
      >
        <div className="p-5 flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center text-[16px] shrink-0" style={{ background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}` }}>🎙️</span>
              <div className="min-w-0">
                <p className="text-[14px] font-extrabold leading-tight" style={{ color: INK }}>Audio Diagnostics</p>
                <p className="text-[10px] font-semibold mt-0.5" style={{ color: FAINT }}>Check interview audio &amp; Deepgram</p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" title="Close (Esc)"
              className="w-8 h-8 flex items-center justify-center rounded-xl shrink-0 transition-colors hover:bg-white"
              style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: SUBTLE }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          {/* Step 1: capture test */}
          <div className="p-3.5 rounded-2xl" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11.5px] font-bold" style={{ color: INK }}>1. System audio capture</span>
              <span className="text-[13px] font-black" style={{ color: statusColor(captureStep.status) }}>{statusIcon(captureStep.status)}</span>
            </div>
            {captureStep.message && (
              <p className="text-[10.5px] mb-2 leading-relaxed font-medium" style={{ color: statusColor(captureStep.status) }}>{captureStep.message}</p>
            )}
            {captureStep.status === "pass" && (
              <div className="w-full h-2 rounded-full overflow-hidden mb-2" style={{ background: BORDER }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(level * 100)}%`, background: level > 0.05 ? GREEN : FAINT }} />
              </div>
            )}
            <button onClick={runCaptureTest} disabled={captureStep.status === "running"}
              className="w-full py-2.5 rounded-xl text-[11px] font-bold transition-all hover:brightness-95"
              style={testBtn(captureStep.status === "running")}>
              {captureStep.status === "running" ? "Select a screen/tab to share…" : "Run capture test"}
            </button>
            <p className="text-[9.5px] mt-2 font-medium leading-relaxed" style={{ color: FAINT }}>
              Play some audio (e.g. a YouTube video) while testing — the bar above should move.
            </p>
          </div>

          {/* Step 2: deepgram connectivity */}
          <div className="p-3.5 rounded-2xl" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11.5px] font-bold" style={{ color: INK }}>2. Deepgram connection</span>
              <span className="text-[13px] font-black" style={{ color: statusColor(deepgramStep.status) }}>{statusIcon(deepgramStep.status)}</span>
            </div>
            {deepgramStep.message && (
              <p className="text-[10.5px] mb-2 leading-relaxed font-medium" style={{ color: statusColor(deepgramStep.status) }}>{deepgramStep.message}</p>
            )}
            <button onClick={runDeepgramTest} disabled={deepgramStep.status === "running"}
              className="w-full py-2.5 rounded-xl text-[11px] font-bold transition-all hover:brightness-95"
              style={testBtn(deepgramStep.status === "running")}>
              {deepgramStep.status === "running" ? "Connecting…" : "Test Deepgram connection"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
