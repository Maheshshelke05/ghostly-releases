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

  const features = [
    { icon: "⚡", text: "Sync access across devices", color: "rgba(139,92,246,0.15)", border: "rgba(139,92,246,0.3)", iconColor: "#a78bfa" },
    { icon: "🎁", text: "Free forever — no subscription", color: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.28)", iconColor: "#4ade80" },
    { icon: "🔒", text: "Secure Google login", color: "rgba(59,130,246,0.1)", border: "rgba(59,130,246,0.25)", iconColor: "#60a5fa" },
  ];

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

      {/* Ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(139,92,246,0.1) 0%, transparent 65%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[272px] flex flex-col gap-2.5"
        style={{ pointerEvents: "auto" }}
        onMouseEnter={() => window.ghostly.enableMouse()}
      >
        {/* ── Main Card ── */}
        <div
          className="w-full rounded-[24px] overflow-hidden"
          style={{
            background: "rgba(13, 13, 20, 0.92)",
            backdropFilter: "blur(28px)",
            WebkitBackdropFilter: "blur(28px)",
            border: "1px solid rgba(255,255,255,0.09)",
            boxShadow: "0 24px 64px rgba(0,0,0,0.65), 0 1px 0 rgba(255,255,255,0.06) inset",
          }}
        >
          {/* ── Top accent bar ── */}
          <div
            className="h-0.5 w-full"
            style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.6), rgba(99,102,241,0.4), transparent)" }}
          />

          <div className="px-5 pt-6 pb-5 flex flex-col gap-5">
            {/* ── Logo section ── */}
            <div className="flex flex-col items-center gap-3">
              {/* Ghost icon */}
              <motion.div
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="relative w-16 h-16 rounded-[20px] flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(99,102,241,0.12) 100%)",
                  border: "1.5px solid rgba(139,92,246,0.35)",
                  boxShadow: "0 0 32px rgba(139,92,246,0.25), 0 8px 24px rgba(0,0,0,0.4)",
                }}
              >
                <span style={{ fontSize: "30px", lineHeight: 1 }}>👻</span>
                {/* Online dot */}
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full"
                  style={{
                    background: "linear-gradient(135deg, #22c55e, #16a34a)",
                    border: "2px solid #0d0d14",
                    boxShadow: "0 0 10px rgba(34,197,94,0.6)",
                  }}
                />
              </motion.div>

              {/* Text */}
              <div className="text-center">
                <h1
                  className="text-lg font-black tracking-tight leading-none"
                  style={{
                    background: "linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.8) 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  Ghotly AI
                </h1>
                <p className="text-[10px] font-medium mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Stealth AI Copilot for Interviews
                </p>
              </div>
            </div>

            {/* ── Divider ── */}
            <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

            {/* ── Feature list ── */}
            <div className="flex flex-col gap-2">
              {features.map((item) => (
                <div
                  key={item.text}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
                  style={{
                    background: item.color,
                    border: `1px solid ${item.border}`,
                  }}
                >
                  <span
                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-sm"
                    style={{ background: "rgba(0,0,0,0.2)" }}
                  >
                    {item.icon}
                  </span>
                  <span className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.78)" }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>

            {/* ── Permissions note ── */}
            <div
              className="rounded-xl px-3 py-2.5"
              style={{
                background: "rgba(139,92,246,0.06)",
                border: "1px solid rgba(139,92,246,0.2)",
                borderLeft: "3px solid rgba(139,92,246,0.6)",
              }}
            >
              <p className="text-[9px] font-black uppercase tracking-[0.12em] mb-1.5" style={{ color: "rgba(167,139,250,0.7)" }}>
                ⚙️ Permissions needed
              </p>
              <div className="flex flex-col gap-1">
                {[
                  { icon: "🎤", label: "Microphone", desc: "For live transcription" },
                  { icon: "🖥️", label: "Screen", desc: "For screenshot solving" },
                ].map((p) => (
                  <div key={p.label} className="flex items-center gap-2">
                    <span className="text-[10px] shrink-0">{p.icon}</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>{p.label}</span>
                      <span className="text-[8.5px]" style={{ color: "rgba(255,255,255,0.3)" }}>— {p.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Divider ── */}
            <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

            {/* ── CTA ── */}
            <div className="flex flex-col gap-2">
              {status === "waiting" ? (
                <div className="flex flex-col gap-2">
                  <div
                    className="w-full py-3 rounded-xl flex items-center justify-center gap-2.5"
                    style={{
                      background: "rgba(34,197,94,0.08)",
                      border: "1px solid rgba(34,197,94,0.25)",
                    }}
                  >
                    <motion.span
                      className="w-2 h-2 rounded-full bg-green-400"
                      animate={{ opacity: [1, 0.4, 1], scale: [1, 1.3, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    />
                    <span className="text-[11px] font-bold text-green-400">Waiting for browser login...</span>
                  </div>
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-xl"
                    style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}
                  >
                    <span className="text-[10px] shrink-0">💡</span>
                    <p className="text-[9px] font-semibold leading-relaxed" style={{ color: "rgba(167,139,250,0.65)" }}>
                      Allow Microphone & Screen access when prompted.
                    </p>
                  </div>
                </div>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleLogin}
                  className="w-full py-3 rounded-xl flex items-center justify-center gap-2.5 relative overflow-hidden outline-none border-none"
                  style={{
                    background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
                    color: "#fff",
                    boxShadow: "0 4px 20px rgba(139,92,246,0.45), 0 1px 0 rgba(255,255,255,0.18) inset",
                  }}
                >
                  {/* Shimmer overlay */}
                  <motion.div
                    className="absolute inset-0 w-1/3"
                    style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)" }}
                    animate={{ x: ["-100%", "400%"] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                  />
                  {/* Google icon */}
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "rgba(255,255,255,0.2)" }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24">
                      <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                      <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  </div>
                  <span className="text-[12px] font-bold relative z-10">Continue with Google</span>
                </motion.button>
              )}
            </div>
          </div>
        </div>

        {/* ── Quit button ── */}
        <div className="flex justify-center">
          <button
            onClick={() => window.ghostly.quit()}
            className="text-[10px] font-semibold px-4 py-1.5 rounded-lg transition-all outline-none"
            style={{
              color: "rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = "#f87171";
              e.currentTarget.style.background = "rgba(239,68,68,0.1)";
              e.currentTarget.style.borderColor = "rgba(239,68,68,0.25)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = "rgba(255,255,255,0.2)";
              e.currentTarget.style.background = "rgba(255,255,255,0.03)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
            }}
          >
            Quit App
          </button>
        </div>
      </motion.div>
    </div>
  );
};
