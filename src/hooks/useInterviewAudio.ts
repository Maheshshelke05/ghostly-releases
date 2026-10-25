import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "../store/useStore";

export interface ChatMessage {
  id: string;
  source: "system";
  text: string;
  timestamp: number;
}

// Deepgram's speech models want 16 kHz mono; the AudioContext follows the Windows
// playback device (48 kHz), so resample in the worklet instead of shipping 3x bytes.
const DEEPGRAM_SAMPLE_RATE = 16000;

// Mild pre-gain for the raw loopback: the old fixed 2.6 (+8 dB) hard-clipped loud
// system output, the most likely cause of garbled transcripts.
const SYSTEM_AUDIO_GAIN = 1.4;

const rawChunkerCode = `
const OUT_RATE = ${DEEPGRAM_SAMPLE_RATE};

class RawChunker extends AudioWorkletProcessor {
  constructor() {
    super();
    // Input samples per output sample — exactly 3 for the usual 48 kHz device.
    this.step = sampleRate / OUT_RATE;
    // Short FIFO so we can read at a fractional position (linear interpolation)
    // instead of dropping every Nth sample, which would distort the signal.
    this.fifo = new Float32Array(1024);
    this.fifoLen = 0;
    this.rpos = 0;
    // RBJ low-pass (Butterworth, Q = 0.707) at 7 kHz, just under the 8 kHz Nyquist of OUT_RATE;
    // decimating without it folds everything above 8 kHz back as aliasing noise.
    const w0 = 2 * Math.PI * 7000 / sampleRate;
    const alpha = Math.sin(w0) / (2 * 0.707);
    const cw = Math.cos(w0);
    const norm = 1 / (1 + alpha);
    this.b0 = ((1 - cw) / 2) * norm;
    this.b1 = (1 - cw) * norm;
    this.b2 = this.b0;
    this.a1 = 2 * cw * norm;
    this.a2 = -(1 - alpha) * norm;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
    this.batch = [];
    this.TARGET_SAMPLES = OUT_RATE / 10;  // 1600 -> one message every 100 ms
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length || !input[0]) return true;
    const channelCount = input.length;
    const frameLength = input[0].length;
    for (let i = 0; i < frameLength; i++) {
      let mono = 0;
      for (let c = 0; c < channelCount; c++) mono += input[c][i] || 0;
      mono /= channelCount;

      const y = this.b0 * mono + this.b1 * this.x1 + this.b2 * this.x2
              - this.a1 * this.y1 - this.a2 * this.y2;
      this.x2 = this.x1; this.x1 = mono;
      this.y2 = this.y1; this.y1 = y;
      this.fifo[this.fifoLen++] = y;

      while (this.rpos + 1 < this.fifoLen) {
        const idx = this.rpos | 0;
        this.push(this.fifo[idx] + (this.fifo[idx + 1] - this.fifo[idx]) * (this.rpos - idx));
        this.rpos += this.step;
      }
      // Drop what the cursor already passed so the FIFO stays a few entries long.
      const drop = this.rpos | 0;
      this.fifo.copyWithin(0, drop, this.fifoLen);
      this.fifoLen -= drop;
      this.rpos -= drop;
    }
    return true;
  }

  push(v) {
    this.batch.push(v < -1 ? -1 : v > 1 ? 1 : v);
    if (this.batch.length < this.TARGET_SAMPLES) return;
    const int16 = new Int16Array(this.batch.length);
    for (let i = 0; i < int16.length; i++) {
      const s = this.batch[i];
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage({ type: 'audio', buffer: int16.buffer }, [int16.buffer]);
    this.batch = [];
  }
}
registerProcessor('raw-chunker', RawChunker);
`;

// Strip HTML tags and control chars from transcripts (XSS defense).
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
  // Audio captured while the socket is handshaking, bounded on both axes: a captive
  // portal could leave it CONNECTING all session and buffer tens of MB.
  const dgPendingRef = useRef<ArrayBuffer[]>([]);
  const dgPendingSinceRef = useRef(0);
  const MAX_PENDING_CHUNKS = 30; // 3 s of 16 kHz audio
  const MAX_PENDING_AGE_MS = 3000;
  const CONNECT_TIMEOUT_MS = 8000;
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Separate refs per resource so cleanup can't miss one.
  const streamsRef = useRef<MediaStream[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletUrlRef = useRef<string | null>(null);
  // Prevents setState after unmount.
  const isRecordingRef = useRef(false);
  const isMountedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 6;

  const deepgramApiKey = useStore(
    (s) => s.settings.deepgramApiKey ?? import.meta.env.VITE_DEEPGRAM_API_KEY ?? ""
  );
  const deepgramLanguage = useStore((s) => s.settings.deepgramLanguage ?? "");

  // Reconnects close over the key/language from the starting render, so changing the
  // key mid-interview left retries on the old one; read live values via a ref.
  const credsRef = useRef({ apiKey: deepgramApiKey, language: deepgramLanguage });
  useEffect(() => {
    credsRef.current = { apiKey: deepgramApiKey, language: deepgramLanguage };
  }, [deepgramApiKey, deepgramLanguage]);

  // Watches for total silence after start: loopback captures only the Windows
  // default playback device, which may not be the one the meeting plays through.
  const hasHeardAudioRef = useRef(false);
  const silenceWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addLog = useCallback((msg: string) => {
    // A socket can fire onerror/onclose while the page is going away, and
    // setState on an unmounted component is at best wasted work.
    if (!isMountedRef.current) return;
    // Sanitize to prevent log injection.
    const safeMsg = String(msg).replace(/[\r\n]/g, " ").slice(0, 300);
    setLogs((prev) => [...prev.slice(-49), `${new Date().toLocaleTimeString()} - ${safeMsg}`]);
  }, []);

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
    if (connectTimerRef.current) {
      clearTimeout(connectTimerRef.current);
      connectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
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
    streamsRef.current.forEach((s) => {
      try { s.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    });
    streamsRef.current = [];
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch { /* ignore */ }
      audioCtxRef.current = null;
    }
    if (workletUrlRef.current) {
      try { URL.revokeObjectURL(workletUrlRef.current); } catch { /* ignore */ }
      workletUrlRef.current = null;
    }
    dgPendingRef.current = [];
    dgPendingSinceRef.current = 0;
  };

  // Returns whether capture actually started: a failure here (getDisplayMedia
  // rejecting, zero audio tracks) otherwise left the UI on "Listening…" forever.
  const startInterview = async (): Promise<boolean> => {
    if (!isModelReady) { addLog("Cannot start: Deepgram key missing."); return false; }
    // Re-entrancy guard here, not in the caller: every button/shortcut routes through
    // this, and isRecordingRef flips before the first await.
    if (isRecordingRef.current) {
      addLog("Start requested while already recording — ignoring duplicate.");
      return true;
    }
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
        // No OS share picker exists (useSystemPicker:false in main), so don't tell
        // users to tick a box that never appears.
        throw new Error(
          "No system audio track available. Make sure something is actually set as your Windows default playback device (Settings > Sound)."
        );
      }

      const sysStream = new MediaStream(audioTracks);
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
        const { apiKey, language } = credsRef.current;
        const paramsObj: Record<string, string> = {
          model: "nova-2",
          smart_format: "true",
          encoding: "linear16",
          // Declare the worklet's rate, not the device rate: the latter shipped 3x
          // the bytes for the same speech.
          sample_rate: String(DEEPGRAM_SAMPLE_RATE),
          channels: "1",
          interim_results: "true",
          utterance_end_ms: "1500",
          endpointing: "300",
          vad_events: "true",
          no_delay: "true",
        };
        // Omitted unless set in Settings — Deepgram defaults to English when absent,
        // so behavior is unchanged for anyone who hasn't opted in.
        if (language) paramsObj.language = language;
        const params = new URLSearchParams(paramsObj);

        const ws = new WebSocket(
          `wss://api.deepgram.com/v1/listen?${params}`,
          ["token", apiKey]
        );
        wsRef.current = ws;

        // Give up on a handshake that never completes (captive portal, corporate TLS
        // proxy) and let onclose run the backoff/retry path.
        connectTimerRef.current = setTimeout(() => {
          connectTimerRef.current = null;
          if (ws.readyState !== WebSocket.CONNECTING) return;
          addLog(`Deepgram connection still not open after ${CONNECT_TIMEOUT_MS / 1000}s — dropping it and retrying.`);
          ws.close();
        }, CONNECT_TIMEOUT_MS);

        ws.onopen = () => {
          if (connectTimerRef.current) { clearTimeout(connectTimerRef.current); connectTimerRef.current = null; }
          if (!isMountedRef.current || !isRecordingRef.current) { ws.close(); return; }
          reconnectAttemptsRef.current = 0;
          addLog("Deepgram WebSocket connected ✔");
          for (const c of dgPendingRef.current) ws.send(c);
          dgPendingRef.current = [];
          dgPendingSinceRef.current = 0;
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
          if (connectTimerRef.current) { clearTimeout(connectTimerRef.current); connectTimerRef.current = null; }
          if (!isMountedRef.current || !isRecordingRef.current) return;
          // Clean close while still recording means the server hung up, not a user
          // stop (which flips isRecordingRef first); leaving it would keep the mic hot.
          if (ev.wasClean) {
            const msg = "Deepgram closed the connection. Listening has stopped — press Start to try again.";
            addLog(`[ERROR] ${msg}`);
            isRecordingRef.current = false;
            performCleanup();
            if (isMountedRef.current) {
              setIsRecording(false);
              setStatusWarning(msg);
            }
            return;
          }
          reconnectAttemptsRef.current += 1;
          if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
            addLog(`[ERROR] Deepgram connection lost after ${MAX_RECONNECT_ATTEMPTS} retries. Stopping — check your network/API key and press Start again.`);
            isRecordingRef.current = false;
            // The socket is already dead; drop the graph too so the mic isn't
            // left open after the session gave up.
            performCleanup();
            if (isMountedRef.current) {
              setIsRecording(false);
              setStatusWarning("Lost the connection to Deepgram after several retries. Check your network or API key, then press Start again.");
            }
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

      // If nothing above the noise floor arrives within 12s, loopback is likely
      // tapping a device the interviewer's audio isn't playing through — warn.
      silenceWatchdogRef.current = setTimeout(() => {
        if (!isRecordingRef.current || hasHeardAudioRef.current) return;
        const msg = "No system audio detected for 12s. If you're using headphones/a headset, open Windows Sound Settings and make sure it's set as your DEFAULT output device (not just default communication device) — then press Start again.";
        addLog(`[WARNING] ${msg}`);
        if (isMountedRef.current) setStatusWarning(msg);
      }, 12000);

      const source = audioCtx.createMediaStreamSource(sysStream);
      const voiceBoost = audioCtx.createGain();
      // Was a fixed 2.6 (+8 dB): on already-loud output that hard-clips, the most
      // likely cause of garbled transcripts. See SYSTEM_AUDIO_GAIN above.
      voiceBoost.gain.value = SYSTEM_AUDIO_GAIN;
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

        // Cheap silence check for the watchdog: runs only until the first real
        // signal, then never again (no per-chunk cost for the rest of the session).
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
          // Hold at most 3s of audio while the handshake finishes; transcribing a
          // minutes-stale backlog is worse than starting slightly late.
          const now = Date.now();
          if (!dgPendingSinceRef.current) dgPendingSinceRef.current = now;
          if (now - dgPendingSinceRef.current > MAX_PENDING_AGE_MS) {
            dgPendingRef.current.length = 0;
            dgPendingSinceRef.current = now;
          }
          dgPendingRef.current.push(buf);
          if (dgPendingRef.current.length > MAX_PENDING_CHUNKS) {
            dgPendingRef.current.splice(0, dgPendingRef.current.length - MAX_PENDING_CHUNKS);
          }
        }
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
