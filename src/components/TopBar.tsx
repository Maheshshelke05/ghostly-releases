import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { JobIcon } from "./JobPortalTab";
import GhostMascot from "./ghost/GhostMascot";

export type InterviewTab = "ai" | "screen" | "chat" | "jobs" | "support";

interface TopBarProps {
  onOpenSettings: () => void;
  settingsOpen: boolean;
  isLiveActive: boolean;
  onToggleLive: () => void;
  onScreenAnalysis: () => void;
  liveText?: string;
  onMicSend?: () => void;
  onNextQuestion?: () => void;
  showNext?: boolean;
  activeTab: InterviewTab;
  onTabChange: (tab: InterviewTab) => void;
  onStop: () => void;
  autoAI: boolean;
  onToggleAutoAI: () => void;
  // Collapse the whole overlay to just the logo (see MinimizedLogo).
  onMinimize: () => void;
}

const MicIcon = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
  </svg>
);

const ScreenIcon = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <path d="M8 21h8M12 17v4"/>
  </svg>
);

const ChatIcon = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

const SettingsIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

const TABS = [
  { id: "ai" as const,      label: "AI Answer", Icon: MicIcon,    color: "#a78bfa", glow: "rgba(139,92,246,0.45)" },
  { id: "screen" as const,  label: "Screen",    Icon: ScreenIcon, color: "#60a5fa", glow: "rgba(59,130,246,0.4)" },
  { id: "chat" as const,    label: "Chat",      Icon: ChatIcon,   color: "#a78bfa", glow: "rgba(167,139,250,0.4)" },
  { id: "jobs" as const,    label: "Job Portal", Icon: JobIcon,   color: "#a3e635", glow: "rgba(163,230,53,0.4)" },
  { id: "support" as const, label: "Report",   Icon: null,       color: "#fb923c", glow: "rgba(251,146,60,0.4)" },
];

export const TopBar: React.FC<TopBarProps> = ({
  onOpenSettings, settingsOpen, isLiveActive, onToggleLive, onScreenAnalysis,
  liveText = "", onMicSend, onNextQuestion, showNext = false,
  activeTab, onTabChange, onStop, autoAI, onToggleAutoAI, onMinimize,
}) => {
  const [timer, setTimer] = useState(0);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const iv = setInterval(() => setTimer(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (el && liveText) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [liveText]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const handleTabClick = (id: typeof TABS[number]["id"]) => {
    if (id === "ai") {
      onTabChange(id);
      onToggleLive();
      return;
    }
    if (id === "screen") {
      onTabChange(id);
      onScreenAnalysis();
      return;
    }
    onTabChange(id);
  };

  return (
    <div
      className="w-full flex justify-center pt-2 px-3 pointer-events-none"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div
        className="w-full max-w-[960px] flex flex-col pointer-events-auto"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        onMouseEnter={() => window.ghostly.enableMouse()}
      >
        {/* ── Main Bar ──
            Fully opaque: CSS backdrop-filter can only blur content painted within
            THIS same page — it cannot blur whatever real OS window is sitting
            behind this transparent, frameless Electron window. Any alpha here
            (even 0.93) exposes unblurred text/pixels from the app behind the
            overlay, ghosting through this bar's own text. */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className={`relative flex items-center h-10 px-2.5 gap-1 ${isLiveActive ? "rounded-t-2xl" : "rounded-2xl"}`}
          style={{
            background: "linear-gradient(180deg, #14141d 0%, #0d0d13 100%)",
            border: "1px solid rgba(255,255,255,0.09)",
            boxShadow: "0 10px 34px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)",
            transition: "border-radius 0.25s ease",
          }}
        >
          {/* ── Brand — click to minimize the whole overlay down to the logo ── */}
          <motion.button
            onClick={onMinimize}
            whileHover="hover"
            whileTap={{ scale: 0.96 }}
            title="Minimize — collapse to the logo (click the logo to reopen)"
            aria-label="Minimize GhotlyAI"
            className="group flex items-center gap-2 shrink-0 pl-0.5 pr-2 h-8 -ml-0.5 rounded-[10px] outline-none transition-colors duration-200 hover:bg-white/[0.06] focus-visible:bg-white/[0.08]"
          >
            <motion.span
              variants={{ hover: { rotate: [0, -10, 8, 0], scale: 1.08, transition: { duration: 0.5 } } }}
              className="w-7 h-7 rounded-[9px] flex items-center justify-center shrink-0 relative"
              style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.16)", boxShadow: "0 0 14px rgba(139,92,246,0.30)" }}
            >
              <GhostMascot size={24} variant="calm" alt="" />
            </motion.span>
            <span
              className="text-[12px] font-bold tracking-tight whitespace-nowrap text-white/90 transition-colors duration-200 group-hover:text-white"
              style={{ letterSpacing: "-0.3px" }}
            >
              GhotlyAI
            </span>
          </motion.button>

          {/* ── Divider ── */}
          <div className="w-px h-5 shrink-0" style={{ background: "rgba(255,255,255,0.1)" }} />

          {/* ── Tabs — the highlight glides between them (shared layoutId) ── */}
          <div
            className="flex items-center gap-0.5 p-0.5 rounded-[11px] shrink-0"
            style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const isStopBtn = tab.id === "ai" && isLiveActive;

              return (
                <motion.button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  whileTap={{ scale: 0.95 }}
                  title={tab.label}
                  className={`relative flex items-center gap-1 px-2 h-7 rounded-[9px] text-[10px] font-bold whitespace-nowrap outline-none transition-colors duration-200 ${
                    isStopBtn || isActive ? "" : "text-white/40 hover:text-white/80 hover:bg-white/[0.04]"
                  }`}
                  style={
                    isStopBtn
                      ? { background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)", color: "#f87171" }
                      : isActive
                      ? { color: tab.color, border: "1px solid transparent" }
                      : { border: "1px solid transparent" }
                  }
                >
                  {isActive && !isStopBtn && (
                    <motion.span
                      layoutId="ghotly-tab-pill"
                      aria-hidden
                      className="absolute -inset-px rounded-[9px] pointer-events-none"
                      style={{ border: "1px solid transparent" }}
                      initial={false}
                      animate={{ backgroundColor: `${tab.color}22`, borderColor: `${tab.color}55`, boxShadow: `0 0 12px ${tab.glow}` }}
                      transition={{ layout: { type: "spring", stiffness: 460, damping: 36 }, default: { duration: 0.25 } }}
                    />
                  )}
                  <span className="relative flex items-center gap-1">
                    {isStopBtn ? (
                      <>
                        <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: "#f87171" }} />
                        <span>Stop</span>
                      </>
                    ) : tab.Icon ? (
                      <>
                        <tab.Icon />
                        {/* The live-session bar (Stop + Auto) leaves no room for a
                            fifth full label in the 700px window — icon-only there. */}
                        {!(isLiveActive && tab.id === "jobs") && <span>{tab.label}</span>}
                      </>
                    ) : (
                      <span>{tab.label}</span>
                    )}
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* ── Auto AI pill — only when live ── */}
          {isLiveActive && (
            <>
              <div className="w-px h-5 shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />
              <motion.button
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                whileTap={{ scale: 0.95 }}
                onClick={onToggleAutoAI}
                title={autoAI ? "Auto AI ON — click to disable" : "Auto AI OFF — click to enable"}
                className="flex items-center gap-1.5 px-2.5 h-7 rounded-[9px] text-[10px] font-bold whitespace-nowrap outline-none transition-colors duration-200 shrink-0"
                style={
                  autoAI
                    ? { background: "rgba(34,197,94,0.14)", border: "1px solid rgba(34,197,94,0.35)", color: "#4ade80" }
                    : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.3)" }
                }
              >
                <span className="relative flex w-1.5 h-1.5 shrink-0">
                  {autoAI && <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-50" />}
                  <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: autoAI ? "#4ade80" : "rgba(255,255,255,0.15)" }} />
                </span>
                Auto
              </motion.button>
            </>
          )}

          {/* ── Spacer ── */}
          <div className="flex-1" />

          {/* ── Timer ── */}
          <div
            className="flex items-center gap-1.5 px-2 h-7 rounded-[9px] shrink-0 transition-colors duration-300"
            style={{
              background: isLiveActive ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.04)",
              border: isLiveActive ? "1px solid rgba(34,197,94,0.22)" : "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background: isLiveActive ? "#22c55e" : "rgba(255,255,255,0.2)",
                boxShadow: isLiveActive ? "0 0 6px rgba(34,197,94,0.8)" : "none",
                animation: isLiveActive ? "pulse 2s infinite" : "none",
              }}
            />
            <span className="text-[10px] font-mono tabular-nums transition-colors duration-300" style={{ color: isLiveActive ? "rgba(134,239,172,0.9)" : "rgba(255,255,255,0.4)" }}>{fmt(timer)}</span>
          </div>

          {/* ── Settings ── */}
          <motion.button
            onClick={onOpenSettings}
            whileTap={{ scale: 0.92 }}
            title="Settings"
            className={`group w-8 h-8 flex items-center justify-center rounded-[9px] outline-none transition-colors duration-200 shrink-0 ${
              settingsOpen ? "" : "hover:bg-white/[0.09] hover:text-white/70"
            }`}
            style={
              settingsOpen
                ? { background: "rgba(139,92,246,0.18)", border: "1px solid rgba(139,92,246,0.4)", color: "#a78bfa" }
                : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)" }
            }
          >
            <span className={`flex transition-transform duration-500 ease-out ${settingsOpen ? "rotate-90" : "group-hover:rotate-45"}`}>
              <SettingsIcon />
            </span>
          </motion.button>

          {/* ── End Session ── */}
          <motion.button
            onClick={onStop}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 px-2.5 h-7 rounded-[9px] text-[10px] font-bold whitespace-nowrap outline-none transition-colors duration-200 shrink-0 bg-red-500/[0.08] border border-red-500/[0.15] text-red-400/70 hover:bg-red-500/[0.2] hover:border-red-500/40 hover:text-red-300"
          >
            <svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
            End
          </motion.button>

          {/* ── Close ── */}
          <motion.button
            onClick={() => window.ghostly.quit()}
            onMouseEnter={() => window.ghostly.enableMouse()}
            whileTap={{ scale: 0.92 }}
            title="Quit"
            className="w-8 h-8 flex items-center justify-center rounded-[9px] outline-none transition-colors duration-200 shrink-0 bg-white/[0.04] border border-white/[0.07] text-white/30 hover:bg-red-500/[0.18] hover:border-red-500/40 hover:text-red-400"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </motion.button>
        </motion.div>

        {/* ── Live Transcript Strip ── */}
        {isLiveActive && (
          <div
            className="flex items-center h-9 gap-2.5 px-3.5 rounded-b-2xl"
            style={{
              background: "#0a0a0e",
              border: "1px solid rgba(255,255,255,0.06)",
              borderTop: "1px solid rgba(34,197,94,0.15)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            }}
          >
            {/* Live indicator */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inset-0 rounded-full bg-green-400 opacity-50" />
                <span className="relative rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span
                className="text-[8px] font-black uppercase tracking-[0.15em]"
                style={{ color: "rgba(74,222,128,0.75)" }}
              >
                Live
              </span>
            </div>

            <div className="w-px h-3.5 shrink-0" style={{ background: "rgba(255,255,255,0.07)" }} />

            {/* Transcript text */}
            <div
              ref={transcriptScrollRef}
              className="flex-1 min-w-0"
              style={{ overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
            >
              {liveText ? (
                <span className="text-[11.5px] font-sans whitespace-nowrap" style={{ color: "rgba(255,255,255,0.85)" }}>
                  {liveText.split(" ").map((word, i) => {
                    const clean = word.toLowerCase().replace(/[^a-z0-9()^.]/g, "");
                    // Exact match, not substring — `.includes()` here used to highlight
                    // ordinary words that merely *contain* a keyword ("interesting" has
                    // "rest", "rapid"/"capital" have "api", "flaws"/"draws" have "aws"),
                    // which made random conversational words light up as fake tech terms.
                    const isKey = ["array", "string", "tree", "binary", "graph", "hashmap", "queue", "stack", "heap", "dp", "recursion", "complexity", "o(n)", "o(1)", "o(log", "n)", "react", "python", "javascript", "typescript", "sql", "postgresql", "mongodb", "database", "api", "rest", "graphql", "docker", "redis", "kafka", "aws"].includes(clean);
                    return isKey ? (
                      <span key={i} className="px-1 py-0.5 rounded text-[11px] font-extrabold mx-0.5" style={{ color: "#fbbf24", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)" }}>
                        {word}{" "}
                      </span>
                    ) : (
                      word + " "
                    );
                  })}
                </span>
              ) : (
                <span className="text-[11px] font-sans whitespace-nowrap italic" style={{ color: "rgba(255,255,255,0.2)" }}>
                  Listening for interviewer…
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              {liveText && (
                <button
                  onClick={onMicSend}
                  className="flex items-center gap-1 px-2.5 h-6 rounded-[8px] text-[9px] font-bold whitespace-nowrap transition-all duration-150"
                  style={{
                    background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                    color: "#fff",
                    border: "1px solid rgba(139,92,246,0.4)",
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                  Send
                </button>
              )}

              {showNext && (
                <button
                  onClick={onNextQuestion}
                  className="flex items-center gap-1 px-2.5 h-6 rounded-[8px] text-[9px] font-bold whitespace-nowrap transition-all duration-150"
                  style={{
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "rgba(255,255,255,0.55)",
                  }}
                >
                  Next ›
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
