import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [showLightning, setShowLightning] = useState(false);

  useEffect(() => {
    // Progress animation
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(onComplete, 500);
          return 100;
        }
        return prev + 2;
      });
    }, 30);

    // Lightning flashes
    const lightningInterval = setInterval(() => {
      setShowLightning(true);
      setTimeout(() => setShowLightning(false), 100);
    }, 800);

    return () => {
      clearInterval(interval);
      clearInterval(lightningInterval);
    };
  }, [onComplete]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10000] flex items-center justify-center"
        style={{
          background: "linear-gradient(135deg, #0c0a09 0%, #1c1917 100%)",
          pointerEvents: "auto",
        }}
      >
        {/* Lightning Flash */}
        <AnimatePresence>
          {showLightning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.4, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="absolute inset-0"
              style={{
                background: "radial-gradient(circle at 50% 50%, rgba(200,137,74,0.3), transparent 60%)",
                mixBlendMode: "screen",
              }}
            />
          )}
        </AnimatePresence>

        {/* Animated Background Particles */}
        {[...Array(30)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 0.6, 0],
              scale: [0, 1.5, 0],
              x: [0, (Math.random() - 0.5) * 400],
              y: [0, (Math.random() - 0.5) * 400],
            }}
            transition={{
              duration: 2 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
              ease: "easeOut",
            }}
            className="absolute w-1 h-1 rounded-full"
            style={{
              background: "#c8894a",
              boxShadow: "0 0 10px rgba(200,137,74,0.8)",
              left: "50%",
              top: "50%",
            }}
          />
        ))}

        {/* Main Content */}
        <div className="relative flex flex-col items-center gap-12">
          {/* Logo with Electric Effect */}
          <div className="relative">
            {/* Rotating outer ring */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 w-56 h-56 rounded-full"
              style={{
                background: "conic-gradient(from 0deg, transparent, rgba(200,137,74,0.4), transparent)",
                filter: "blur(30px)",
              }}
            />

            {/* Pulsing middle ring */}
            <motion.div
              animate={{
                scale: [1, 1.15, 1],
                opacity: [0.4, 0.7, 0.4],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 w-56 h-56 rounded-full"
              style={{
                border: "3px solid #c8894a",
                boxShadow: "0 0 60px rgba(200,137,74,0.6), inset 0 0 40px rgba(200,137,74,0.4)",
              }}
            />

            {/* Inner circle with logo */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-56 h-56 rounded-full flex items-center justify-center"
              style={{
                background: "radial-gradient(circle, rgba(200,137,74,0.15), transparent)",
                border: "4px solid #c8894a",
                boxShadow: "0 0 80px rgba(200,137,74,0.6), inset 0 0 40px rgba(200,137,74,0.3)",
              }}
            >
              {/* Ghost Emoji */}
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                  rotate: [0, 5, -5, 0],
                }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="text-9xl"
              >
                👻
              </motion.div>

              {/* Electric bolts around */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{
                    opacity: [0, 1, 0],
                    scale: [0.5, 1.8, 0.5],
                    rotate: [0, 360],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    delay: i * 0.15,
                    ease: "easeInOut",
                  }}
                  className="absolute text-4xl"
                  style={{
                    transform: `rotate(${angle}deg) translateY(-100px)`,
                    filter: "drop-shadow(0 0 8px rgba(234,179,8,0.8))",
                  }}
                >
                  ⚡
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="text-center"
          >
            <motion.h1
              animate={{
                textShadow: [
                  "0 0 20px rgba(200,137,74,0.6)",
                  "0 0 40px rgba(200,137,74,0.8)",
                  "0 0 20px rgba(200,137,74,0.6)",
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-6xl font-black mb-3"
              style={{
                background: "linear-gradient(135deg, #c8894a, #d9a877)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Ghotly AI
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-lg font-medium text-white/50"
            >
              Stealth AI Copilot for Interviews
            </motion.p>
          </motion.div>

          {/* Progress Bar */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="w-96 relative"
          >
            {/* Track */}
            <div
              className="h-2 rounded-full overflow-hidden relative"
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
              }}
            >
              {/* Progress fill */}
              <motion.div
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.1 }}
                className="h-full relative"
                style={{
                  background: "linear-gradient(90deg, #c8894a, #d9a877)",
                  boxShadow: "0 0 20px rgba(200,137,74,0.6)",
                }}
              >
                {/* Shine effect */}
                <motion.div
                  animate={{ x: ["-100%", "200%"] }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 w-1/2"
                  style={{
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
                  }}
                />
              </motion.div>
            </div>

            {/* Electric sparks */}
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                animate={{
                  opacity: [0, 1, 0],
                  y: [-5, -25],
                  x: [(Math.random() - 0.5) * 10, (Math.random() - 0.5) * 20],
                }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: "easeOut",
                }}
                className="absolute text-sm"
                style={{
                  left: `${(progress / 100) * 100}%`,
                  top: -8,
                  filter: "drop-shadow(0 0 4px rgba(234,179,8,0.8))",
                }}
              >
                ⚡
              </motion.div>
            ))}

            {/* Progress text */}
            <motion.p
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-center mt-3 text-sm font-bold text-white/40"
            >
              Loading... {progress}%
            </motion.p>
          </motion.div>

          {/* Version badge */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="absolute bottom-12 flex items-center gap-2 px-4 py-2 rounded-full"
            style={{
              background: "rgba(200,137,74,0.1)",
              border: "1px solid rgba(200,137,74,0.3)",
            }}
          >
            <span className="text-xs font-bold text-white/40">v1.1.5</span>
            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-medium text-white/30">Ready</span>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
