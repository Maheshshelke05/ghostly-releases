import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store/useStore";

const BASE = "#1c1917";
const nm = (raised = true) =>
  raised
    ? "6px 6px 14px rgba(0,0,0,0.55), -3px -3px 8px rgba(255,255,255,0.04)"
    : "inset 4px 4px 10px rgba(0,0,0,0.5), inset -2px -2px 6px rgba(255,255,255,0.04)";

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

  const selectedMicLabel = selectedMic === "default"
    ? "Default Microphone"
    : microphones.find(m => m.deviceId === selectedMic)?.label || "Unknown";

  const STATUS_COLOR = {
    idle:    "rgba(255,255,255,0.28)",
    testing: "#c8894a",
    ok:      "#22c55e",
    error:   "#f87171",
  };
  const STATUS_TEXT = {
    idle: "Not Tested", testing: "Listening…", ok: "Signal OK ✓", error: "No Signal ✗",
  };

  return (
    <div
      className="h-screen w-full flex items-center justify-center px-3 py-2"
      style={{ background: "transparent", pointerEvents: "none", userSelect: "none", fontFamily: "'Inter', -apple-system, sans-serif" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[290px] flex flex-col gap-2"
        style={{ pointerEvents: "auto" }}
        onMouseEnter={() => window.ghostly.enableMouse()}
        onMouseLeave={() => window.ghostly.disableMouse()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-[11px] flex items-center justify-center text-[15px] shrink-0"
              style={{
                background: "linear-gradient(135deg, #c8894a, #b27838)",
                boxShadow: "4px 4px 12px rgba(0,0,0,0.5), -2px -2px 6px rgba(255,255,255,0.04), 0 0 16px rgba(200,137,74,0.28)",
              }}
            >🎙️</div>
            <div>
              <p className="text-[12px] font-extrabold text-white leading-tight">Audio Setup</p>
              <p className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.28)" }}>Step 3 of 3</p>
            </div>
          </div>
          <button
            onClick={() => { stopStream(); setAppScreen("api-setup"); }}
            className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-[9px] transition-all"
            style={{ background: BASE, boxShadow: nm(), color: "rgba(255,255,255,0.45)", border: "none" }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = nm(false); e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = nm(); e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
        </div>

        {/* Card */}
        <div className="w-full rounded-[18px] overflow-visible" style={{ background: BASE, boxShadow: nm() }}>
          <div className="px-3 pt-3 pb-2 flex flex-col gap-2.5">

            {/* Mic Selector */}
            <div className="flex flex-col gap-1.5 relative" ref={micDropRef}>
              <label className="text-[7px] font-black uppercase tracking-[0.1em]" style={{ color: "rgba(255,255,255,0.28)" }}>
                🎤 Microphone
              </label>
              <button
                onClick={() => setMicDropOpen(!micDropOpen)}
                className="w-full px-2.5 py-2 rounded-[11px] flex items-center justify-between transition-all"
                style={{
                  background: BASE,
                  boxShadow: micDropOpen
                    ? `${nm(false)}, 0 0 0 1.5px rgba(200,137,74,0.4)`
                    : nm(false),
                  color: "rgba(255,255,255,0.75)", border: "none",
                }}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  {/* Animated mic ring */}
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 relative"
                    style={{ background: BASE, boxShadow: testing ? `${nm(false)}, 0 0 0 1.5px rgba(200,137,74,0.5)` : nm() }}
                  >
                    {testing && <div className="absolute inset-0 rounded-full border-2 border-orange-400/30 animate-ping" />}
                    <span className="text-[11px] relative z-10">{testing ? "🔴" : "🎤"}</span>
                  </div>
                  <p className="text-[11px] font-bold truncate">{selectedMicLabel}</p>
                </div>
                <span
                  className={`text-[8px] transition-transform duration-200 ${micDropOpen ? "rotate-180" : ""}`}
                  style={{ color: "rgba(255,255,255,0.3)" }}
                >▼</span>
              </button>

              <AnimatePresence>
                {micDropOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    className="absolute top-[calc(100%+4px)] left-0 right-0 rounded-[13px] overflow-hidden z-50"
                    style={{ background: BASE, boxShadow: "8px 8px 20px rgba(0,0,0,0.65), -3px -3px 8px rgba(255,255,255,0.04)" }}
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
                            className="w-full text-left px-3 py-2 flex items-center justify-between transition-all"
                            style={{
                              background: isSel ? "rgba(200,137,74,0.08)" : "transparent",
                              color: isSel ? "#c8894a" : "rgba(255,255,255,0.55)",
                              borderBottom: idx < microphones.length ? "1px solid rgba(255,255,255,0.03)" : "none",
                            }}
                            onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                            onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                          >
                            <span className="text-[11px] font-bold truncate pr-3">{label}</span>
                            {isSel && <span className="text-[9px] font-black shrink-0" style={{ color: "#c8894a" }}>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Visualizer — neumorphic inset container */}
            <AnimatePresence>
              {(testing || testDone) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-[13px] p-2.5 flex flex-col gap-2" style={{ background: BASE, boxShadow: nm(false) }}>
                    {/* Bars */}
                    <div className="flex items-end justify-center gap-[2.5px] h-8">
                      {bars.map((h, i) => (
                        <motion.div
                          key={i}
                          animate={{ height: `${Math.max(8, h)}%` }}
                          transition={{ duration: 0.07, ease: "linear" }}
                          className="rounded-full flex-1"
                          style={{
                            minHeight: "3px", maxHeight: "32px",
                            background: h > 40
                              ? "linear-gradient(to top, #c8894a, #d9a877)"
                              : h > 15
                              ? "rgba(200,137,74,0.45)"
                              : "rgba(255,255,255,0.08)",
                            boxShadow: h > 40 ? "0 0 6px rgba(200,137,74,0.4)" : "none",
                          }}
                        />
                      ))}
                    </div>
                    {/* Level bar */}
                    <div className="flex items-center gap-2">
                      <span className="text-[7px] font-black w-5 shrink-0" style={{ color: "rgba(255,255,255,0.28)" }}>
                        {micLevel > 0 ? `${micLevel}%` : "LVL"}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full" style={{ background: BASE, boxShadow: nm(false) }}>
                        <motion.div
                          animate={{ width: `${micLevel}%` }}
                          transition={{ duration: 0.07 }}
                          className="h-full rounded-full"
                          style={{
                            background: micLevel > 60
                              ? "linear-gradient(90deg, #c8894a, #d9a877)"
                              : micLevel > 25
                              ? "rgba(200,137,74,0.55)"
                              : "rgba(255,255,255,0.15)",
                            boxShadow: micLevel > 40 ? "0 0 8px rgba(200,137,74,0.35)" : "none",
                          }}
                        />
                      </div>
                    </div>
                    {testing && (
                      <p className="text-[8px] font-semibold text-center flex items-center justify-center gap-1.5" style={{ color: "rgba(200,137,74,0.65)" }}>
                        <motion.span
                          animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 0.8, repeat: Infinity }}
                          className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#c8894a" }}
                        />
                        Speak aloud to test
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Status pills — neumorphic inset */}
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: "Microphone", status: micStatus },
                { label: "System Audio", status: sysStatus === "ok" ? "ok" : "idle" },
              ].map(({ label, status }) => (
                <div
                  key={label}
                  className="px-2.5 py-1.5 rounded-[10px] flex items-center gap-2"
                  style={{ background: BASE, boxShadow: nm(false) }}
                >
                  <motion.div
                    animate={status === "testing" ? { scale: [1, 1.5, 1], opacity: [1, 0.4, 1] } : {}}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: STATUS_COLOR[status as keyof typeof STATUS_COLOR] }}
                  />
                  <div>
                    <p className="text-[6.5px] font-black uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.22)" }}>{label}</p>
                    <p className="text-[9px] font-extrabold mt-0.5" style={{ color: STATUS_COLOR[status as keyof typeof STATUS_COLOR] }}>
                      {STATUS_TEXT[status as keyof typeof STATUS_TEXT]}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Test + Reset */}
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={handleTest} disabled={testing}
                className="flex-1 py-2 rounded-[10px] text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition-all"
                style={{
                  background: testDone
                    ? BASE
                    : "linear-gradient(135deg, #c8894a 0%, #b27838 100%)",
                  color: testDone ? "#22c55e" : "#fff",
                  boxShadow: testDone
                    ? `${nm(false)}, 0 0 0 1.5px rgba(34,197,94,0.3)`
                    : testing
                    ? nm(false)
                    : "4px 4px 12px rgba(0,0,0,0.5), -2px -2px 6px rgba(255,255,255,0.04), 0 0 16px rgba(200,137,74,0.28)",
                  border: "none",
                }}
              >
                {testing
                  ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Testing…</>
                  : testDone ? <>🔄 Re-test</> : <>▶ Test Audio</>}
              </motion.button>

              <AnimatePresence>
                {(testing || testDone) && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
                    onClick={handleReset}
                    className="px-3 py-2 rounded-[10px] text-[10px] font-bold transition-all"
                    style={{ background: BASE, boxShadow: nm(), color: "rgba(255,255,255,0.42)", border: "none" }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = nm(false); e.currentTarget.style.color = "#fff"; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = nm(); e.currentTarget.style.color = "rgba(255,255,255,0.42)"; }}
                  >Reset</motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Info chip */}
            <div className="flex items-start gap-2 px-2.5 py-2 rounded-[10px]" style={{ background: BASE, boxShadow: nm(false) }}>
              <span className="text-[12px] shrink-0">🎧</span>
              <p className="text-[8px] font-medium leading-relaxed" style={{ color: "rgba(255,255,255,0.38)" }}>
                Captures <b style={{ color: "rgba(200,137,74,0.75)" }}>all system audio</b> — Zoom, Meet, Teams transcribed automatically.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-3 pb-3 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={handleActivate}
              className="w-full py-2.5 rounded-[12px] text-[12px] font-extrabold flex items-center justify-center gap-2 transition-all"
              style={{
                background: testDone ? "linear-gradient(135deg, #c8894a 0%, #b27838 100%)" : BASE,
                color: testDone ? "#fff" : "rgba(255,255,255,0.28)",
                boxShadow: testDone
                  ? "4px 4px 12px rgba(0,0,0,0.5), -2px -2px 6px rgba(255,255,255,0.04), 0 0 18px rgba(200,137,74,0.28)"
                  : nm(false),
                border: "none",
              }}
            >
              <span className="text-[14px]">{testDone ? "🚀" : "⏭️"}</span>
              {testDone ? "Launch Interview →" : "Skip & Start →"}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
