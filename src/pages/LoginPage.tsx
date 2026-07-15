import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../store/useStore";

const BASE = "#1c1917";
const nm = (raised = true) =>
  raised
    ? "6px 6px 14px rgba(0,0,0,0.55), -3px -3px 8px rgba(255,255,255,0.04)"
    : "inset 4px 4px 10px rgba(0,0,0,0.5), inset -2px -2px 6px rgba(255,255,255,0.04)";

export const LoginPage: React.FC = () => {
  const { setAppScreen, user } = useStore();
  const [status, setStatus] = useState<"idle" | "waiting">("idle");
  const [btnHovered, setBtnHovered] = useState(false);

  useEffect(() => {
    if (user) setAppScreen("home");
  }, [user]);

  const handleLogin = () => {
    setStatus("waiting");
    window.ghostly.openExternal("https://www.ghotlyai.in/electron-login");
  };

  return (
    <div
      className="h-screen w-full flex items-center justify-center overflow-hidden"
      style={{
        background: "transparent",
        pointerEvents: "none",
        fontFamily: "'Inter', -apple-system, sans-serif",
        userSelect: "none",
      }}
    >
      {/* Drag region */}
      <div
        className="fixed top-0 left-0 right-0 h-6 z-50"
        style={{ WebkitAppRegion: "drag", pointerEvents: "auto" } as React.CSSProperties}
        onMouseEnter={() => window.ghostly.enableMouse()}
      />

      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[260px] flex flex-col gap-2.5"
        style={{ pointerEvents: "auto" }}
        onMouseEnter={() => window.ghostly.enableMouse()}
        onMouseLeave={() => window.ghostly.disableMouse()}
      >
        {/* Card */}
        <div
          className="w-full rounded-[22px]"
          style={{
            background: BASE,
            boxShadow: nm(),
          }}
        >
          <div className="px-5 pt-6 pb-5 flex flex-col items-center gap-4">
            {/* Logo + title */}
            <div className="flex flex-col items-center gap-2.5">
              <motion.div
                animate={{ scale: [1, 1.04, 1] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                className="w-14 h-14 rounded-[16px] flex items-center justify-center text-[26px] relative"
                style={{
                  background: BASE,
                  boxShadow: `${nm()}, 0 0 0 1px rgba(255,255,255,0.02), 0 0 20px rgba(200,137,74,0.1)`,
                }}
              >
                👻
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full"
                  style={{ background: "#22c55e", border: "2px solid #1c1917", boxShadow: "0 0 6px rgba(34,197,94,0.7)" }}
                />
              </motion.div>
              <div className="text-center">
                <h1 className="text-[17px] font-black tracking-tight text-white leading-none">Ghotly AI</h1>
                <p className="text-[9px] font-medium mt-1 text-white/30">
                  Stealth AI Copilot for Interviews
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-[#0c0a09]/40" />

            {/* Feature pills */}
            <div className="w-full flex flex-col gap-1.5">
              {[
                { icon: "⚡", text: "Sync access across devices" },
                { icon: "📢", text: "Free features & access unlocked" },
                { icon: "🔒", text: "Secure Google login" },
              ].map((item) => (
                <div
                  key={item.text}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-[9px]"
                  style={{ background: BASE, boxShadow: nm(false) }}
                >
                  <span className="text-[11px] shrink-0">{item.icon}</span>
                  <span className="text-[8.5px] font-bold text-white/40">{item.text}</span>
                </div>
              ))}
            </div>

            {/* Permissions Guide */}
            <div className="w-full rounded-[10px] px-2.5 py-2 border-l-[3px] border-l-[#c8894a]" style={{ background: BASE, boxShadow: nm(false) }}>
              <p className="text-[7.5px] font-black uppercase tracking-[0.1em] mb-1 text-orange-400/80 font-sans">⚙️ Permissions Guide</p>
              <div className="flex flex-col gap-0.5">
                {[
                  { icon: "🎤", label: "Mic", desc: "For live transcription" },
                  { icon: "🖥️", label: "Screen", desc: "For screenshot solving" },
                ].map((p) => (
                  <div key={p.label} className="flex items-center gap-1.5">
                    <span className="text-[9px] shrink-0">{p.icon}</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[8px] font-black text-white/70 font-sans">{p.label}</span>
                      <span className="text-[7.5px] text-white/35 font-sans">— {p.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-[#0c0a09]/40" />

            {/* CTA */}
            <div className="w-full flex flex-col gap-2">
              {status === "waiting" ? (
                <div className="w-full flex flex-col gap-1.5">
                  <div
                    className="w-full py-2.5 rounded-[11px] flex items-center justify-center gap-2"
                    style={{ background: BASE, boxShadow: nm(false) }}
                  >
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold text-green-400 font-sans">Waiting for browser login...</span>
                  </div>
                  <div className="px-2 py-1.5 rounded-[9px] flex items-start gap-1.5" style={{ background: BASE, boxShadow: nm(false) }}>
                    <span className="text-[9px] shrink-0">💡</span>
                    <p className="text-[8px] font-bold leading-normal text-orange-300/60 font-sans">
                      Allow Microphone &amp; Screen access when prompted.
                    </p>
                  </div>
                </div>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleLogin}
                  onMouseEnter={() => setBtnHovered(true)}
                  onMouseLeave={() => setBtnHovered(false)}
                  className="w-full py-2.5 rounded-[11px] flex items-center justify-center gap-2 relative overflow-hidden outline-none border-none font-sans"
                  style={{
                    background: "linear-gradient(135deg, #c8894a 0%, #b27838 100%)",
                    color: "#fff",
                    boxShadow: btnHovered
                      ? nm(false)
                      : "4px 4px 12px rgba(0,0,0,0.5), -2px -2px 6px rgba(255,255,255,0.04), 0 0 16px rgba(200,137,74,0.2)",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24">
                    <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span className="text-[11px] font-extrabold">Continue with Google</span>
                </motion.button>
              )}
            </div>
          </div>
        </div>

        {/* Quit */}
        <div className="flex justify-center">
          <button
            onClick={() => window.ghostly.quit()}
            className="text-[9px] font-bold px-3 py-1 rounded-[8px] transition-all outline-none font-sans"
            style={{ color: "rgba(255,255,255,0.25)", background: BASE, boxShadow: nm() }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = nm(false); e.currentTarget.style.color = "#f87171"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = nm(); e.currentTarget.style.color = "rgba(255,255,255,0.25)"; }}
          >
            Quit App
          </button>
        </div>
      </motion.div>
    </div>
  );
};
