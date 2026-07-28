import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Matches App.tsx's UpdateState exactly — "ready" (not "complete") is what
// actually gets sent when a downloaded update is ready to install. It used to
// be missing from this union entirely, so TypeScript's own type error was
// pointing at a real bug: the switch below had no case for it, so users saw a
// generic "Ghostly AI — Ready" placeholder instead of an update-ready prompt.
interface UpdateAnimationProps {
  status: "idle" | "checking" | "available" | "downloading" | "installing" | "ready" | "complete" | "error";
  progress?: number;
  version?: string;
  error?: string;
}

export const UpdateAnimation: React.FC<UpdateAnimationProps> = ({ status, progress = 0, version, error }) => {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([]);
  const [showLightning, setShowLightning] = useState(false);

  // Generate electric particles
  useEffect(() => {
    if (status === "downloading" || status === "installing") {
      const interval = setInterval(() => {
        setParticles(prev => [
          ...prev.slice(-20),
          {
            id: Date.now(),
            x: Math.random() * 100,
            y: Math.random() * 100,
            delay: Math.random() * 0.5,
          },
        ]);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [status]);

  // Lightning flash effect
  useEffect(() => {
    if (status === "downloading" || status === "installing") {
      const interval = setInterval(() => {
        setShowLightning(true);
        setTimeout(() => setShowLightning(false), 150);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [status]);

  const getStatusConfig = () => {
    switch (status) {
      case "checking":
        return {
          emoji: "🔍",
          title: "Checking for Updates",
          subtitle: "Scanning for new version...",
          color: "#3b82f6",
          glow: "rgba(59, 130, 246, 0.5)",
        };
      case "downloading":
        return {
          emoji: "⚡",
          title: "Downloading Update",
          subtitle: `${progress}% complete`,
          color: "#eab308",
          glow: "rgba(234, 179, 8, 0.6)",
        };
      case "installing":
        return {
          emoji: "⚡",
          title: "Installing Update",
          subtitle: "Almost there...",
          color: "#f59e0b",
          glow: "rgba(245, 158, 11, 0.6)",
        };
      case "ready":
        return {
          emoji: "✨",
          title: "Update Ready!",
          subtitle: `v${version} downloaded — restart to apply`,
          color: "#10b981",
          glow: "rgba(16, 185, 129, 0.6)",
        };
      case "complete":
        return {
          emoji: "✨",
          title: "Update Complete!",
          subtitle: `v${version} installed successfully`,
          color: "#10b981",
          glow: "rgba(16, 185, 129, 0.6)",
        };
      case "available":
        return {
          emoji: "🎉",
          title: "Update Available",
          subtitle: version ? `v${version} is ready to download` : "A new version is ready to download",
          color: "#3b82f6",
          glow: "rgba(59, 130, 246, 0.5)",
        };
      case "error":
        return {
          emoji: "❌",
          title: "Update Failed",
          subtitle: error || "Something went wrong",
          color: "#ef4444",
          glow: "rgba(239, 68, 68, 0.5)",
        };
      case "idle":
      default:
        return {
          emoji: "👻",
          title: "Ghostly AI",
          subtitle: "Ready",
          color: "#eb9245",
          glow: "rgba(235, 146, 69, 0.5)",
        };
    }
  };

  const config = getStatusConfig();
  const isActive = status === "downloading" || status === "installing";
  const isSuccess = status === "complete" || status === "ready";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{
          background: "rgba(0, 0, 0, 0.95)",
          backdropFilter: "blur(20px)",
          pointerEvents: "auto",
        }}
      >
        {/* Lightning Flash Overlay */}
        <AnimatePresence>
          {showLightning && isActive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.3, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle at 50% 50%, ${config.color}40, transparent 70%)`,
                mixBlendMode: "screen",
              }}
            />
          )}
        </AnimatePresence>

        {/* Electric Particles */}
        {isActive && particles.map(particle => (
          <motion.div
            key={particle.id}
            initial={{ opacity: 0, scale: 0, x: `${particle.x}vw`, y: `${particle.y}vh` }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 1.5, 0],
              x: [`${particle.x}vw`, `${particle.x + (Math.random() - 0.5) * 20}vw`],
              y: [`${particle.y}vh`, `${particle.y + (Math.random() - 0.5) * 20}vh`],
            }}
            transition={{ duration: 1.5, delay: particle.delay, ease: "easeOut" }}
            className="absolute w-1 h-1 rounded-full pointer-events-none"
            style={{
              background: config.color,
              boxShadow: `0 0 10px ${config.glow}, 0 0 20px ${config.glow}`,
            }}
          />
        ))}

        {/* Main Content */}
        <div className="relative flex flex-col items-center gap-8">
          {/* Animated Circle Background */}
          <div className="relative">
            {/* Outer rotating ring */}
            <motion.div
              animate={isActive ? { rotate: 360 } : {}}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 w-48 h-48 rounded-full"
              style={{
                background: `conic-gradient(from 0deg, transparent, ${config.color}40, transparent)`,
                filter: `blur(20px)`,
              }}
            />

            {/* Middle pulsing ring */}
            <motion.div
              animate={isActive ? {
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.6, 0.3],
              } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 w-48 h-48 rounded-full"
              style={{
                border: `2px solid ${config.color}`,
                boxShadow: `0 0 40px ${config.glow}, inset 0 0 40px ${config.glow}`,
              }}
            />

            {/* Inner solid circle */}
            <motion.div
              animate={isSuccess ? { scale: [1, 1.3, 1] } : {}}
              transition={{ duration: 0.5 }}
              className="relative w-48 h-48 rounded-full flex items-center justify-center"
              style={{
                background: `radial-gradient(circle, ${config.color}20, transparent)`,
                border: `3px solid ${config.color}`,
                boxShadow: `0 0 60px ${config.glow}, inset 0 0 30px ${config.glow}`,
              }}
            >
              {/* Emoji */}
              <motion.div
                animate={isActive ? {
                  scale: [1, 1.1, 1],
                  rotate: [0, 5, -5, 0],
                } : isSuccess ? {
                  scale: [1, 1.5, 1],
                  rotate: [0, 360],
                } : {}}
                transition={{
                  duration: isActive ? 1.5 : 0.8,
                  repeat: isActive ? Infinity : 0,
                  ease: "easeInOut",
                }}
                className="text-8xl"
              >
                {config.emoji}
              </motion.div>

              {/* Electric Bolts around emoji */}
              {isActive && [0, 60, 120, 180, 240, 300].map((angle, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: [0, 1, 0],
                    scale: [0.5, 1.5, 0.5],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.15,
                    ease: "easeInOut",
                  }}
                  className="absolute text-3xl"
                  style={{
                    transform: `rotate(${angle}deg) translateY(-80px)`,
                  }}
                >
                  ⚡
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Progress Bar (for downloading/installing) */}
          {(status === "downloading" || status === "installing") && (
            <div className="w-80 relative">
              {/* Background track */}
              <div
                className="h-3 rounded-full overflow-hidden"
                style={{
                  background: "rgba(255, 255, 255, 0.1)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                }}
              >
                {/* Progress fill */}
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="h-full relative overflow-hidden"
                  style={{
                    background: `linear-gradient(90deg, ${config.color}, ${config.color}dd)`,
                    boxShadow: `0 0 20px ${config.glow}`,
                  }}
                >
                  {/* Animated shine effect */}
                  <motion.div
                    animate={{ x: ["-100%", "200%"] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 w-1/3"
                    style={{
                      background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                    }}
                  />
                </motion.div>
              </div>

              {/* Electric sparks on progress bar */}
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    opacity: [0, 1, 0],
                    y: [-10, -30],
                    x: [0, (Math.random() - 0.5) * 20],
                  }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    delay: i * 0.2,
                    ease: "easeOut",
                  }}
                  className="absolute text-xs"
                  style={{
                    left: `${(progress / 100) * 100}%`,
                    top: -10,
                  }}
                >
                  ⚡
                </motion.div>
              ))}
            </div>
          )}

          {/* Text Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center"
          >
            <motion.h2
              animate={isActive ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-3xl font-black mb-2"
              style={{
                color: config.color,
                textShadow: `0 0 20px ${config.glow}, 0 0 40px ${config.glow}`,
              }}
            >
              {config.title}
            </motion.h2>
            <p className="text-lg font-medium text-white/60">
              {config.subtitle}
            </p>
          </motion.div>

          {/* Completion Stars */}
          {isSuccess && (
            <div className="absolute inset-0 pointer-events-none">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0, x: "50%", y: "50%" }}
                  animate={{
                    opacity: [0, 1, 0],
                    scale: [0, 2, 0],
                    x: `${50 + (Math.random() - 0.5) * 100}%`,
                    y: `${50 + (Math.random() - 0.5) * 100}%`,
                  }}
                  transition={{ duration: 1.5, delay: i * 0.05 }}
                  className="absolute text-2xl"
                >
                  ✨
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Ghostly Branding */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="absolute bottom-8 flex items-center gap-2"
        >
          <span className="text-2xl">👻</span>
          <span className="text-sm font-bold text-white/40">Ghostly AI</span>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
