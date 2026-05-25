import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../store/useStore";

export const LoginPage: React.FC = () => {
  const { setAppScreen, user } = useStore();
  const [status, setStatus] = useState<"idle" | "waiting">("idle");

  useEffect(() => {
    if (user) setAppScreen("home");
  }, [user]);

  const handleLogin = () => {
    setStatus("waiting");
    window.ghostly.openExternal("https://www.ghotlyai.in/electron-login");
  };

  return (
    <div
      className="h-screen w-full flex items-center justify-center"
      style={{
        background: "transparent",
        pointerEvents: "auto",
        fontFamily: "'Inter', -apple-system, sans-serif",
        userSelect: "none",
      }}
      onMouseEnter={() => window.ghostly.enableMouse()}
    >
      {/* Drag region */}
      <div
        className="fixed top-0 left-0 right-0 h-8 z-50"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[290px] flex flex-col gap-3"
        style={{ pointerEvents: "auto" }}
      >
        {/* Card */}
        <div
          className="w-full rounded-[20px] overflow-hidden"
          style={{
            background: "linear-gradient(160deg, #18181f 0%, #111116 100%)",
            boxShadow: "0 24px 64px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {/* Accent bar */}
          <div className="h-[2px] w-full" style={{ background: "linear-gradient(90deg, #eb9245, #f5a55a, #eb9245)" }} />

          <div className="px-6 pt-7 pb-6 flex flex-col items-center gap-5">
            {/* Logo + title */}
            <div className="flex flex-col items-center gap-3">
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                className="w-16 h-16 rounded-[18px] flex items-center justify-center text-[32px] relative"
                style={{
                  background: "linear-gradient(135deg, #1e1e26, #13131a)",
                  boxShadow: "0 8px 28px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06), 0 0 24px rgba(235,146,69,0.18)",
                  border: "1px solid rgba(235,146,69,0.22)",
                }}
              >
                👻
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full"
                  style={{ background: "#22c55e", border: "2.5px solid #111116", boxShadow: "0 0 8px rgba(34,197,94,0.8)" }}
                />
              </motion.div>
              <div className="text-center">
                <h1 className="text-[20px] font-black tracking-tight text-white leading-none">Ghotly AI</h1>
                <p className="text-[10px] font-medium mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Stealth AI Copilot for Interviews
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="w-full h-px" style={{ background: "rgba(255,255,255,0.07)" }} />

            {/* Feature pills */}
            <div className="w-full flex flex-col gap-1.5">
              {[
                { icon: "⚡", text: "Sync app access across devices" },
                { icon: "📢", text: "All features unlocked for free" },
                { icon: "🔒", text: "Secure Google login" },
              ].map((item) => (
                <div
                  key={item.text}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-[10px]"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <span className="text-[13px] shrink-0">{item.icon}</span>
                  <span className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>{item.text}</span>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="w-full h-px" style={{ background: "rgba(255,255,255,0.07)" }} />

            {/* CTA */}
            <div className="w-full flex flex-col gap-2">
              {status === "waiting" ? (
                <div
                  className="w-full py-3 rounded-[12px] flex items-center justify-center gap-2"
                  style={{ background: "rgba(34,197,94,0.1)", border: "1.5px solid rgba(34,197,94,0.3)" }}
                >
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-[11px] font-bold text-green-400">Browser opened — complete login...</span>
                </div>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleLogin}
                  className="w-full py-3 rounded-[12px] flex items-center justify-center gap-2.5 relative overflow-hidden group"
                  style={{
                    background: "linear-gradient(135deg, #eb9245 0%, #d97706 100%)",
                    color: "#fff",
                    boxShadow: "0 6px 20px rgba(235,146,69,0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
                    border: "none",
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-[200%] group-hover:translate-x-[200%] transition-transform duration-500" />
                  <svg width="14" height="14" viewBox="0 0 24 24">
                    <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span className="text-[12px] font-extrabold">Continue with Google</span>
                </motion.button>
              )}
            </div>
          </div>
        </div>

        {/* Quit */}
        <div className="flex justify-center">
          <button
            onClick={() => window.ghostly.quit()}
            className="text-[9px] font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: "rgba(255,255,255,0.25)", background: "transparent", border: "none" }}
            onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.55)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.25)"; e.currentTarget.style.background = "transparent"; }}
          >
            Quit App
          </button>
        </div>
      </motion.div>
    </div>
  );
};
