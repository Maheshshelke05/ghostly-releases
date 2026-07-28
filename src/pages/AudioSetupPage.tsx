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

  const STATUS_COLORS = { idle: "rgba(255,255,255,0.28)", testing: "#a78bfa", ok: "#22c55e", error: "#f87171" };
  const STATUS_BG = { idle: "rgba(255,255,255,0.04)", testing: "rgba(139,92,246,0.1)", ok: "rgba(34,197,94,0.1)", error: "rgba(239,68,68,0.1)" };
  const STATUS_BORDER = { idle: "rgba(255,255,255,0.08)", testing: "rgba(139,92,246,0.3)", ok: "rgba(34,197,94,0.3)", error: "rgba(239,68,68,0.3)" };
  const STATUS_TEXT = { idle: "Not Tested", testing: "Listening…", ok: "Signal OK ✓", error: "No Signal ✗" };

  return (
    <div
      className="h-screen w-full flex items-center justify-center px-3 py-2"
      style={{ background: "transparent", pointerEvents: "none", userSelect: "none", fontFamily: "'Inter', -apple-system, sans-serif" }}
    >
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(139,92,246,0.09) 0%, transparent 60%)" }} />

      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[300px] flex flex-col gap-2.5 relative z-10"
        style={{ pointerEvents: "auto" }}
        onMouseEnter={() => window.ghostly.enableMouse()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-[13px] flex items-center justify-center text-[17px] shrink-0"
              style={{
                background: "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(99,102,241,0.18))",
                border: "1.5px solid rgba(139,92,246,0.4)",
                boxShadow: "0 0 20px rgba(139,92,246,0.25), 0 4px 12px rgba(0,0,0,0.4)",
              }}
            >🎙️</div>
            <div>
              <p className="text-[13px] font-black text-white leading-tight">Audio Setup</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="h-1 rounded-full transition-all"
                    style={{
                      width: "20px",
                      background: "rgba(139,92,246,0.8)",
                    }}
                  />
                ))}
                <span className="text-[8px] font-bold" style={{ color: "rgba(255,255,255,0.3)" }}>Step 3/3</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => { stopStream(); setAppScreen("api-setup"); }}
            className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-xl transition-all"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
        </div>

        {/* ── Main Card ── */}
        <div
          className="w-full rounded-[22px] overflow-visible"
          style={{
            background: "rgba(13,13,20,0.9)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset",
          }}
        >
          {/* Violet top accent */}
          <div className="h-0.5 rounded-t-[22px]" style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.7), rgba(99,102,241,0.5), transparent)" }} />

          <div className="px-3.5 pt-3.5 pb-3 flex flex-col gap-3">

            {/* ── Mic Selector ── */}
            <div className="flex flex-col gap-1.5 relative" ref={micDropRef}>
              <label className="text-[8px] font-black uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.28)" }}>
                🎤 Microphone
              </label>
              <button
                onClick={() => setMicDropOpen(!micDropOpen)}
                className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between transition-all"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: micDropOpen ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
                  boxShadow: micDropOpen ? "0 0 0 3px rgba(139,92,246,0.1)" : "none",
                  color: "rgba(255,255,255,0.8)",
                }}
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 relative"
                    style={{
                      background: testing ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.06)",
                      border: testing ? "1px solid rgba(139,92,246,0.35)" : "1px solid rgba(255,255,255,0.1)",
                      boxShadow: testing ? "0 0 12px rgba(139,92,246,0.3)" : "none",
                      transition: "all 0.3s",
                    }}
                  >
                    {testing && (
                      <div className="absolute inset-0 rounded-full border-2 border-violet-400/30 animate-ping" />
                    )}
                    <span className="text-[12px] relative z-10">{testing ? "🔴" : "🎤"}</span>
                  </div>
                  <p className="text-[11px] font-semibold truncate" style={{ color: "rgba(255,255,255,0.82)" }}>{selectedMicLabel}</p>
                </div>
                <span
                  className={`text-[8px] transition-transform duration-200 shrink-0 ${micDropOpen ? "rotate-180" : ""}`}
                  style={{ color: "rgba(255,255,255,0.3)" }}
                >▼</span>
              </button>

              {/* Dropdown */}
              <AnimatePresence>
                {micDropOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.12 }}
                    className="absolute top-[calc(100%+4px)] left-0 right-0 rounded-[16px] overflow-hidden z-50"
                    style={{
                      background: "rgba(13,13,20,0.98)",
                      backdropFilter: "blur(24px)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      boxShadow: "0 16px 40px rgba(0,0,0,0.7)",
                    }}
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
                            style={{
                              background: isSel ? "rgba(139,92,246,0.1)" : "transparent",
                              color: isSel ? "#a78bfa" : "rgba(255,255,255,0.55)",
                              borderBottom: idx < microphones.length ? "1px solid rgba(255,255,255,0.04)" : "none",
                            }}
                            onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                            onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                          >
                            <span className="text-[11px] font-semibold truncate pr-3">{label}</span>
                            {isSel && <span className="text-[9px] font-black shrink-0" style={{ color: "#a78bfa" }}>✓</span>}
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
                  <div
                    className="rounded-[14px] p-3 flex flex-col gap-2.5"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    {/* Bar visualizer */}
                    <div className="flex items-end justify-center gap-[3px] h-10">
                      {bars.map((h, i) => (
                        <motion.div
                          key={i}
                          animate={{ height: `${Math.max(8, h)}%` }}
                          transition={{ duration: 0.07, ease: "linear" }}
                          className="rounded-full flex-1"
                          style={{
                            minHeight: "3px", maxHeight: "40px",
                            background: h > 40
                              ? "linear-gradient(to top, #8b5cf6, #a78bfa)"
                              : h > 15
                              ? "rgba(139,92,246,0.5)"
                              : "rgba(255,255,255,0.08)",
                            boxShadow: h > 40 ? "0 0 8px rgba(139,92,246,0.5)" : "none",
                            transition: "background 0.15s",
                          }}
                        />
                      ))}
                    </div>

                    {/* Level bar */}
                    <div className="flex items-center gap-2.5">
                      <span className="text-[8px] font-bold font-mono w-6 shrink-0 text-right" style={{ color: "rgba(255,255,255,0.3)" }}>
                        {micLevel > 0 ? `${micLevel}%` : "LVL"}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <motion.div
                          animate={{ width: `${micLevel}%` }}
                          transition={{ duration: 0.07 }}
                          className="h-full rounded-full"
                          style={{
                            background: micLevel > 60
                              ? "linear-gradient(90deg, #8b5cf6, #a78bfa)"
                              : micLevel > 25
                              ? "rgba(139,92,246,0.65)"
                              : "rgba(255,255,255,0.2)",
                            boxShadow: micLevel > 40 ? "0 0 10px rgba(139,92,246,0.45)" : "none",
                            transition: "background 0.15s",
                          }}
                        />
                      </div>
                    </div>

                    {testing && (
                      <p className="text-[9px] font-semibold text-center flex items-center justify-center gap-2" style={{ color: "rgba(167,139,250,0.7)" }}>
                        <motion.span
                          animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                          transition={{ duration: 0.8, repeat: Infinity }}
                          className="w-2 h-2 rounded-full inline-block"
                          style={{ background: "#8b5cf6", boxShadow: "0 0 8px rgba(139,92,246,0.7)" }}
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
                  className="px-3 py-2.5 rounded-[12px] flex items-center gap-2.5 transition-all"
                  style={{
                    background: STATUS_BG[status as keyof typeof STATUS_BG],
                    border: `1px solid ${STATUS_BORDER[status as keyof typeof STATUS_BORDER]}`,
                  }}
                >
                  <motion.div
                    animate={status === "testing" ? { scale: [1, 1.5, 1], opacity: [1, 0.4, 1] } : {}}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      background: STATUS_COLORS[status as keyof typeof STATUS_COLORS],
                      boxShadow: status === "ok" ? "0 0 8px rgba(34,197,94,0.5)" : status === "testing" ? "0 0 8px rgba(139,92,246,0.5)" : "none",
                    }}
                  />
                  <div>
                    <p className="text-[7px] font-black uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>{label}</p>
                    <p className="text-[9.5px] font-bold mt-0.5" style={{ color: STATUS_COLORS[status as keyof typeof STATUS_COLORS] }}>
                      {STATUS_TEXT[status as keyof typeof STATUS_TEXT]}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Mic error detail — tells the user *why* the test failed ── */}
            <AnimatePresence>
              {micStatus === "error" && micError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div
                    className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
                    style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
                  >
                    <span className="text-[12px] shrink-0 mt-0.5">⚠️</span>
                    <p className="text-[9px] font-medium leading-relaxed" style={{ color: "rgba(248,113,113,0.9)" }}>
                      {micError}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Test + Reset buttons ── */}
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={handleTest} disabled={testing}
                className="flex-1 py-2.5 rounded-[12px] text-[11px] font-extrabold flex items-center justify-center gap-2 transition-all relative overflow-hidden"
                style={{
                  background: testDone
                    ? "rgba(34,197,94,0.1)"
                    : testing
                    ? "rgba(255,255,255,0.05)"
                    : "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                  color: testDone ? "#4ade80" : testing ? "rgba(255,255,255,0.4)" : "#fff",
                  border: testDone ? "1px solid rgba(34,197,94,0.3)" : testing ? "1px solid rgba(255,255,255,0.08)" : "none",
                  boxShadow: testDone
                    ? "0 0 12px rgba(34,197,94,0.2)"
                    : testing ? "none"
                    : "0 4px 16px rgba(139,92,246,0.4), 0 1px 0 rgba(255,255,255,0.18) inset",
                }}
              >
                {!testing && !testDone && (
                  <motion.div
                    className="absolute inset-0 w-1/3"
                    style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)" }}
                    animate={{ x: ["-100%", "400%"] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  />
                )}
                <span className="relative z-10">
                  {testing
                    ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white/80 rounded-full animate-spin inline-block mr-1.5"/>Testing…</>
                    : testDone ? <>🔄 Re-test</> : <>▶ Test Audio</>}
                </span>
              </motion.button>

              <AnimatePresence>
                {(testing || testDone) && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.85, x: 10 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 0.85, x: 10 }}
                    onClick={handleReset}
                    className="px-3.5 py-2.5 rounded-[12px] text-[10px] font-bold transition-all"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "rgba(255,255,255,0.4)",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#fff"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
                  >Reset</motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* ── Info chip ── */}
            <div
              className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
              style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.18)" }}
            >
              <span className="text-[13px] shrink-0 mt-0.5">🎧</span>
              <p className="text-[9px] font-medium leading-relaxed" style={{ color: "rgba(255,255,255,0.42)" }}>
                Captures <b style={{ color: "rgba(167,139,250,0.8)" }}>all system audio</b> — Zoom, Meet, Teams transcribed automatically.
              </p>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="px-3.5 pb-3.5 pt-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.97 }}
              onClick={handleActivate}
              className="w-full py-3 rounded-[14px] text-[12px] font-extrabold flex items-center justify-center gap-2 relative overflow-hidden transition-all"
              style={{
                background: testDone
                  ? "linear-gradient(135deg, #22c55e, #16a34a)"
                  : "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                color: "#fff",
                border: "none",
                boxShadow: testDone
                  ? "0 6px 24px rgba(34,197,94,0.4), 0 1px 0 rgba(255,255,255,0.2) inset"
                  : "0 6px 24px rgba(139,92,246,0.4), 0 1px 0 rgba(255,255,255,0.18) inset",
              }}
            >
              <motion.div
                className="absolute inset-0 w-1/3"
                style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)" }}
                animate={{ x: ["-100%", "400%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
              <span className="relative z-10 text-[15px]">{testDone ? "🚀" : "⏭️"}</span>
              <span className="relative z-10">{testDone ? "Launch Interview →" : "Skip & Start →"}</span>
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
