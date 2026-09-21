import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"loading" | "ready">("loading");
  const version = typeof window !== "undefined" && (window as any).ghostly?.getVersion?.()
    ? (window as any).ghostly.getVersion()
    : "3.3.5";

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setPhase("ready");
          setTimeout(onComplete, 700);
          return 100;
        }
        // Speed varies: fast at start, slows near end
        const step = prev < 60 ? 3 : prev < 90 ? 1.5 : 0.8;
        return Math.min(prev + step, 100);
      });
    }, 28);

    return () => clearInterval(interval);
  }, [onComplete]);

  const PHASES = ["Initializing core...", "Loading AI providers...", "Setting up stealth mode...", "Ready"];
  const phaseText = progress < 30 ? PHASES[0] : progress < 60 ? PHASES[1] : progress < 95 ? PHASES[2] : PHASES[3];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, scale: 1.04 }}
        transition={{ duration: 0.4 }}
        className="fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #fbfbfd 0%, #f2f3f6 50%, #fbfbfd 100%)",
          pointerEvents: "auto",
        }}
      >
        {/* ── Background ambient glows ── */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 60% 50% at 50% 20%, rgba(109,111,176,0.08) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 40% 30% at 80% 80%, rgba(109,111,176,0.05) 0%, transparent 60%)",
          }}
        />

        {/* ── Floating orbs ── */}
        {[
          { size: 3, x: "15%", y: "20%", delay: 0, color: "rgba(109,111,176,0.35)" },
          { size: 2, x: "80%", y: "15%", delay: 0.6, color: "rgba(109,111,176,0.3)" },
          { size: 4, x: "10%", y: "70%", delay: 1.2, color: "rgba(109,111,176,0.25)" },
          { size: 2.5, x: "88%", y: "65%", delay: 0.3, color: "rgba(109,111,176,0.22)" },
          { size: 1.5, x: "50%", y: "85%", delay: 0.9, color: "rgba(109,111,176,0.3)" },
          { size: 3, x: "25%", y: "50%", delay: 1.5, color: "rgba(109,111,176,0.18)" },
        ].map((orb, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: `${orb.size * 4}px`,
              height: `${orb.size * 4}px`,
              left: orb.x,
              top: orb.y,
              background: orb.color,
              filter: "blur(1px)",
              boxShadow: `0 0 ${orb.size * 6}px ${orb.color}`,
            }}
            animate={{
              opacity: [0.3, 0.8, 0.3],
              scale: [1, 1.4, 1],
            }}
            transition={{
              duration: 2.5 + i * 0.4,
              repeat: Infinity,
              delay: orb.delay,
              ease: "easeInOut",
            }}
          />
        ))}

        {/* ── Main content ── */}
        <div className="relative flex flex-col items-center gap-10 z-10">
          {/* ── Logo ── */}
          <div className="relative flex flex-col items-center gap-6">
            {/* Outer glow ring */}
            <motion.div
              className="absolute rounded-full pointer-events-none"
              style={{
                width: "160px",
                height: "160px",
                background: "radial-gradient(circle, rgba(109,111,176,0.15) 0%, transparent 70%)",
                filter: "blur(20px)",
              }}
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.9, 0.5] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* Logo card */}
            <motion.div
              initial={{ scale: 0.6, opacity: 0, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-32 h-32 rounded-[32px] flex items-center justify-center"
              style={{
                background: "#ffffff",
                border: "1.5px solid #e8e8ee",
                boxShadow: "0 24px 64px rgba(20,20,40,0.18), inset 0 1px 0 rgba(255,255,255,0.6)",
              }}
            >
              <motion.div
                animate={{ y: [0, -4, 0], rotate: [0, 3, -3, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                style={{ fontSize: "64px", lineHeight: 1 }}
              >
                👻
              </motion.div>

              {/* Live status dot */}
              <motion.div
                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                style={{
                  background: "#16a34a",
                  border: "2px solid #ffffff",
                  boxShadow: "0 0 12px rgba(22,163,74,0.5)",
                }}
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
              </motion.div>
            </motion.div>

            {/* Title */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-center"
            >
              <h1
                className="text-5xl font-bold mb-2 tracking-tight"
                style={{ color: "#15162b" }}
              >
                Ghotly AI
              </h1>
              <p className="text-base font-medium" style={{ color: "#9ca3af" }}>
                Stealth AI Copilot for Interviews
              </p>
            </motion.div>
          </div>

          {/* ── Progress ── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="w-72 flex flex-col gap-3"
          >
            {/* Progress bar track */}
            <div
              className="w-full h-1.5 rounded-full overflow-hidden relative"
              style={{ background: "#e8e8ee" }}
            >
              <motion.div
                className="h-full rounded-full relative overflow-hidden"
                style={{
                  width: `${progress}%`,
                  background: "#15162b",
                  transition: "width 0.1s ease",
                }}
              >
                {/* Shimmer */}
                <motion.div
                  className="absolute inset-0 w-1/2"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)" }}
                  animate={{ x: ["-100%", "300%"] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                />
              </motion.div>
            </div>

            {/* Status text */}
            <div className="flex items-center justify-between">
              <motion.span
                key={phaseText}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-xs font-medium"
                style={{ color: phase === "ready" ? "#15162b" : "#9ca3af" }}
              >
                {phaseText}
              </motion.span>
              <span
                className="text-xs font-mono font-bold tabular-nums"
                style={{ color: "#6b7280" }}
              >
                {Math.round(progress)}%
              </span>
            </div>
          </motion.div>

          {/* ── Version badge ── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{
              background: "#f0f0fb",
              border: "1px solid #c7c9f0",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#6d6fb0" }} />
            <span className="text-xs font-bold" style={{ color: "#5b5da8" }}>
              v{version}
            </span>
            <span className="text-xs" style={{ color: "#c7c9d6" }}>
              ·
            </span>
            <span className="text-xs font-medium" style={{ color: "#9ca3af" }}>
              Stealth Mode
            </span>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
