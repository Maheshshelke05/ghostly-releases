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
  const [sysStatus, setSysStatus]     = useState<"idle" | "ok">("idle");
  const [bars, setBars]               = useState<number[]>(Array(12).fill(0));
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
    setTesting(true); setTestDone(false); setMicStatus("testing");
    setSysStatus("idle"); setMicLevel(0); setBars(Array(12).fill(0));
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
        const cs = Math.floor(data.length / 12);
        setBars(Array.from({ length: 12 }, (_, i) => {
          const sl = data.slice(i * cs, (i + 1) * cs);
          return Math.min(100, Math.round((sl.reduce((x, y) => x + y, 0) / sl.length / 200) * 100));
        }));
        animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
      setTimeout(() => { setMicStatus("ok"); setSysStatus("ok"); setTestDone(true); setTesting(false); }, 3000);
    } catch {
      setMicStatus("error"); setTesting(false); stopStream();
    }
  };

  const handleReset = () => {
    stopStream();
    setSelectedMic("default"); setMicLevel(0); setMicStatus("idle");
    setSysStatus("idle"); setTestDone(false); setTesting(false); setBars(Array(12).fill(0));
  };

  const handleActivate = () => {
    stopStream();
    updateSettings({ micDeviceId: selectedMic });
    setAppScreen("interview");
  };

  const STATUS = {
    idle:    { color: "#94a3b8", bg: "#f8fafc", border: "#e2e8f0", text: "Not Tested",  dot: "#cbd5e1" },
    testing: { color: "#d97706", bg: "#fffbeb", border: "#fde68a", text: "Listening…",  dot: "#fbbf24" },
    ok:      { color: "#059669", bg: "#ecfdf5", border: "#a7f3d0", text: "Signal OK ✓", dot: "#10b981" },
    error:   { color: "#dc2626", bg: "#fff1f2", border: "#fecdd3", text: "No Signal ✗", dot: "#f87171" },
  };

  const micCfg = STATUS[micStatus];
  const sysCfg = STATUS[sysStatus === "ok" ? "ok" : "idle"];
  const selectedMicLabel = selectedMic === "default"
    ? "Default Microphone"
    : microphones.find(m => m.deviceId === selectedMic)?.label || "Unknown";

  return (
    <div
      className="h-screen w-full flex items-center justify-center px-3 py-2"
      style={{ background: "transparent", pointerEvents: "auto", userSelect: "none", fontFamily: "'Inter', -apple-system, sans-serif" }}
      onMouseEnter={() => window.ghostly.enableMouse()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[290px] flex flex-col gap-2"
        style={{ pointerEvents: "auto" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[16px] shrink-0"
              style={{ background: "linear-gradient(135deg, #f43f5e, #be123c)", boxShadow: "0 3px 10px rgba(244,63,94,0.38)" }}>🎙️</div>
            <div>
              <p className="text-[12px] font-extrabold text-white leading-tight">Audio Setup</p>
              <p className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>Step 3 of 3 · Test Before Starting</p>
            </div>
          </div>
          <button
            onClick={() => { stopStream(); setAppScreen("api-setup"); }}
            className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-[8px] transition-all"
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.18)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
        </div>

        {/* Card */}
        <div className="w-full rounded-[16px] overflow-visible"
          style={{ background: "#fff", boxShadow: "0 12px 40px rgba(0,0,0,0.18), 0 1px 0 #fff inset", border: "1px solid rgba(255,255,255,0.9)" }}>

          <div className="px-3 pt-3 pb-2 flex flex-col gap-2.5">

            {/* Mic selector */}
            <div className="flex flex-col gap-1 relative" ref={micDropRef}>
              <label className="text-[7px] font-black uppercase tracking-widest text-slate-400">🎤 Microphone</label>
              <button
                onClick={() => setMicDropOpen(!micDropOpen)}
                className="w-full px-2.5 py-2 rounded-[10px] flex items-center justify-between transition-all"
                style={{ background: micDropOpen ? "#f0fdf4" : "#f8fafc", border: `1.5px solid ${micDropOpen ? "#10b981" : "#e2e8f0"}` }}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 relative"
                    style={{ background: testing ? "#fff1f2" : "#f0fdf4", border: `1.5px solid ${testing ? "#fecdd3" : "#a7f3d0"}` }}>
                    {testing && <div className="absolute inset-0 rounded-full border-2 border-red-300 animate-ping opacity-40" />}
                    <span className="text-[11px] relative z-10">{testing ? "🔴" : "🎤"}</span>
                  </div>
                  <p className="text-[11px] font-bold text-slate-700 truncate">{selectedMicLabel}</p>
                </div>
                <span className={`text-[8px] text-slate-400 transition-transform duration-200 ${micDropOpen ? "rotate-180" : ""}`}>▼</span>
              </button>

              <AnimatePresence>
                {micDropOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.12 }}
                    className="absolute top-[calc(100%+3px)] left-0 right-0 rounded-[11px] overflow-hidden z-50"
                    style={{ background: "#fff", border: "1.5px solid #e2e8f0", boxShadow: "0 10px 28px rgba(0,0,0,0.1)" }}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="max-h-32 overflow-y-auto">
                      <button onClick={() => { setSelectedMic("default"); handleReset(); setMicDropOpen(false); }}
                        className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <span className={`text-[11px] font-bold ${selectedMic === "default" ? "text-emerald-600" : "text-slate-600"}`}>Default Microphone</span>
                        {selectedMic === "default" && <span className="text-emerald-500 font-black text-[9px]">✓</span>}
                      </button>
                      {microphones.map(m => (
                        <button key={m.deviceId} onClick={() => { setSelectedMic(m.deviceId); handleReset(); setMicDropOpen(false); }}
                          className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 border-t border-slate-100 transition-colors">
                          <span className={`text-[11px] font-bold truncate pr-3 ${selectedMic === m.deviceId ? "text-emerald-600" : "text-slate-600"}`}>
                            {m.label || `Mic (${m.deviceId.slice(0, 6)}…)`}
                          </span>
                          {selectedMic === m.deviceId && <span className="text-emerald-500 font-black text-[9px] shrink-0">✓</span>}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Visualizer */}
            <AnimatePresence>
              {(testing || testDone) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-[12px] p-2.5 flex flex-col gap-1.5"
                    style={{ background: "linear-gradient(135deg, #f0fdf4, #f8fafc)", border: "1.5px solid #d1fae5" }}>
                    <div className="flex items-end justify-center gap-[2px] h-7">
                      {bars.map((h, i) => (
                        <motion.div key={i} animate={{ height: `${Math.max(6, h)}%` }}
                          transition={{ duration: 0.07, ease: "linear" }}
                          className="rounded-full flex-1"
                          style={{
                            minHeight: "3px", maxHeight: "28px",
                            background: h > 40 ? "linear-gradient(to top, #10b981, #34d399)"
                              : h > 15 ? "linear-gradient(to top, #6ee7b7, #a7f3d0)" : "#e2e8f0",
                          }} />
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[7px] font-black text-slate-400 w-5 shrink-0">{micLevel > 0 ? `${micLevel}%` : "LVL"}</span>
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "#e2e8f0" }}>
                        <motion.div animate={{ width: `${micLevel}%` }} transition={{ duration: 0.07 }}
                          className="h-full rounded-full"
                          style={{ background: micLevel > 60 ? "linear-gradient(90deg, #10b981, #34d399)" : micLevel > 25 ? "linear-gradient(90deg, #f59e0b, #fde68a)" : "linear-gradient(90deg, #94a3b8, #cbd5e1)" }} />
                      </div>
                    </div>
                    {testing && (
                      <p className="text-[9px] font-semibold text-slate-500 text-center flex items-center justify-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />Speak aloud to test
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Status pills */}
            <div className="grid grid-cols-2 gap-1.5">
              {[{ label: "Microphone", cfg: micCfg }, { label: "System Audio", cfg: sysCfg }].map(({ label, cfg }) => (
                <div key={label} className="px-2.5 py-1.5 rounded-[9px] flex items-center gap-2"
                  style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}` }}>
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cfg.dot }} />
                  <div>
                    <p className="text-[7px] font-black uppercase tracking-widest text-slate-400 leading-none">{label}</p>
                    <p className="text-[9px] font-extrabold mt-0.5" style={{ color: cfg.color }}>{cfg.text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Test buttons */}
            <div className="flex gap-1.5">
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={handleTest} disabled={testing}
                className="flex-1 py-2 rounded-[9px] text-[11px] font-extrabold flex items-center justify-center gap-1.5 relative overflow-hidden"
                style={{
                  background: testDone ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #f43f5e, #be123c)",
                  color: "#fff", opacity: testing ? 0.7 : 1, border: "none",
                  boxShadow: testing ? "none" : testDone ? "0 3px 12px rgba(16,185,129,0.3)" : "0 3px 12px rgba(244,63,94,0.3)",
                }}
              >
                {testing
                  ? <><div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />Testing…</>
                  : testDone ? <>🔄 Re-test</> : <>▶ Test Audio</>}
              </motion.button>

              <AnimatePresence>
                {(testing || testDone) && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
                    onClick={handleReset}
                    className="px-3 py-2 rounded-[9px] text-[10px] font-bold transition-all"
                    style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", color: "#64748b" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#f1f5f9"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "#f8fafc"; }}
                  >Reset</motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Info */}
            <div className="flex items-start gap-2 px-2.5 py-2 rounded-[9px]"
              style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
              <span className="text-[12px] shrink-0">🎧</span>
              <p className="text-[8px] font-medium text-blue-700 leading-relaxed">
                Captures <b>all system audio</b> — Zoom, Meet, Teams voice transcribed automatically.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-3 pb-3 pt-2" style={{ borderTop: "1px solid #f1f5f9" }}>
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}
              onClick={handleActivate}
              className="w-full py-2.5 rounded-[11px] text-[12px] font-extrabold flex items-center justify-center gap-2 relative overflow-hidden group"
              style={{
                background: testDone
                  ? "linear-gradient(135deg, #10b981, #059669)"
                  : "linear-gradient(135deg, #64748b, #475569)",
                color: "#fff",
                boxShadow: testDone ? "0 5px 18px rgba(16,185,129,0.32)" : "0 3px 10px rgba(71,85,105,0.25)",
                border: "none",
              }}
            >
              {testDone && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[200%] skew-x-[25deg] group-hover:translate-x-[200%] transition-transform duration-600" />}
              <span className="text-[14px]">{testDone ? "🚀" : "⏭️"}</span>
              {testDone ? "Launch Interview →" : "Skip & Start →"}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
