import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Ad, useStore } from "../store/useStore";
import { InterviewHistoryModal } from "../components/InterviewHistoryModal";

const SHORTCUTS = [
  { keys: "Ctrl+E",  label: "Screenshot", color: "rgba(139,92,246,0.15)", border: "rgba(139,92,246,0.3)", textColor: "#a78bfa" },
  { keys: "Ctrl+0",  label: "Send AI",    color: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.25)", textColor: "#4ade80" },
  { keys: "Ctrl+N",  label: "Next Q",     color: "rgba(59,130,246,0.1)", border: "rgba(59,130,246,0.25)", textColor: "#60a5fa" },
  { keys: "Ctrl+B",  label: "Show/Hide",  color: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.22)", textColor: "#fbbf24" },
  { keys: "Ctrl+G",  label: "Start Over", color: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)", textColor: "#f87171" },
  { keys: "Ctrl+↵",  label: "Ask AI",     color: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.28)", textColor: "#c4b5fd" },
];

const escapeHtml = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));

const AdNetworkPlacement: React.FC<{ ad: Ad }> = ({ ad }) => {
  const [reloadKey] = useState(() => `${ad.id}-${Date.now()}`);
  const safeContainerId = (ad.container_id || "").replace(/[^\w-]/g, "");
  const safeScriptUrl = ad.script_url?.startsWith("https://") || ad.script_url?.startsWith("http://") ? ad.script_url : "";
  if (!safeContainerId || !safeScriptUrl) return null;
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"/><style>html,body{margin:0;padding:0;width:100%;min-height:118px;overflow:hidden;background:transparent;}body{display:flex;align-items:center;justify-content:center;}#${safeContainerId}{width:100%;min-height:118px;}</style></head><body><div id="${safeContainerId}"></div><script async data-cfasync="false" src="${escapeHtml(safeScriptUrl)}"></script></body></html>`;
  return (
    <iframe key={reloadKey} title="Sponsored ad" srcDoc={srcDoc}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      className="mx-3 mt-2 block w-[calc(100%-24px)] rounded-[14px] border-0"
      style={{ height: "124px" }}
    />
  );
};

export const HomePage: React.FC = () => {
  const { setAppScreen, user, ads, setUser, setAds } = useStore();
  const [checkStatus, setCheckStatus] = useState<"idle" | "checking" | "latest">("idle");
  const [startStatus, setStartStatus] = useState<"idle" | "syncing">("idle");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const version = window.ghostly.getVersion();

  const activeAd = ads.find((a) => a.is_active) || null;
  const [gateAd, setGateAd] = useState<Ad | null>(null);
  const displayAd = gateAd || activeAd;
  const [adGate, setAdGate] = useState(false);
  const [adClicked, setAdClicked] = useState(false);
  const [skipCountdown, setSkipCountdown] = useState(5);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (adGate) {
      setSkipCountdown(5);
      timer = setInterval(() => {
        setSkipCountdown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [adGate]);

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
    } catch (error: any) { alert(error.message || "Please login again."); }
    finally { setStartStatus("idle"); }
  };

  const handleContinueAfterAd = () => { setAdGate(false); setGateAd(null); setAppScreen("interview-setup"); };
  const handleAdClick = () => { if (displayAd?.cta_url) window.ghostly.openExternal(displayAd.cta_url); setAdClicked(true); };

  useEffect(() => {
    window.ghostly.getHistory().then((h: any[]) => setHistoryCount(Array.isArray(h) ? h.length : 0)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!historyOpen) window.ghostly.getHistory().then((h: any[]) => setHistoryCount(Array.isArray(h) ? h.length : 0)).catch(() => {});
  }, [historyOpen]);

  useEffect(() => {
    window.ghostly.enableMouse();
  }, [historyOpen]);

  const handleCheckUpdate = () => {
    setCheckStatus("checking");
    window.ghostly.checkForUpdates();
    setTimeout(() => setCheckStatus((s) => (s === "checking" ? "latest" : s)), 8000);
  };
  const handleLogout = async () => { await window.ghostly.logoutUser(); setUser(null); setAds([]); setAppScreen("login"); };

  return (
    <div
      className="h-screen w-full flex items-center justify-center px-3 py-2 overflow-y-auto"
      style={{ background: "transparent", pointerEvents: "none", fontFamily: "'Inter', -apple-system, sans-serif", userSelect: "none" }}
    >
      {/* Ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(139,92,246,0.09) 0%, transparent 60%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[310px] flex flex-col gap-2 relative z-10"
        style={{ pointerEvents: "auto" }}
        onMouseEnter={() => window.ghostly.enableMouse()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2.5">
            {/* Ghost icon */}
            <div className="relative shrink-0">
              <motion.div
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="w-10 h-10 rounded-[13px] flex items-center justify-center text-[20px]"
                style={{
                  background: "linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(99,102,241,0.12) 100%)",
                  border: "1.5px solid rgba(139,92,246,0.3)",
                  boxShadow: "0 0 20px rgba(139,92,246,0.2), 0 4px 12px rgba(0,0,0,0.4)",
                }}
              >
                👻
              </motion.div>
              <motion.span
                animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                style={{ background: "#22c55e", border: "2px solid #0d0d14", boxShadow: "0 0 8px rgba(34,197,94,0.7)" }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[16px] font-black tracking-tight text-white leading-none">Ghotly AI</h1>
                <span
                  className="px-1.5 py-0.5 rounded-full text-[8px] font-black"
                  style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#a78bfa" }}
                >
                  v{version}
                </span>
              </div>
              <p className="text-[9px] font-medium mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                Stealth AI Copilot
              </p>
            </div>
          </div>
          {/* Quit */}
          <button
            onClick={() => window.ghostly.quit()}
            className="w-7 h-7 flex items-center justify-center rounded-[9px] transition-all shrink-0"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.3)",
            }}
            onMouseEnter={e => {
              window.ghostly.enableMouse();
              e.currentTarget.style.background = "rgba(239,68,68,0.15)";
              e.currentTarget.style.borderColor = "rgba(239,68,68,0.35)";
              e.currentTarget.style.color = "#f87171";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "rgba(255,255,255,0.04)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
              e.currentTarget.style.color = "rgba(255,255,255,0.3)";
            }}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Main Card ── */}
        <div
          className="w-full rounded-[22px] overflow-hidden"
          style={{
            background: "rgba(13,13,20,0.9)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset",
          }}
        >
          {/* ── Violet top accent ── */}
          <div
            className="h-0.5 w-full"
            style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.7), rgba(99,102,241,0.5), transparent)" }}
          />

          {/* ── Action Buttons ── */}
          <div className="px-3 pt-3 pb-2.5 flex flex-col gap-2">
            {/* Start Interview */}
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStartInterview}
              disabled={startStatus === "syncing"}
              className="w-full py-3.5 rounded-[14px] text-[13px] font-extrabold flex items-center justify-center gap-2 relative overflow-hidden"
              style={{
                background: startStatus === "syncing"
                  ? "rgba(139,92,246,0.15)"
                  : "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
                color: "#fff",
                border: "none",
                boxShadow: startStatus === "syncing"
                  ? "none"
                  : "0 6px 24px rgba(139,92,246,0.45), 0 1px 0 rgba(255,255,255,0.2) inset",
              }}
            >
              {/* Shimmer */}
              {startStatus !== "syncing" && (
                <motion.div
                  className="absolute inset-0 w-1/3"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)" }}
                  animate={{ x: ["-100%", "400%"] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
              )}
              {startStatus === "syncing" ? (
                <>
                  <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  <span style={{ color: "rgba(255,255,255,0.6)" }}>Syncing…</span>
                </>
              ) : (
                <>
                  <span className="relative z-10 text-[16px]">⚡</span>
                  <span className="relative z-10">Start Interview</span>
                </>
              )}
            </motion.button>

            {/* Secondary row */}
            <div className="flex gap-2">
              {/* Check Updates */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleCheckUpdate}
                disabled={checkStatus === "checking"}
                className="flex-1 py-2.5 rounded-[11px] text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all"
                style={{
                  background: checkStatus === "latest"
                    ? "rgba(34,197,94,0.1)"
                    : "rgba(255,255,255,0.04)",
                  border: checkStatus === "latest"
                    ? "1px solid rgba(34,197,94,0.3)"
                    : "1px solid rgba(255,255,255,0.08)",
                  color: checkStatus === "latest"
                    ? "#4ade80"
                    : "rgba(255,255,255,0.45)",
                  boxShadow: checkStatus === "latest" ? "0 0 12px rgba(34,197,94,0.15)" : "none",
                }}
                onMouseEnter={e => {
                  if (checkStatus !== "latest") {
                    e.currentTarget.style.background = "rgba(255,255,255,0.07)";
                    e.currentTarget.style.color = "rgba(255,255,255,0.7)";
                  }
                }}
                onMouseLeave={e => {
                  if (checkStatus !== "latest") {
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                    e.currentTarget.style.color = "rgba(255,255,255,0.45)";
                  }
                }}
              >
                {checkStatus === "checking" ? (
                  <><svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Checking…</>
                ) : checkStatus === "latest" ? (
                  <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>Up to Date</>
                ) : (
                  <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21L21.5 8"/></svg>Update</>
                )}
              </motion.button>

              {/* History */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setHistoryOpen(true)}
                className="flex-1 py-2.5 rounded-[11px] text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.45)",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "rgba(139,92,246,0.1)";
                  e.currentTarget.style.borderColor = "rgba(139,92,246,0.25)";
                  e.currentTarget.style.color = "#a78bfa";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.color = "rgba(255,255,255,0.45)";
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                History
                {historyCount > 0 && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[7px] font-black"
                    style={{ background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.35)", color: "#a78bfa" }}
                  >
                    {historyCount}
                  </span>
                )}
              </motion.button>
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="mx-3 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

          {/* ── Hotkeys ── */}
          <div className="px-3 py-3">
            <p className="text-[8px] font-black uppercase tracking-[0.15em] mb-2.5" style={{ color: "rgba(255,255,255,0.22)" }}>
              Hotkeys
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {SHORTCUTS.map((s) => (
                <div
                  key={s.keys}
                  className="flex flex-col items-center justify-center gap-1 px-2 py-2.5 rounded-[11px] transition-all"
                  style={{
                    background: s.color,
                    border: `1px solid ${s.border}`,
                  }}
                >
                  <span className="text-[8px] font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>{s.label}</span>
                  <kbd
                    className="text-[7px] font-bold font-mono px-1.5 py-0.5 rounded-[5px]"
                    style={{
                      background: "rgba(0,0,0,0.25)",
                      color: s.textColor,
                      border: "none",
                    }}
                  >
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="mx-3 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

          {/* ── User row ── */}
          <div className="px-3 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {/* Avatar */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                style={{
                  border: "1.5px solid rgba(139,92,246,0.35)",
                  boxShadow: "0 0 12px rgba(139,92,246,0.2)",
                }}
              >
                {user?.picture ? (
                  <img src={user.picture} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <span
                    className="text-[11px] font-black w-full h-full flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.2))", color: "#a78bfa" }}
                  >
                    {user?.name?.[0]?.toUpperCase() || "U"}
                  </span>
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold leading-none" style={{ color: "rgba(255,255,255,0.78)" }}>
                  {user?.name || "Guest"}
                </p>
                <p className="text-[8px] mt-0.5 font-semibold" style={{ color: "rgba(167,139,250,0.55)" }}>
                  Ad-supported · Free
                </p>
              </div>
            </div>
            {/* Logout */}
            <button
              onClick={handleLogout}
              title="Logout"
              className="w-7 h-7 flex items-center justify-center rounded-[9px] transition-all"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
                color: "rgba(255,255,255,0.28)",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "rgba(239,68,68,0.15)";
                e.currentTarget.style.borderColor = "rgba(239,68,68,0.35)";
                e.currentTarget.style.color = "#f87171";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
                e.currentTarget.style.color = "rgba(255,255,255,0.28)";
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
            </button>
          </div>
        </div>
      </motion.div>

      <InterviewHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />

      {/* ── Ad Gate Overlay ── */}
      <AnimatePresence>
        {adGate && displayAd && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", pointerEvents: "auto" }}
            onMouseEnter={() => window.ghostly.enableMouse()}
          >
            <motion.div
              initial={{ scale: 0.92, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.92, y: 20, opacity: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="w-[320px] rounded-[24px] overflow-hidden flex flex-col gap-0"
              style={{
                background: "rgba(13,13,20,0.96)",
                backdropFilter: "blur(28px)",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.07) inset",
              }}
            >
              {/* Accent top bar */}
              <div
                className="h-0.5"
                style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.7), rgba(99,102,241,0.5), transparent)" }}
              />

              <div className="p-4 flex flex-col gap-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div
                    className="px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-[0.12em]"
                    style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", color: "#a78bfa" }}
                  >
                    📢 Sponsor
                  </div>
                  <motion.div
                    key={adClicked ? "unlocked" : "locked"}
                    initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    className="px-2.5 py-1 rounded-full text-[8px] font-black flex items-center gap-1.5"
                    style={{
                      background: adClicked ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.06)",
                      border: adClicked ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.1)",
                      color: adClicked ? "#4ade80" : "rgba(255,255,255,0.35)",
                    }}
                  >
                    {adClicked ? <>✓ Unlocked</> : <>🔒 Locked</>}
                  </motion.div>
                </div>

                {/* Ad media */}
                {displayAd.script_url && displayAd.container_id ? (
                  <div style={{ borderRadius: "14px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <AdNetworkPlacement ad={displayAd} />
                  </div>
                ) : displayAd.image_url && (
                  <div className="rounded-[14px] overflow-hidden" style={{ height: "118px", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <img src={displayAd.image_url} alt="" className="w-full h-full object-cover" />
                  </div>
                )}

                {/* Ad content */}
                <div>
                  <p className="text-[13px] font-black leading-tight text-white">{displayAd.title}</p>
                  <p className="text-[10px] font-medium mt-1 leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                    {displayAd.description}
                  </p>
                </div>

                {/* Gate notice */}
                <div
                  className="px-3 py-2.5 rounded-xl flex items-start gap-2.5"
                  style={{
                    background: adClicked ? "rgba(34,197,94,0.07)" : "rgba(255,255,255,0.04)",
                    border: adClicked ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <span className="text-[11px] mt-0.5 shrink-0">{adClicked ? "✅" : "🔓"}</span>
                  <p className="text-[9px] font-semibold leading-relaxed" style={{ color: adClicked ? "#4ade80" : "rgba(255,255,255,0.45)" }}>
                    {adClicked
                      ? "Sponsor visited! Tap Continue to start your interview."
                      : "Ghotly AI is free through sponsors. Tap below once to unlock your session."}
                  </p>
                </div>

                {/* Buttons */}
                <div className="flex flex-col gap-2">
                  <motion.button
                    whileHover={!adClicked ? { scale: 1.02, y: -1 } : {}}
                    whileTap={!adClicked ? { scale: 0.97 } : {}}
                    onClick={!adClicked ? handleAdClick : undefined}
                    className="w-full py-3 rounded-[13px] text-[12px] font-extrabold flex items-center justify-center gap-2 transition-all relative overflow-hidden"
                    style={{
                      background: adClicked
                        ? "rgba(34,197,94,0.1)"
                        : "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
                      color: adClicked ? "#4ade80" : "#fff",
                      border: adClicked ? "1px solid rgba(34,197,94,0.25)" : "none",
                      boxShadow: adClicked
                        ? "0 0 16px rgba(34,197,94,0.15)"
                        : "0 6px 20px rgba(139,92,246,0.4), 0 1px 0 rgba(255,255,255,0.18) inset",
                      cursor: adClicked ? "default" : "pointer",
                    }}
                  >
                    {!adClicked && (
                      <motion.div
                        className="absolute inset-0 w-1/3"
                        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)" }}
                        animate={{ x: ["-100%", "400%"] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      />
                    )}
                    <span className="relative z-10">
                      {adClicked ? <>✓ Visited — Thank you!</> : <>{displayAd.cta_text || "Visit Sponsor"} ↗</>}
                    </span>
                  </motion.button>

                  <motion.button
                    onClick={adClicked || skipCountdown === 0 ? handleContinueAfterAd : undefined}
                    disabled={!adClicked && skipCountdown > 0}
                    whileHover={adClicked || skipCountdown === 0 ? { scale: 1.01 } : {}}
                    whileTap={adClicked || skipCountdown === 0 ? { scale: 0.98 } : {}}
                    className="w-full py-3 rounded-[13px] text-[12px] font-extrabold flex items-center justify-center gap-2 transition-all"
                    style={{
                      background: adClicked || skipCountdown === 0 ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.03)",
                      border: adClicked || skipCountdown === 0 ? "1px solid rgba(139,92,246,0.35)" : "1px solid rgba(255,255,255,0.08)",
                      color: adClicked || skipCountdown === 0 ? "#a78bfa" : "rgba(255,255,255,0.2)",
                      cursor: adClicked || skipCountdown === 0 ? "pointer" : "not-allowed",
                    }}
                  >
                    {adClicked || skipCountdown === 0
                      ? <>Continue to Interview →</>
                      : <>Visit sponsor or wait {skipCountdown}s…</>}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
