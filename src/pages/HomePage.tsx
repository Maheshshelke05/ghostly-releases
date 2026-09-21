import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Ad, useStore } from "../store/useStore";
import { InterviewHistoryModal } from "../components/InterviewHistoryModal";
import { HomeSettingsPanel } from "../components/HomeSettingsPanel";
import { JobPortalModal, JobPortalPreview, BriefcaseIcon, JOB_PORTAL_URL } from "../components/JobPortalModal";
import { AudioDiagnostics } from "../components/AudioDiagnostics";
import { AI_PROVIDERS } from "./ApiSetupPage";
import { activeProviderKey, isProviderDisabled } from "../lib/providerState";

// Same light palette as LoginPage.tsx. Layout: greeting + readiness chips, the one
// primary action (Start Interview), History / Job Portal, then a Tools & help grid
// (audio test, support, blog, demo). API keys, shortcuts and updates stay in Settings.
const INK = "#15162b";
const SUBTLE = "#6b7280";
const BORDER = "#e8e8ee";
const SURFACE = "#f7f7fa";
const FAINT = "#9ca3af";

const MoveIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8b8fa3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="5 9 2 12 5 15" /><polyline points="9 5 12 2 15 5" /><polyline points="15 19 12 22 9 19" /><polyline points="19 9 22 12 19 15" />
    <line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" />
  </svg>
);
const GearIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8b8fa3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ExternalArrow = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

const CONTAINER = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.12 } } };
const ITEM = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] as any } } };

type ChipTone = "ok" | "warn" | "off";
const CHIP_TONES: Record<ChipTone, { bg: string; border: string; text: string; dot: string }> = {
  ok:   { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d", dot: "#22c55e" },
  warn: { bg: "#fffbeb", border: "#fde68a", text: "#b45309", dot: "#f59e0b" },
  off:  { bg: "#f2f3f6", border: "#e8e8ee", text: "#6b7280", dot: "#9ca3af" },
};

const StatusChip: React.FC<{ tone: ChipTone; label: string; value: string; onClick?: () => void; title?: string }> = ({ tone, label, value, onClick, title }) => {
  const c = CHIP_TONES[tone];
  const Tag: any = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      title={title}
      className={`flex-1 min-w-0 flex items-center gap-2 px-3 h-9 rounded-xl text-left outline-none ${onClick ? "transition-transform hover:-translate-y-px active:scale-[0.98]" : ""}`}
      style={{ background: c.bg, border: `1px solid ${c.border}` }}
    >
      <span className="relative flex w-2 h-2 shrink-0">
        {tone === "ok" && <span className="absolute inset-0 rounded-full animate-ping opacity-50" style={{ background: c.dot }} />}
        <span className="relative w-2 h-2 rounded-full" style={{ background: c.dot }} />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[8px] font-black uppercase tracking-[0.12em]" style={{ color: c.text, opacity: 0.7 }}>{label}</span>
        <span className="block text-[10.5px] font-bold truncate" style={{ color: c.text }}>{value}</span>
      </span>
    </Tag>
  );
};

const ToolTile: React.FC<{ icon: React.ReactNode; title: string; desc: string; external?: boolean; onClick: () => void }> = ({ icon, title, desc, external, onClick }) => (
  <motion.button
    whileHover={{ y: -1.5 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className="group flex items-center gap-2.5 px-2.5 h-[52px] rounded-2xl text-left outline-none transition-shadow hover:shadow-[0_8px_20px_rgba(20,20,40,0.08)] focus-visible:ring-2 focus-visible:ring-[#c7c9f0]"
    style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
  >
    <span className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[15px] shrink-0" style={{ background: "#fff", border: `1px solid ${BORDER}` }}>{icon}</span>
    <span className="min-w-0 flex-1 leading-tight">
      <span className="block text-[11.5px] font-bold" style={{ color: INK }}>{title}</span>
      <span className="block text-[9.5px] font-medium truncate" style={{ color: FAINT }}>{desc}</span>
    </span>
    {external && <span className="shrink-0 opacity-30 group-hover:opacity-80 transition-opacity" style={{ color: INK }}><ExternalArrow /></span>}
  </motion.button>
);

export const HomePage: React.FC = () => {
  const { setAppScreen, user, ads, setUser, setAds, setLoginError, settings } = useStore();
  const [startStatus, setStartStatus] = useState<"idle" | "syncing">("idle");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);

  // Readiness shown before the user starts: is there a usable AI key / Deepgram key?
  const provider = AI_PROVIDERS.find((p) => p.id === settings.activeProvider);
  const aiTone: ChipTone = isProviderDisabled(settings, settings.activeProvider) ? "off" : activeProviderKey(settings) ? "ok" : "warn";
  const aiValue = aiTone === "ok" ? provider?.label || "Ready" : aiTone === "off" ? `${provider?.label || "AI"} is off` : "Add an AI key";
  const hasDeepgram = !!(settings.deepgramApiKey?.trim() || (import.meta as any).env?.VITE_DEEPGRAM_API_KEY);

  const activeAd = ads.find((a) => a.is_active) || null;
  const [gateAd, setGateAd] = useState<Ad | null>(null);
  const displayAd = gateAd || activeAd;
  const [adGate, setAdGate] = useState(false);
  const [adClicked, setAdClicked] = useState(false);
  const continueRef = useRef<HTMLButtonElement>(null);

  // Continue only exists once the sponsor link has been opened — no timer bypass.
  useEffect(() => {
    if (adClicked) {
      const t = setTimeout(() => continueRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [adClicked]);

  const getCachedAds = async () => {
    const stateAds = useStore.getState().ads;
    if (stateAds.length > 0) return stateAds;
    const savedAds = await window.ghostly.getAds().catch(() => []);
    return Array.isArray(savedAds) ? savedAds : [];
  };

  const refreshAccount = async () => {
    if (!user?.idToken) throw new Error("Please login again.");
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/subscription`, {
        headers: { Authorization: `Bearer ${user.idToken}` },
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 401 || res.status === 403) {
        await window.ghostly.logoutUser(); setUser(null); setAds([]); setAppScreen("login");
        throw new Error(res.status === 403 ? "Your account has been blocked. Contact support." : "Please login again.");
      }
      if (!res.ok) return { latestAds: await getCachedAds() };
      const data = await res.json();
      const latestAds = Array.isArray(data.ads) ? data.ads : await getCachedAds();
      setAds(latestAds); await window.ghostly.saveAds(latestAds);
      return { latestAds };
    } catch (error: any) {
      if (error?.message?.includes("login") || error?.message?.includes("blocked")) throw error;
      return { latestAds: await getCachedAds() };
    }
  };

  const handleStartInterview = async () => {
    if (startStatus === "syncing") return;
    setStartStatus("syncing");
    try {
      const { latestAds } = await refreshAccount();
      const latestActiveAd = latestAds.find((a: any) => a.is_active) || null;
      if (!latestActiveAd) { setGateAd(null); setAppScreen("interview-setup"); return; }
      setGateAd(latestActiveAd); setAdGate(true); setAdClicked(false);
    } catch (error: any) {
      setLoginError(error.message || "Please login again.");
    }
    finally { setStartStatus("idle"); }
  };

  const handleContinueAfterAd = () => { setAdGate(false); setGateAd(null); setAppScreen("interview-setup"); };
  const handleAdClick = () => { window.ghostly.openExternal(JOB_PORTAL_URL); setAdClicked(true); };

  useEffect(() => {
    window.ghostly.getHistory().then((h: any[]) => setHistoryCount(Array.isArray(h) ? h.length : 0)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!historyOpen) window.ghostly.getHistory().then((h: any[]) => setHistoryCount(Array.isArray(h) ? h.length : 0)).catch(() => {});
  }, [historyOpen]);

  useEffect(() => { window.ghostly.enableMouse(); }, [historyOpen, settingsOpen, adGate, jobOpen, audioOpen]);

  const handleLogout = async () => { await window.ghostly.logoutUser(); setUser(null); setAds([]); setAppScreen("login"); };

  return (
    <div
      className="h-screen w-full flex items-center justify-center overflow-hidden"
      style={{ background: "transparent", pointerEvents: "none", fontFamily: "'Inter', -apple-system, sans-serif", userSelect: "none" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[400px] flex flex-col"
        style={{
          pointerEvents: "auto",
          background: "#ffffff",
          borderRadius: "22px",
          border: `1px solid ${BORDER}`,
          boxShadow: "0 24px 60px rgba(20,20,40,0.28), 0 2px 8px rgba(20,20,40,0.08)",
          overflow: "hidden",
        }}
        onMouseEnter={() => window.ghostly.enableMouse()}
      >
        {/* ── Header: icon + name + version (left), move/settings/close (right) ── */}
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{ WebkitAppRegion: "drag", borderBottom: `1px solid ${BORDER}` } as React.CSSProperties}
        >
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: "15px", lineHeight: 1 }}>👻</span>
            <span className="text-[12px] font-bold" style={{ color: INK }}>Ghotly AI</span>
            <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black" style={{ background: "#f2f3f6", color: SUBTLE }}>
              v{window.ghostly.getVersion()}
            </span>
          </div>
          <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            <span className="w-6 h-6 rounded-[7px] flex items-center justify-center cursor-move" style={{ background: "#f2f3f6" }} title="Drag to move">
              <MoveIcon />
            </span>
            <button onClick={() => setSettingsOpen(true)} className="w-6 h-6 rounded-[7px] flex items-center justify-center transition-colors hover:bg-[#e8e8ee]" style={{ background: "#f2f3f6" }} title="Settings">
              <GearIcon />
            </button>
            <button onClick={() => window.ghostly.quit()} className="w-6 h-6 rounded-[7px] flex items-center justify-center transition-colors hover:brightness-95" style={{ background: "#ef4444" }} title="Quit">
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <motion.div variants={CONTAINER} initial="hidden" animate="show" className="px-5 pt-4 pb-4 flex flex-col gap-3.5">
          {/* Greeting */}
          <motion.div variants={ITEM} className="flex items-center gap-3">
            <motion.div
              animate={{ y: [0, -2, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="relative w-11 h-11 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "#f2f3f6" }}
            >
              <span style={{ fontSize: "22px", lineHeight: 1 }}>👻</span>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full" style={{ background: "#22c55e", border: "2px solid #ffffff" }} />
            </motion.div>
            <div className="min-w-0">
              <p className="text-[15px] font-extrabold leading-tight truncate" style={{ color: INK }}>Welcome back, {user?.name?.split(" ")[0] || "there"} 👋</p>
              <p className="text-[11px] font-medium mt-0.5" style={{ color: SUBTLE }}>Ready when you are.</p>
            </div>
          </motion.div>

          {/* Readiness */}
          <motion.div variants={ITEM} className="flex gap-2">
            <StatusChip
              tone={aiTone}
              label="AI"
              value={aiValue}
              onClick={aiTone === "ok" ? undefined : () => setSettingsOpen(true)}
              title={aiTone === "ok" ? undefined : "Open Settings → API keys"}
            />
            <StatusChip
              tone={hasDeepgram ? "ok" : "warn"}
              label="Audio"
              value={hasDeepgram ? "Deepgram ready" : "Add Deepgram key"}
              onClick={hasDeepgram ? undefined : () => setSettingsOpen(true)}
              title={hasDeepgram ? undefined : "Open Settings → API keys"}
            />
          </motion.div>

          {/* Primary action */}
          <motion.div variants={ITEM}>
            <motion.button
              whileHover={{ scale: 1.015, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStartInterview}
              disabled={startStatus === "syncing"}
              className="relative w-full h-[52px] rounded-full flex items-center justify-center gap-2 outline-none border-none overflow-hidden"
              style={{ background: INK, color: "#fff", boxShadow: "0 8px 22px rgba(21,22,43,0.30)", opacity: startStatus === "syncing" ? 0.75 : 1 }}
            >
              {startStatus !== "syncing" && (
                <motion.span
                  aria-hidden
                  className="absolute top-0 bottom-0 w-16 pointer-events-none"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent)", skewX: -20 }}
                  initial={{ x: "-150%" }}
                  animate={{ x: ["-150%", "700%"] }}
                  transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity, repeatDelay: 3.5 }}
                />
              )}
              {startStatus === "syncing" ? (
                <>
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  <span className="text-[14px] font-bold">Syncing…</span>
                </>
              ) : (
                <>
                  <span className="text-[16px]">⚡</span>
                  <span className="text-[14px] font-bold">Start Interview</span>
                </>
              )}
            </motion.button>
          </motion.div>

          {/* History + Job Portal */}
          <motion.div variants={ITEM} className="grid grid-cols-2 gap-2">
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setHistoryOpen(true)}
              className="h-11 rounded-full flex items-center justify-center gap-2 outline-none"
              style={{ background: "#f2f3f6", color: INK, border: `1px solid ${BORDER}` }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.3" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              <span className="text-[12.5px] font-bold">History</span>
              {historyCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black" style={{ background: "#e8e8ee", color: SUBTLE }}>{historyCount}</span>
              )}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setJobOpen(true)}
              className="h-11 rounded-full flex items-center justify-center gap-2 outline-none"
              style={{ background: "#f4fbe0", color: INK, border: "1px solid #dcebb0" }}
            >
              <BriefcaseIcon size={13} color="#4d6b12" />
              <span className="text-[12.5px] font-bold">Job Portal</span>
              <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider" style={{ background: "#a3e635", color: INK }}>New</span>
            </motion.button>
          </motion.div>

          {/* Tools & help */}
          <motion.div variants={ITEM}>
            <p className="text-[9px] font-black uppercase tracking-[0.14em] mb-2 px-0.5" style={{ color: FAINT }}>Tools &amp; help</p>
            <div className="grid grid-cols-2 gap-2">
              <ToolTile icon="🎙️" title="Audio test" desc="Check mic & audio" onClick={() => setAudioOpen(true)} />
              <ToolTile icon="💬" title="Support" desc="Talk to us" external onClick={() => window.ghostly.openExternal("https://www.ghotlyai.in/support/")} />
              <ToolTile icon="📰" title="Blog" desc="Guides & tips" external onClick={() => window.ghostly.openExternal("https://www.ghotlyai.in/blog/")} />
              <ToolTile icon="▶️" title="Demo" desc="Watch it in action" external onClick={() => window.ghostly.openExternal("https://www.ghotlyai.in/#demo")} />
            </div>
          </motion.div>

          {/* User row + logout */}
          <motion.div variants={ITEM} className="flex items-center justify-between pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden" style={{ border: `1.5px solid ${BORDER}` }}>
                {user?.picture ? (
                  <img src={user.picture} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[11px] font-black w-full h-full flex items-center justify-center" style={{ background: "#f2f3f6", color: INK }}>
                    {user?.name?.[0]?.toUpperCase() || "U"}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold leading-none truncate" style={{ color: INK }}>{user?.name || "Guest"}</p>
                <p className="text-[9px] mt-1 font-semibold" style={{ color: SUBTLE }}>Ad-supported · Free</p>
              </div>
            </div>
            <button onClick={handleLogout} title="Log out" className="px-2.5 h-7 rounded-lg text-[10px] font-bold transition-colors hover:bg-[#f2f3f6]" style={{ color: SUBTLE }}>
              Log out
            </button>
          </motion.div>
        </motion.div>
      </motion.div>

      <InterviewHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <JobPortalModal open={jobOpen} onClose={() => setJobOpen(false)} />
      {audioOpen && <AudioDiagnostics onClose={() => setAudioOpen(false)} />}
      {settingsOpen && <HomeSettingsPanel onClose={() => setSettingsOpen(false)} />}

      {/* ── Ad Gate Overlay ── */}
      <AnimatePresence>
        {adGate && displayAd && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ pointerEvents: "none" }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.92, y: 20, opacity: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="w-[320px] rounded-[22px] overflow-hidden flex flex-col"
              style={{ pointerEvents: "auto", background: "#ffffff", border: `1px solid ${BORDER}`, boxShadow: "0 24px 60px rgba(20,20,40,0.3)" }}
              onMouseEnter={() => window.ghostly.enableMouse()}
              onMouseLeave={() => window.ghostly.disableMouse()}
            >
              <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-[0.12em]" style={{ background: "#f2f3f6", color: SUBTLE }}>
                    📢 Sponsor
                  </div>
                  <motion.div
                    key={adClicked ? "unlocked" : "locked"}
                    initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    className="px-2.5 py-1 rounded-full text-[8px] font-black flex items-center gap-1.5"
                    style={{ background: adClicked ? "#f0fdf4" : "#f2f3f6", color: adClicked ? "#16a34a" : SUBTLE }}
                  >
                    {adClicked ? <>✓ Unlocked</> : <>🔒 Locked</>}
                  </motion.div>
                </div>

                <JobPortalPreview />

                <div>
                  <p className="text-[14px] font-black leading-tight" style={{ color: INK }}>GhostlyAI Job Portal</p>
                  <p className="text-[10.5px] font-medium mt-1 leading-relaxed" style={{ color: SUBTLE }}>
                    Verified government &amp; private job alerts in 2 minutes, on Telegram and Android.
                  </p>
                </div>

                <div className="px-3 py-2.5 rounded-xl flex items-start gap-2.5 transition-colors duration-300" style={{ background: adClicked ? "#f0fdf4" : "#f7f7fa" }}>
                  <span className="text-[11px] mt-0.5 shrink-0">{adClicked ? "✅" : "🔓"}</span>
                  <p className="text-[9.5px] font-semibold leading-relaxed transition-colors duration-300" style={{ color: adClicked ? "#16a34a" : SUBTLE }}>
                    {adClicked
                      ? "Thanks for visiting! Tap Continue to start your interview."
                      : "Ghotly AI is free through sponsors. Tap Watch once to unlock your session."}
                  </p>
                </div>

                <div className="flex flex-col">
                  <motion.button
                    whileHover={!adClicked ? { scale: 1.02, y: -1 } : {}}
                    whileTap={!adClicked ? { scale: 0.97 } : {}}
                    onClick={!adClicked ? handleAdClick : undefined}
                    className="w-full py-3 rounded-full text-[12px] font-extrabold flex items-center justify-center gap-2"
                    style={{
                      background: adClicked ? "#f0fdf4" : INK,
                      color: adClicked ? "#16a34a" : "#fff",
                      border: adClicked ? "1px solid #bbf7d0" : "1px solid transparent",
                      cursor: adClicked ? "default" : "pointer",
                      transition: "background 0.3s, color 0.3s, border-color 0.3s",
                    }}
                  >
                    {adClicked ? <>✓ Visited — Thank you!</> : <>Watch ↗</>}
                  </motion.button>

                  {!adClicked && (
                    <p className="text-center text-[8.5px] font-medium mt-1.5" style={{ color: "#9aa0ae" }}>Opens job.ghotlyai.in in your browser</p>
                  )}

                  {/* Height/opacity-animated (not mounted/unmounted) so it can't stall the
                      overlay's own exit animation; inert until Watch has been clicked. */}
                  <motion.div
                    initial={false}
                    animate={adClicked ? { height: "auto", opacity: 1, marginTop: 8 } : { height: 0, opacity: 0, marginTop: 0 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    style={{ overflow: "hidden", pointerEvents: adClicked ? "auto" : "none" }}
                    aria-hidden={!adClicked}
                  >
                    <motion.button
                      ref={continueRef}
                      tabIndex={adClicked ? 0 : -1}
                      onClick={adClicked ? handleContinueAfterAd : undefined}
                      whileHover={{ scale: 1.02, y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      className="w-full py-3 rounded-full text-[12px] font-extrabold flex items-center justify-center gap-2 outline-none"
                      style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", boxShadow: "0 8px 20px rgba(22,163,74,0.32)" }}
                    >
                      Continue to Interview →
                    </motion.button>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
