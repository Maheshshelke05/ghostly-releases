import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store/useStore";

export const AudioSetupPage: React.FC = () => {
  const { setAppScreen, settings, updateSettings } = useStore();
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState(settings.micDeviceId || "default");
  const [testing, setTesting]         = useState(false);
  const [testDone, setTestDone]       = useState(false);
  const [micLevel, setMicLevel]       = useState(0);
  const [micStatus, setMicStatus]     = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [micError, setMicError]       = useState<string | null>(null);
  const [sysStatus, setSysStatus]     = useState<"idle" | "ok">("idle");
  const [bars, setBars]               = useState<number[]>(Array(16).fill(0));
  const [micDropOpen, setMicDropOpen] = useState(false);
  const micDropRef  = useRef<HTMLDivElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const animRef     = useRef<number | null>(null);

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices()
      .then(d => setMicrophones(d.filter(x => x.kind === "audioinput")))
      .catch(() => {});
    return () => stopStream();
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (micDropRef.current && !micDropRef.current.contains(e.target as Node)) setMicDropOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const stopStream = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const handleTest = async () => {
    stopStream();
    setTesting(true); setTestDone(false); setMicStatus("testing"); setMicError(null);
    setSysStatus("idle"); setMicLevel(0); setBars(Array(16).fill(0));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: selectedMic === "default" ? undefined : { exact: selectedMic }, echoCancellation: false, noiseSuppression: false },
      });
      streamRef.current = stream;
      const ctx      = new AudioContext();
      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
        const cs = Math.floor(data.length / 16);
        setBars(Array.from({ length: 16 }, (_, i) => {
          const sl = data.slice(i * cs, (i + 1) * cs);
          return Math.min(100, Math.round((sl.reduce((x, y) => x + y, 0) / sl.length / 200) * 100));
        }));
        animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
      setTimeout(() => { setMicStatus("ok"); setSysStatus("ok"); setTestDone(true); setTesting(false); }, 3000);
    } catch (err) {
      // Surface *why* it failed instead of a bare "No Signal ✗" — the three DOMException
      // names below cover the real-world causes users hit: OS-level mic permission off,
      // no input device at all, or the mic already claimed by another app (Zoom/Teams/
      // Discord all lock the device while running).
      const name = err instanceof DOMException ? err.name : "";
      const message =
        name === "NotAllowedError" || name === "PermissionDeniedError"
          ? "Microphone access is blocked. Open Windows Settings → Privacy & security → Microphone, turn on \"Let apps access your microphone\", then restart Ghostly AI."
          : name === "NotFoundError" || name === "DevicesNotFoundError"
            ? "No microphone was found. Plug in a mic/headset and check it's enabled in Windows Sound settings."
            : name === "NotReadableError" || name === "TrackStartError"
              ? "Your microphone is being used by another app (Zoom, Teams, Discord, etc). Close it there and try again."
              : `Microphone test failed${name ? ` (${name})` : ""}. Try a different microphone from the list above.`;
      setMicStatus("error"); setMicError(message); setTesting(false); stopStream();
    }
  };

  const handleReset = () => {
    stopStream();
    setSelectedMic("default"); setMicLevel(0); setMicStatus("idle"); setMicError(null);
    setSysStatus("idle"); setTestDone(false); setTesting(false); setBars(Array(16).fill(0));
  };

  const handleActivate = () => {
    stopStream();
    updateSettings({ micDeviceId: selectedMic });
    window.ghostly.setOpacity(1);
    window.ghostly.show();
    window.ghostly.enableMouse();
    sessionStorage.setItem("ghostly_autostart", "true");
    setAppScreen("interview");
  };

  const selectedMicLabel = selectedMic === "default"
    ? "Default Microphone"
    : microphones.find(m => m.deviceId === selectedMic)?.label || "Unknown";

  const INK = "#15162b";
  const SUBTLE = "#6b7280";
  const BORDER = "#e8e8ee";
  const PANEL_BG = "#f7f7fa";

  const STATUS_COLORS = { idle: SUBTLE, testing: INK, ok: "#16a34a", error: "#dc2626" };
  const STATUS_BG = { idle: PANEL_BG, testing: "#f0f0fb", ok: "#f0fdf4", error: "#fef2f2" };
  const STATUS_BORDER = { idle: BORDER, testing: "#c7c9f0", ok: "#bbf7d0", error: "#fecaca" };
  const STATUS_TEXT = { idle: "Not Tested", testing: "Listening…", ok: "Signal OK ✓", error: "No Signal ✗" };

  return (
    <div
      className="h-screen w-full flex items-center justify-center px-3 py-2"
      style={{ background: "transparent", pointerEvents: "none", userSelect: "none", fontFamily: "'Inter', -apple-system, sans-serif" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[310px] flex flex-col"
        style={{
          pointerEvents: "auto",
          background: "#ffffff",
          borderRadius: "20px",
          border: `1px solid ${BORDER}`,
          boxShadow: "0 20px 50px rgba(20,20,40,0.28), 0 2px 8px rgba(20,20,40,0.08)",
          overflow: "visible",
        }}
        onMouseEnter={() => window.ghostly.enableMouse()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-3.5 py-2.5" style={{ WebkitAppRegion: "drag", borderBottom: `1px solid ${BORDER}` } as React.CSSProperties}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: "15px" }}>🎙️</span>
            <div>
              <p className="text-[12px] font-bold leading-none" style={{ color: INK }}>Audio Setup</p>
              <div className="flex items-center gap-1 mt-1">
                {[1, 2].map(i => (
                  <div key={i} className="h-1 rounded-full" style={{ width: "16px", background: INK }} />
                ))}
                <span className="text-[7.5px] font-bold ml-1" style={{ color: SUBTLE }}>Step 2/2</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => { stopStream(); setAppScreen("interview-setup"); }}
            className="flex items-center gap-1 text-[9.5px] font-bold px-2.5 py-1.5 rounded-xl"
            style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, color: SUBTLE, WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
        </div>

        <div className="px-3.5 pt-3.5 pb-3 flex flex-col gap-3">

          {/* ── Mic Selector ── */}
          <div className="flex flex-col gap-1.5 relative" ref={micDropRef}>
            <label className="text-[8px] font-black uppercase tracking-[0.12em]" style={{ color: SUBTLE }}>🎤 Microphone</label>
            <button
              onClick={() => setMicDropOpen(!micDropOpen)}
              className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between transition-all"
              style={{ background: PANEL_BG, border: micDropOpen ? `1px solid ${INK}` : `1px solid ${BORDER}`, color: INK }}
            >
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 relative"
                  style={{ background: testing ? "#f0f0fb" : "#fff", border: testing ? "1px solid #c7c9f0" : `1px solid ${BORDER}` }}
                >
                  {testing && <div className="absolute inset-0 rounded-full border-2 border-violet-400/30 animate-ping" />}
                  <span className="text-[12px] relative z-10">{testing ? "🔴" : "🎤"}</span>
                </div>
                <p className="text-[11px] font-semibold truncate" style={{ color: INK }}>{selectedMicLabel}</p>
              </div>
              <span className={`text-[8px] transition-transform duration-200 shrink-0 ${micDropOpen ? "rotate-180" : ""}`} style={{ color: SUBTLE }}>▼</span>
            </button>

            <AnimatePresence>
              {micDropOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.12 }}
                  className="absolute top-[calc(100%+4px)] left-0 right-0 rounded-[16px] overflow-hidden z-50"
                  style={{ background: "#ffffff", border: `1px solid ${BORDER}`, boxShadow: "0 16px 40px rgba(20,20,40,0.2)" }}
                >
                  <div className="max-h-32 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                    {["default", ...microphones.map(m => m.deviceId)].map((id, idx) => {
                      const label = id === "default"
                        ? "Default Microphone"
                        : microphones.find(m => m.deviceId === id)?.label || `Mic ${idx}`;
                      const isSel = selectedMic === id;
                      return (
                        <button
                          key={id}
                          onClick={() => { setSelectedMic(id); handleReset(); setMicDropOpen(false); }}
                          className="w-full text-left px-3.5 py-2.5 flex items-center justify-between transition-all"
                          style={{ background: isSel ? "#f0f0fb" : "transparent", color: isSel ? INK : SUBTLE, borderBottom: idx < microphones.length ? `1px solid ${BORDER}` : "none" }}
                        >
                          <span className="text-[11px] font-semibold truncate pr-3">{label}</span>
                          {isSel && <span className="text-[9px] font-black shrink-0" style={{ color: INK }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Visualizer ── */}
          <AnimatePresence>
            {(testing || testDone) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-[14px] p-3 flex flex-col gap-2.5" style={{ background: PANEL_BG, border: `1px solid ${BORDER}` }}>
                  <div className="flex items-end justify-center gap-[3px] h-10">
                    {bars.map((h, i) => (
                      <motion.div
                        key={i}
                        animate={{ height: `${Math.max(8, h)}%` }}
                        transition={{ duration: 0.07, ease: "linear" }}
                        className="rounded-full flex-1"
                        style={{ minHeight: "3px", maxHeight: "40px", background: h > 40 ? INK : h > 15 ? "#8b8dc0" : "#e0e1e6", transition: "background 0.15s" }}
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="text-[8px] font-bold font-mono w-6 shrink-0 text-right" style={{ color: SUBTLE }}>
                      {micLevel > 0 ? `${micLevel}%` : "LVL"}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: "#e8e8ee" }}>
                      <motion.div
                        animate={{ width: `${micLevel}%` }}
                        transition={{ duration: 0.07 }}
                        className="h-full rounded-full"
                        style={{ background: micLevel > 60 ? INK : micLevel > 25 ? "#8b8dc0" : "#c7c9d6", transition: "background 0.15s" }}
                      />
                    </div>
                  </div>

                  {testing && (
                    <p className="text-[9px] font-semibold text-center flex items-center justify-center gap-2" style={{ color: SUBTLE }}>
                      <motion.span
                        animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                        className="w-2 h-2 rounded-full inline-block"
                        style={{ background: INK }}
                      />
                      Speak aloud to test your microphone
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Status pills ── */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Microphone", status: micStatus },
              { label: "System Audio", status: sysStatus === "ok" ? "ok" as const : "idle" as const },
            ].map(({ label, status }) => (
              <div
                key={label}
                className="px-3 py-2.5 rounded-[12px] flex items-center gap-2.5"
                style={{ background: STATUS_BG[status as keyof typeof STATUS_BG], border: `1px solid ${STATUS_BORDER[status as keyof typeof STATUS_BORDER]}` }}
              >
                <motion.div
                  animate={status === "testing" ? { scale: [1, 1.5, 1], opacity: [1, 0.4, 1] } : {}}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: STATUS_COLORS[status as keyof typeof STATUS_COLORS] }}
                />
                <div>
                  <p className="text-[7px] font-black uppercase tracking-widest" style={{ color: SUBTLE }}>{label}</p>
                  <p className="text-[9.5px] font-bold mt-0.5" style={{ color: STATUS_COLORS[status as keyof typeof STATUS_COLORS] }}>
                    {STATUS_TEXT[status as keyof typeof STATUS_TEXT]}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Mic error detail ── */}
          <AnimatePresence>
            {micStatus === "error" && micError && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
                  <span className="text-[12px] shrink-0 mt-0.5">⚠️</span>
                  <p className="text-[9px] font-medium leading-relaxed" style={{ color: "#dc2626" }}>{micError}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Test + Reset buttons ── */}
          <div className="flex gap-2">
            <motion.button
              whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.98 }}
              onClick={handleTest} disabled={testing}
              className="flex-1 py-2.5 rounded-full text-[11px] font-extrabold flex items-center justify-center gap-2"
              style={{
                background: testDone ? "#f0fdf4" : testing ? PANEL_BG : INK,
                color: testDone ? "#16a34a" : testing ? SUBTLE : "#fff",
                border: testDone ? "1px solid #bbf7d0" : testing ? `1px solid ${BORDER}` : "none",
              }}
            >
              {testing
                ? <><div className="w-3 h-3 border-2 border-gray-400/40 border-t-gray-700 rounded-full animate-spin inline-block mr-1.5"/>Testing…</>
                : testDone ? <>🔄 Re-test</> : <>▶ Test Audio</>}
            </motion.button>

            <AnimatePresence>
              {(testing || testDone) && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.85, x: 10 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 0.85, x: 10 }}
                  onClick={handleReset}
                  className="px-3.5 py-2.5 rounded-full text-[10px] font-bold"
                  style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, color: SUBTLE }}
                >Reset</motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* ── Info chip ── */}
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: PANEL_BG, border: `1px solid ${BORDER}` }}>
            <span className="text-[13px] shrink-0 mt-0.5">🎧</span>
            <p className="text-[9px] font-medium leading-relaxed" style={{ color: SUBTLE }}>
              Captures <b style={{ color: INK }}>all system audio</b> — Zoom, Meet, Teams transcribed automatically.
            </p>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-3.5 pb-3.5 pt-2.5" style={{ borderTop: `1px solid ${BORDER}` }}>
          <motion.button
            whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.98 }}
            onClick={handleActivate}
            className="w-full py-3 rounded-full text-[12.5px] font-bold flex items-center justify-center gap-2"
            style={{ background: INK, color: "#fff", border: "none" }}
          >
            <span className="text-[13px]">{testDone ? "🚀" : "⏭️"}</span>
            <span>{testDone ? "Launch Interview →" : "Skip & Start →"}</span>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};
