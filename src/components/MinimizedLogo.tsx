import React from "react";
import { motion } from "framer-motion";

interface Props {
  onExpand: () => void;
  // Listening to the interviewer.
  live?: boolean;
  // Something is in progress (an AI answer streaming in, a browser login in flight).
  busy?: boolean;
  // Needs the user's attention (e.g. the login is taking longer than expected).
  warn?: boolean;
  // Where the logo sits. Defaults to the spot the interview top bar's brand occupies.
  left?: number;
  top?: number;
  title?: string;
}

// What the overlay collapses to: just the logo. A real OS minimize would strand the
// window (it is skipTaskbar), so the overlay collapses in place instead and the logo
// brings it straight back. The grip beside the logo is the drag handle — a drag region
// swallows clicks, so the logo itself is not one. Mouse capture while hovering it is
// handled by useMinimizedClickThrough (it hit-tests the pointer), not by enter/leave here.
export const MinimizedLogo: React.FC<Props> = ({ onExpand, live = false, busy = false, warn = false, left = 12, top = 8, title = "Open GhotlyAI" }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.5 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.6 }}
    transition={{ type: "spring", stiffness: 420, damping: 30 }}
    data-minimized-logo
    className="fixed z-[70] flex items-center rounded-2xl"
    style={{
      left,
      top,
      height: 40,
      transformOrigin: "20px 20px",
      pointerEvents: "auto",
      background: "linear-gradient(180deg, #14141d 0%, #0d0d13 100%)",
      border: "1px solid rgba(255,255,255,0.09)",
      boxShadow: "0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)",
    }}
  >
    <motion.button
      onClick={onExpand}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      title={title}
      aria-label={title}
      className="relative w-10 h-10 flex items-center justify-center rounded-2xl outline-none"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      {busy && (
        <motion.span
          aria-hidden
          className="absolute inset-[3px] rounded-[13px]"
          style={{ background: "conic-gradient(from 0deg, transparent 0 60%, #a78bfa 100%)", WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))", mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.1, ease: "linear", repeat: Infinity }}
        />
      )}
      <span
        className="w-7 h-7 rounded-[9px] flex items-center justify-center text-[14px]"
        style={{ background: "rgba(139,92,246,0.18)", border: "1px solid rgba(139,92,246,0.32)", boxShadow: "0 0 14px rgba(139,92,246,0.3)" }}
      >
        👻
      </span>
      {live && (
        <span className="absolute bottom-1 right-1 flex w-2.5 h-2.5">
          <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-60" />
          <span className="relative w-2.5 h-2.5 rounded-full bg-green-500" style={{ border: "2px solid #0d0d13" }} />
        </span>
      )}
      {warn && (
        <span className="absolute bottom-1 right-1 flex w-2.5 h-2.5" data-testid="pill-warn">
          <span className="absolute inset-0 rounded-full bg-amber-400 animate-ping opacity-70" />
          <span className="relative w-2.5 h-2.5 rounded-full bg-amber-400" style={{ border: "2px solid #0d0d13" }} />
        </span>
      )}
    </motion.button>

    <div
      className="h-full w-4 flex items-center justify-center cursor-move rounded-r-2xl transition-colors hover:bg-white/[0.05]"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      title="Drag to move"
    >
      <svg width="6" height="14" viewBox="0 0 6 14" fill="rgba(255,255,255,0.28)">
        <circle cx="1.5" cy="2" r="1" /><circle cx="4.5" cy="2" r="1" />
        <circle cx="1.5" cy="7" r="1" /><circle cx="4.5" cy="7" r="1" />
        <circle cx="1.5" cy="12" r="1" /><circle cx="4.5" cy="12" r="1" />
      </svg>
    </div>
  </motion.div>
);
