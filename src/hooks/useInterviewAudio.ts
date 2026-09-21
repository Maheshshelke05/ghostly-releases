import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "../store/useStore";

export interface ChatMessage {
  id: string;
  source: "system";
  text: string;
  timestamp: number;
}

const rawChunkerCode = `
class RawChunker extends AudioWorkletProcessor {
  constructor() {
    super();
    this.batch = [];
    this.batchSize = 0;
    this.TARGET_SAMPLES = 4800;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length || !input[0]) return true;
    const channelCount = input.length;
    const frameLength = input[0].length;
    const mono = new Float32Array(frameLength);
    for (let i = 0; i < frameLength; i++) {
      let sample = 0;
      for (let c = 0; c < channelCount; c++) {
        sample += input[c][i] || 0;
      }
      mono[i] = sample / channelCount;
    }
    this.batch.push(mono);
    this.batchSize += mono.length;
    if (this.batchSize >= this.TARGET_SAMPLES) {
      const int16 = new Int16Array(this.batchSize);
      let offset = 0;
      for (const f of this.batch) {
        for (let i = 0; i < f.length; i++) {
          const s = Math.max(-1, Math.min(1, f[i]));
          int16[offset++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
      }
      this.port.postMessage({ type: 'audio', buffer: int16.buffer }, [int16.buffer]);
      this.batch = [];
      this.batchSize = 0;
    }
    return true;
  }
}
registerProcessor('raw-chunker', RawChunker);
`;

// Fix: sanitize transcript to prevent XSS — strip HTML tags and control chars
function sanitizeText(text: string): string {
  return String(text)
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
}

export function useInterviewAudio() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveText, setLiveText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [isModelReady, setIsModelReady] = useState(false);
  const [statusWarning, setStatusWarning] = useState("");
  const downloadProgress = null;

  const wsRef = useRef<WebSocket | null>(null);
  const dgAccumulatedRef = useRef<string>("");
  const dgPendingRef = useRef<ArrayBuffer[]>([]);

  // Fix: separate refs for each resource — reliable cleanup
  const streamsRef = useRef<MediaStream[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletUrlRef = useRef<string | null>(null);
  // Fix: isMounted guard prevents setState after unmount
  const isRecordingRef = useRef(false);
  const isMountedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 6;

  const deepgramApiKey = useStore(
    (s) => s.settings.deepgramApiKey ?? import.meta.env.VITE_DEEPGRAM_API_KEY ?? ""
  );
  const deepgramLanguage = useStore((s) => s.settings.deepgramLanguage ?? "");

  // Watches for total silence right after starting — the #1 hard-to-diagnose
  // complaint cluster is "mic/audio not working", and system-audio loopback
  // (not a real microphone — see below) is a Windows OS-level capture of
  // whatever the DEFAULT PLAYBACK device is. If a headset is connected but
  // Windows or the calling app (Zoom/Meet/Teams) is actually routing audio
  // through a different device/role (e.g. the headset became the default
  // *communications* device but not the default *playback* device), loopback
  // silently captures nothing — no error, just an empty transcript forever.
  // This can't be fixed from inside the app (no browser/Electron API exposes
  // which physical output loopback is tied to, or lets us pick one), so the
  // best available fix is surfacing an actionable warning instead of silence.
  const hasHeardAudioRef = useRef(false);
  const silenceWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addLog = useCallback((msg: string) => {
    // Fix: sanitize log messages — prevent log injection
    const safeMsg = String(msg).replace(/[\r\n]/g, " ").slice(0, 300);
    setLogs((prev) => [...prev.slice(-49), `${new Date().toLocaleTimeString()} - ${safeMsg}`]);
  }, []);

  // Fix: cleanup on unmount — prevents memory leak
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      isRecordingRef.current = false;
      performCleanup();
    };
  }, []);

  useEffect(() => {
    if (!deepgramApiKey) {
      setIsModelReady(false);
      addLog("[ERROR] Deepgram API Key missing. Add it in Settings.");
    } else {
      setIsModelReady(true);
      addLog("Deepgram ready ⚡");
    }
  }, [deepgramApiKey, addLog]);

  const performCleanup = () => {
    if (silenceWatchdogRef.current) {
      clearTimeout(silenceWatchdogRef.current);
      silenceWatchdogRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    // Close WebSocket cleanly
    if (wsRef.current) {
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    // Stop all media tracks
    streamsRef.current.forEach((s) => {
      try { s.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    });
    streamsRef.current = [];
    // Close AudioContext
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch { /* ignore */ }
      audioCtxRef.current = null;
    }
    // Revoke blob URL
    if (workletUrlRef.current) {
      try { URL.revokeObjectURL(workletUrlRef.current); } catch { /* ignore */ }
      workletUrlRef.current = null;
    }
    dgPendingRef.current = [];
  };

  // Returns whether capture actually started — Home.tsx used to fire-and-forget
  // this and optimistically flip liveActive=true regardless, so a failure here
  // (getDisplayMedia rejecting, zero audio tracks) left the UI stuck showing
  // "Listening…" forever with no error, since only this hook's internal
  // (unrendered) log array recorded what happened.
  const startInterview = async (): Promise<boolean> => {
    if (!isModelReady) { addLog("Cannot start: Deepgram key missing."); return false; }
    isRecordingRef.current = true;
    hasHeardAudioRef.current = false;
    setStatusWarning("");
    if (isMountedRef.current) setIsRecording(true);
    addLog("Starting audio capture (Zoom/Meet/Teams supported)...");

    try {
      const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
        },
      });

      displayStream.getVideoTracks().forEach((t: MediaStreamTrack) => t.stop());

      const audioTracks = displayStream.getAudioTracks();
      if (!audioTracks.length) {
        // There is no OS share picker anymore (the app resolves this
        // automatically via useSystemPicker:false in the main process) — this
        // used to tell users to check a box that no longer appears on screen.
        throw new Error(
          "No system audio track available. Make sure something is actually set as your Windows default playback device (Settings > Sound)."
        );
      }

      const sysStream = new MediaStream(audioTracks);
      // Fix: store streams separately for reliable cleanup
      streamsRef.current = [sysStream, displayStream];
      addLog(`✔ System audio captured — ${sanitizeText(audioTracks[0].label || "loopback")}`);
      addLog("Tip: keep Zoom/Meet/Teams output on the same Windows default speaker/headset.");

      const audioCtx = new window.AudioContext();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === "suspended") await audioCtx.resume();

      const blob = new Blob([rawChunkerCode], { type: "application/javascript" });
      const workletUrl = URL.createObjectURL(blob);
      workletUrlRef.current = workletUrl;
      await audioCtx.audioWorklet.addModule(workletUrl);

      const connectWebSocket = () => {
        if (!isMountedRef.current || !isRecordingRef.current) return;
        const paramsObj: Record<string, string> = {
          model: "nova-2",
          smart_format: "true",
          encoding: "linear16",
          sample_rate: String(audioCtx.sampleRate),
          channels: "1",
          interim_results: "true",
          utterance_end_ms: "1500",
          endpointing: "300",
          vad_events: "true",
          no_delay: "true",
        };
        // Omitted entirely unless the user explicitly set one in Settings —
        // Deepgram defaults to English when this is absent, so leaving it out
        // keeps today's behavior unchanged for everyone who hasn't opted in.
        if (deepgramLanguage) paramsObj.language = deepgramLanguage;
        const params = new URLSearchParams(paramsObj);

        const ws = new WebSocket(
          `wss://api.deepgram.com/v1/listen?${params}`,
          ["token", deepgramApiKey]
        );
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMountedRef.current || !isRecordingRef.current) { ws.close(); return; }
          reconnectAttemptsRef.current = 0;
          addLog("Deepgram WebSocket connected ✔");
          for (const c of dgPendingRef.current) ws.send(c);
          dgPendingRef.current = [];
        };

        ws.onmessage = (ev) => {
          if (!isMountedRef.current) return;
          try {
            const data = JSON.parse(ev.data);
            if (data.type === "UtteranceEnd") return;
            const alt = data.channel?.alternatives?.[0];
            const rawTranscript = alt?.transcript;
            if (!rawTranscript?.trim()) return;
            const transcript = sanitizeText(rawTranscript);
            if (!transcript) return;
            const acc = dgAccumulatedRef.current;
            if (data.is_final) {
              const newAcc = acc + (acc ? " " : "") + transcript;
              dgAccumulatedRef.current = newAcc;
              setLiveText(newAcc);
            } else {
              setLiveText(acc + (acc ? " " : "") + transcript);
            }
          } catch { /* malformed JSON — ignore */ }
        };

        ws.onerror = () => {
          if (isMountedRef.current && isRecordingRef.current) {
            addLog("[WARNING] Deepgram connection error. Reconnecting in 3s...");
          }
        };

        ws.onclose = (ev) => {
          if (!isMountedRef.current || !isRecordingRef.current || ev.wasClean) return;
          reconnectAttemptsRef.current += 1;
          if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
            addLog(`[ERROR] Deepgram connection lost after ${MAX_RECONNECT_ATTEMPTS} retries. Stopping — check your network/API key and press Start again.`);
            isRecordingRef.current = false;
            if (isMountedRef.current) setIsRecording(false);
            return;
          }
          // Capped exponential backoff (3s, 6s, 12s... up to 30s) instead of a
          // fixed 3s retry forever, which just hammered a dead connection.
          const delay = Math.min(30000, 3000 * 2 ** (reconnectAttemptsRef.current - 1));
          addLog(`Deepgram WebSocket closed. Retrying in ${Math.round(delay / 1000)}s (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})...`);
          reconnectTimerRef.current = setTimeout(() => {
            if (isMountedRef.current && isRecordingRef.current) {
              connectWebSocket();
            }
          }, delay);
        };
      };

      connectWebSocket();

      // If nothing above a near-silent noise floor has come through within
      // 12s of starting, the loopback capture is very likely tapping a
      // device the interviewer's audio isn't actually playing through (see
      // the note on hasHeardAudioRef above) — tell the user instead of
      // leaving them staring at an empty "Listening…" transcript.
      silenceWatchdogRef.current = setTimeout(() => {
        if (!isRecordingRef.current || hasHeardAudioRef.current) return;
        const msg = "No system audio detected for 12s. If you're using headphones/a headset, open Windows Sound Settings and make sure it's set as your DEFAULT output device (not just default communication device) — then press Start again.";
        addLog(`[WARNING] ${msg}`);
        if (isMountedRef.current) setStatusWarning(msg);
      }, 12000);

      const source = audioCtx.createMediaStreamSource(sysStream);
      const voiceBoost = audioCtx.createGain();
      voiceBoost.gain.value = 2.6;
      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -42;
      compressor.knee.value = 28;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.18;
      const workletNode = new AudioWorkletNode(audioCtx, "raw-chunker");
      const sink = audioCtx.createGain();
      sink.gain.value = 0;
      source.connect(voiceBoost);
      voiceBoost.connect(compressor);
      compressor.connect(workletNode);
      workletNode.connect(sink);
      sink.connect(audioCtx.destination);

      workletNode.port.onmessage = (e) => {
        if (e.data.type !== "audio") return;
        const buf = e.data.buffer as ArrayBuffer;

        // Cheap silence check for the watchdog above — only runs until the
        // first real signal is seen, then never again (no per-chunk cost for
        // the rest of the session).
        if (!hasHeardAudioRef.current) {
          const samples = new Int16Array(buf);
          for (let i = 0; i < samples.length; i++) {
            if (Math.abs(samples[i]) > 400) { hasHeardAudioRef.current = true; break; }
          }
        }

        const currentWs = wsRef.current;
        if (currentWs?.readyState === WebSocket.OPEN) {
          currentWs.send(buf);
        } else if (currentWs?.readyState === WebSocket.CONNECTING) {
          dgPendingRef.current.push(buf);
        }
        // Fix: drop buffer if ws is closing/closed — prevents memory buildup
      };

      addLog("🎙️ Listening to system audio...");
      return true;
    } catch (err) {
      isRecordingRef.current = false;
      const safeErr = err instanceof Error ? sanitizeText(err.message) : "Unknown error";
      addLog(`[ERROR] ${safeErr}`);
      if (isMountedRef.current) setIsRecording(false);
      performCleanup();
      return false;
    }
  };

  const stopInterview = () => {
    isRecordingRef.current = false;
    if (isMountedRef.current) {
      setIsRecording(false);
      setLiveText("");
      setStatusWarning("");
    }
    dgAccumulatedRef.current = "";
    addLog("Stopped.");
    performCleanup();
  };

  const clearMessages = useCallback(() => { setMessages([]); setLiveText(""); }, []);
  const clearLogs = useCallback(() => setLogs([]), []);
  const clearLiveText = useCallback(() => {
    setLiveText("");
    dgAccumulatedRef.current = "";
  }, []);

  return {
    messages,
    liveText,
    isRecording,
    logs,
    isModelReady,
    downloadProgress,
    statusWarning,
    startInterview,
    stopInterview,
    clearMessages,
    clearLogs,
    clearLiveText,
    addLog,
  };
}
