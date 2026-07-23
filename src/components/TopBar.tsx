import React, { useState, useEffect, useRef } from "react";

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
  activeTab: "ai" | "screen" | "chat" | "support";
  onTabChange: (tab: "ai" | "screen" | "chat" | "support") => void;
  onStop: () => void;
  autoAI: boolean;
  onToggleAutoAI: () => void;
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
  { id: "ai" as const,      label: "AI Answer", Icon: MicIcon,    color: "#8b5cf6", glow: "rgba(139,92,246,0.5)" },
  { id: "screen" as const,  label: "Screen",    Icon: ScreenIcon, color: "#3b82f6", glow: "rgba(59,130,246,0.45)" },
  { id: "chat" as const,    label: "Chat",      Icon: ChatIcon,   color: "#a78bfa", glow: "rgba(167,139,250,0.45)" },
  { id: "support" as const, label: "Report",   Icon: null,       color: "#fb923c", glow: "rgba(251,146,60,0.45)" },
];

export const TopBar: React.FC<TopBarProps> = ({
  onOpenSettings, settingsOpen, isLiveActive, onToggleLive, onScreenAnalysis,
  liveText = "", onMicSend, onNextQuestion, showNext = false,
  activeTab, onTabChange, onStop, autoAI, onToggleAutoAI,
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

  const activeTabData = TABS.find(t => t.id === activeTab);

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
        {/* ── Main Bar ── */}
        <div
          className={`flex items-center h-10 px-2.5 gap-1.5 ${isLiveActive ? "rounded-t-2xl" : "rounded-2xl"}`}
          style={{
            background: "linear-gradient(180deg, rgba(18,18,24,0.99) 0%, rgba(12,12,16,0.99) 100%)",
            backdropFilter: "blur(48px)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.3)",
          }}
        >
          {/* ── Brand ── */}
          <div className="flex items-center gap-2 shrink-0 pr-1.5">
            <div
              className="w-6 h-6 rounded-[8px] flex items-center justify-center text-[12px] shrink-0 relative"
              style={{
                background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
                boxShadow: "0 2px 8px rgba(139,92,246,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}
            >
              👻
            </div>
            <span
              className="text-[12px] font-black tracking-tight whitespace-nowrap"
              style={{ color: "rgba(255,255,255,0.92)", letterSpacing: "-0.3px" }}
            >
              GhotlyAI
            </span>
          </div>

          {/* ── Divider ── */}
          <div className="w-px h-5 shrink-0" style={{ background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.1), transparent)" }} />

          {/* ── Tabs ── */}
          <div
            className="flex items-center gap-0.5 p-0.5 rounded-[11px] shrink-0"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const isStopBtn = tab.id === "ai" && isLiveActive;

              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className="flex items-center gap-1.5 px-2.5 h-7 rounded-[9px] text-[10px] font-bold whitespace-nowrap transition-all duration-200"
                  style={
                    isStopBtn
                      ? {
                          background: "linear-gradient(135deg, rgba(239,68,68,0.25), rgba(220,38,38,0.2))",
                          border: "1px solid rgba(239,68,68,0.4)",
                          color: "#f87171",
                          boxShadow: "0 0 12px rgba(239,68,68,0.2)",
                        }
                      : isActive
                      ? {
                          background: `linear-gradient(135deg, ${tab.color}22, ${tab.color}15)`,
                          border: `1px solid ${tab.color}55`,
                          color: tab.color,
                          boxShadow: `0 0 14px ${tab.glow}`,
                        }
                      : {
                          color: "rgba(255,255,255,0.3)",
                          background: "transparent",
                          border: "1px solid transparent",
                        }
                  }
                  onMouseEnter={e => {
                    if (!isActive && !isStopBtn) {
                      e.currentTarget.style.color = "rgba(255,255,255,0.65)";
                      e.currentTarget.style.background = "rgba(255,255,255,0.07)";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive && !isStopBtn) {
                      e.currentTarget.style.color = "rgba(255,255,255,0.3)";
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.borderColor = "transparent";
                    }
                  }}
                >
                  {isStopBtn ? (
                    <>
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: "#f87171" }} />
                      <span>Stop</span>
                    </>
                  ) : tab.Icon ? (
                    <>
                      <tab.Icon />
                      <span>{tab.label}</span>
                    </>
                  ) : (
                    <span>{tab.label}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Auto AI pill — only when live ── */}
          {isLiveActive && (
            <>
              <div className="w-px h-5 shrink-0" style={{ background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.08), transparent)" }} />
              <button
                onClick={onToggleAutoAI}
                title={autoAI ? "Auto AI ON — click to disable" : "Auto AI OFF — click to enable"}
                className="flex items-center gap-1.5 px-2.5 h-7 rounded-[9px] text-[10px] font-bold whitespace-nowrap transition-all duration-200 shrink-0"
                style={
                  autoAI
                    ? {
                        background: "rgba(34,197,94,0.12)",
                        border: "1px solid rgba(34,197,94,0.3)",
                        color: "#4ade80",
                        boxShadow: "0 0 10px rgba(34,197,94,0.15)",
                      }
                    : {
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.07)",
                        color: "rgba(255,255,255,0.25)",
                      }
                }
              >
                <span className="relative flex w-1.5 h-1.5 shrink-0">
                  {autoAI && <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-50" />}
                  <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: autoAI ? "#4ade80" : "rgba(255,255,255,0.15)" }} />
                </span>
                Auto
              </button>
            </>
          )}

          {/* ── Spacer ── */}
          <div className="flex-1" />

          {/* ── Active tab indicator pill ── */}
          {!isLiveActive && activeTabData && (
            <div
              className="flex items-center gap-1.5 px-2 h-6 rounded-[7px] shrink-0"
              style={{
                background: `${activeTabData.color}12`,
                border: `1px solid ${activeTabData.color}30`,
              }}
            >
              <span className="w-1 h-1 rounded-full" style={{ background: activeTabData.color }} />
              <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: `${activeTabData.color}cc` }}>
                {activeTab === "support" ? "Support" : activeTab === "ai" ? "AI" : activeTab === "screen" ? "Screen" : "Chat"}
              </span>
            </div>
          )}

          {/* ── Timer ── */}
          <div
            className="flex items-center gap-1.5 px-2.5 h-7 rounded-[9px] shrink-0"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
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
            <span className="text-[10px] font-mono tabular-nums" style={{ color: "rgba(255,255,255,0.4)" }}>{fmt(timer)}</span>
          </div>

          {/* ── End Session ── */}
          <button
            onClick={onStop}
            className="flex items-center gap-1.5 px-2.5 h-7 rounded-[9px] text-[10px] font-bold whitespace-nowrap transition-all duration-200 shrink-0"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.15)",
              color: "rgba(239,68,68,0.55)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "rgba(239,68,68,0.18)";
              e.currentTarget.style.borderColor = "rgba(239,68,68,0.4)";
              e.currentTarget.style.color = "#f87171";
              e.currentTarget.style.boxShadow = "0 0 12px rgba(239,68,68,0.2)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "rgba(239,68,68,0.08)";
              e.currentTarget.style.borderColor = "rgba(239,68,68,0.15)";
              e.currentTarget.style.color = "rgba(239,68,68,0.55)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
            End
          </button>


          {/* ── Close ── */}
          <button
            onClick={() => window.ghostly.quit()}
            className="w-8 h-8 flex items-center justify-center rounded-[9px] transition-all duration-200 shrink-0"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.3)" }}
            onMouseEnter={e => { window.ghostly.enableMouse(); e.currentTarget.style.background = "rgba(239,68,68,0.18)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.4)"; e.currentTarget.style.color = "#f87171"; e.currentTarget.style.boxShadow = "0 0 10px rgba(239,68,68,0.2)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.3)"; e.currentTarget.style.boxShadow = "none"; }}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Live Transcript Strip ── */}
        {isLiveActive && (
          <div
            className="flex items-center h-9 gap-2.5 px-3.5 rounded-b-2xl"
            style={{
              background: "linear-gradient(180deg, rgba(10,10,14,0.99) 0%, rgba(8,8,11,0.99) 100%)",
              backdropFilter: "blur(48px)",
              border: "1px solid rgba(255,255,255,0.05)",
              borderTop: "1px solid rgba(34,197,94,0.12)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
          >
            {/* Live indicator */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inset-0 rounded-full bg-green-400 opacity-50" />
                <span className="relative rounded-full h-2 w-2 bg-green-500" style={{ boxShadow: "0 0 6px rgba(34,197,94,0.9)" }} />
              </span>
              <span
                className="text-[8px] font-black uppercase tracking-[0.15em]"
                style={{ color: "rgba(74,222,128,0.7)" }}
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
                <span className="text-[11.5px] font-sans whitespace-nowrap" style={{ color: "rgba(255,255,255,0.75)" }}>
                  {liveText}
                </span>
              ) : (
                <span className="text-[11px] font-sans whitespace-nowrap italic" style={{ color: "rgba(255,255,255,0.18)" }}>
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
                    boxShadow: "0 2px 8px rgba(139,92,246,0.45)",
                    border: "1px solid rgba(139,92,246,0.3)",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 3px 14px rgba(139,92,246,0.6)"; e.currentTarget.style.transform = "translateY(-0.5px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(139,92,246,0.45)"; e.currentTarget.style.transform = "none"; }}
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
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.55)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
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
