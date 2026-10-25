import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "../store/useStore";

export interface ChatMessage {
  id: string;
  source: "system";
  text: string;
  timestamp: number;
}

// Deepgram's speech models are built for 16 kHz mono. The AudioContext this
// capture runs in follows the Windows default playback device, which is 48 kHz
// on essentially every machine — so the old worklet shipped 48 kHz PCM
// (96 KB/s, 9600-byte messages) for audio that carries no information above
// 8 kHz. Resampling to 16 kHz in the worklet costs one biquad plus a fractional
// read cursor and cuts the wire rate (and everything Deepgram has to ingest)
// to a third.
const DEEPGRAM_SAMPLE_RATE = 16000;

// Pre-gain applied to the raw system-audio loopback. This was a fixed 2.6
// (+8 dB), which hard-clips already-loud system output — clipped audio is the
// most likely cause of "the transcript is garbled". A mild lift still rescues
// quiet system audio, and the compressor downstream catches any overshoot.
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
    // RBJ low-pass (Butterworth, Q = 0.707) at 7 kHz, just under the 8 kHz
    // Nyquist of OUT_RATE. Decimating without it folds everything above 8 kHz
    // back down on top of the speech as aliasing noise.
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
  // Audio captured while the socket is still handshaking. Bounded on both
  // axes: a captive portal or corporate proxy leaves the socket in CONNECTING
  // for the whole session, and the old code buffered ~96 KB/s the entire time
  // (tens of MB of ArrayBuffers) before flushing it all in one burst on open.
  const dgPendingRef = useRef<ArrayBuffer[]>([]);
  const dgPendingSinceRef = useRef(0);
  const MAX_PENDING_CHUNKS = 30; // 3 s of 16 kHz audio
  const MAX_PENDING_AGE_MS = 3000;
  const CONNECT_TIMEOUT_MS = 8000;
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // connectWebSocket (and therefore every reconnect it schedules) closes over
  // the key/language from the render that started the session, so changing the
  // key in Settings mid-interview left every retry authenticating with the old
  // one. Read the live values through a ref instead.
  const credsRef = useRef({ apiKey: deepgramApiKey, language: deepgramLanguage });
  useEffect(() => {
    credsRef.current = { apiKey: deepgramApiKey, language: deepgramLanguage };
  }, [deepgramApiKey, deepgramLanguage]);

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
    // A socket can fire onerror/onclose while the page is going away, and
    // setState on an unmounted component is at best wasted work.
    if (!isMountedRef.current) return;
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
    if (connectTimerRef.current) {
      clearTimeout(connectTimerRef.current);
      connectTimerRef.current = null;
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
    dgPendingSinceRef.current = 0;
  };

  // Returns whether capture actually started — Home.tsx used to fire-and-forget
  // this and optimistically flip liveActive=true regardless, so a failure here
  // (getDisplayMedia rejecting, zero audio tracks) left the UI stuck showing
  // "Listening…" forever with no error, since only this hook's internal
  // (unrendered) log array recorded what happened.
  const startInterview = async (): Promise<boolean> => {
    if (!isModelReady) { addLog("Cannot start: Deepgram key missing."); return false; }
    // Root-cause re-entrancy guard, here rather than in the caller: every
    // button/keyboard shortcut routes through this function, and
    // isRecordingRef flips synchronously below (before the first await), so a
    // second call in the same tick can never overwrite wsRef/audioCtxRef/
    // workletUrlRef/silenceWatchdogRef and orphan a live socket, mic and
    // blob URL. Report success so a double click doesn't flash a false
    // "couldn't start" error while the first session is running fine.
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
        const { apiKey, language } = credsRef.current;
        const paramsObj: Record<string, string> = {
          model: "nova-2",
          smart_format: "true",
          encoding: "linear16",
          // The worklet has already resampled the capture down to this rate
          // (see DEEPGRAM_SAMPLE_RATE) — declaring the device rate here used to
          // make us ship 3x the bytes for the same speech.
          sample_rate: String(DEEPGRAM_SAMPLE_RATE),
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
        if (language) paramsObj.language = language;
        const params = new URLSearchParams(paramsObj);

        const ws = new WebSocket(
          `wss://api.deepgram.com/v1/listen?${params}`,
          ["token", apiKey]
        );
        wsRef.current = ws;

        // A socket that never finishes the handshake (captive portal,
        // corporate TLS proxy) would otherwise sit in CONNECTING for the whole
        // session. Give up on it and let onclose run the backoff/retry path.
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
          // A clean close while still "recording" means the server hung up on
          // us (or the socket was closed out from under the graph) — not that
          // the user pressed stop, which flips isRecordingRef first. Returning
          // early here used to leave isRecording true and the mic hot with a
          // frozen transcript on screen; the only trace was a log line nothing
          // renders.
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
      // Was a fixed 2.6 (+8 dB) applied to the raw loopback. On an already-loud
      // system output that hard-clips, and clipped audio is the most likely
      // cause of "the transcript is garbled". See SYSTEM_AUDIO_GAIN above.
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
          // Hold a little audio while the handshake finishes — but never more
          // than 3 s worth, and never audio older than 3 s. Transcribing a
          // backlog that is already minutes stale is worse than starting
          // slightly late.
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
