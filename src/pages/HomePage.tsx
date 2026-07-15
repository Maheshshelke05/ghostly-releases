import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Ad, useStore } from "../store/useStore";
import { InterviewHistoryModal } from "../components/InterviewHistoryModal";

const BASE = "#1c1917";
const nm = (raised = true) =>
  raised
    ? "6px 6px 14px rgba(0,0,0,0.55), -3px -3px 8px rgba(255,255,255,0.04)"
    : "inset 4px 4px 10px rgba(0,0,0,0.5), inset -2px -2px 6px rgba(255,255,255,0.04)";

const SHORTCUTS = [
  { keys: "Ctrl+E",  label: "Screenshot" },
  { keys: "Ctrl+0",  label: "Send AI"    },
  { keys: "Ctrl+N",  label: "Next Q"     },
  { keys: "Ctrl+B",  label: "Show/Hide"  },
  { keys: "Ctrl+G",  label: "Start Over" },
  { keys: "Ctrl+↵",  label: "Ask AI"     },
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
    if (historyOpen) {
      window.ghostly.enableMouse();
    } else {
      window.ghostly.disableMouse();
    }
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
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[300px] flex flex-col gap-2"
        style={{ pointerEvents: "auto" }}
        onMouseEnter={() => window.ghostly.enableMouse()}
        onMouseLeave={() => window.ghostly.disableMouse()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2.5">
            {/* Ghost icon — neumorphic raised circle */}
            <div className="relative shrink-0">
              <motion.div
                animate={{ scale: [1, 1.04, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="w-9 h-9 rounded-[12px] flex items-center justify-center text-[19px]"
                style={{
                  background: BASE,
                  boxShadow: `${nm()}, 0 0 0 1.5px rgba(200,137,74,0.2)`,
                }}
              >
                👻
              </motion.div>
              <motion.span
                animate={{ scale: [1, 1.35, 1], opacity: [1, 0.6, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                style={{ background: "#22c55e", border: "2px solid #0c0a09", boxShadow: "0 0 6px rgba(34,197,94,0.7)" }}
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-[17px] font-black tracking-tight text-white leading-none">Ghotly AI</h1>
                <span
                  className="px-1.5 py-0.5 rounded-full text-[8px] font-black"
                  style={{
                    background: BASE,
                    boxShadow: nm(false),
                    color: "#c8894a",
                    border: "none",
                  }}
                >
                  v{version}
                </span>
              </div>
              <p className="text-[9px] font-medium mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                Stealth AI Copilot
              </p>
            </div>
          </div>
          {/* Quit */}
          <button
            onClick={() => window.ghostly.quit()}
            className="w-7 h-7 flex items-center justify-center rounded-[8px] transition-all shrink-0"
            style={{ background: BASE, boxShadow: nm(), color: "rgba(255,255,255,0.28)" }}
            onMouseEnter={(e) => { window.ghostly.enableMouse(); e.currentTarget.style.boxShadow = nm(false); e.currentTarget.style.color = "#f87171"; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = nm(); e.currentTarget.style.color = "rgba(255,255,255,0.28)"; }}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Main Card — neumorphic raised panel ── */}
        <div
          className="w-full rounded-[20px] overflow-hidden"
          style={{ background: BASE, boxShadow: nm() }}
        >
          {/* ── Action Buttons ── */}
          <div className="px-3 pt-3 pb-2.5 flex flex-col gap-2">

            {/* Start Interview — inset orange glow primary */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStartInterview}
              disabled={startStatus === "syncing"}
              className="w-full py-3 rounded-[14px] text-[13px] font-extrabold flex items-center justify-center gap-2 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #c8894a 0%, #b27838 100%)",
                color: "#fff",
                boxShadow: startStatus === "syncing"
                  ? nm(false)
                  : "4px 4px 12px rgba(0,0,0,0.5), -2px -2px 6px rgba(255,255,255,0.04), 0 0 20px rgba(200,137,74,0.3)",
                border: "none",
              }}
            >
              {startStatus === "syncing" ? (
                <><svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Checking…</>
              ) : (
                <><span className="text-[15px]">⚡</span>Start Interview</>
              )}
            </motion.button>

            {/* Secondary row */}
            <div className="flex gap-2">
              {/* Check Updates */}
              <button
                onClick={handleCheckUpdate}
                disabled={checkStatus === "checking"}
                className="flex-1 py-2 rounded-[11px] text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all"
                style={{
                  background: BASE,
                  boxShadow: checkStatus === "latest" ? nm(false) : nm(),
                  color: checkStatus === "latest" ? "#22c55e" : "rgba(255,255,255,0.4)",
                  border: "none",
                }}
              >
                {checkStatus === "checking" ? (
                  <><svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Checking…</>
                ) : checkStatus === "latest" ? (
                  <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>Up to Date</>
                ) : (
                  <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21L21.5 8"/></svg>Update</>
                )}
              </button>

              {/* History */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setHistoryOpen(true)}
                className="flex-1 py-2 rounded-[11px] text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all"
                style={{ background: BASE, boxShadow: nm(), color: "rgba(255,255,255,0.4)", border: "none" }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = nm(false); }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = nm(); }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                History
                {historyCount > 0 && (
                  <span
                    className="px-1 py-0.5 rounded-full text-[7px] font-black"
                    style={{ background: BASE, boxShadow: nm(false), color: "#c8894a" }}
                  >{historyCount}</span>
                )}
              </motion.button>
            </div>
          </div>

          {/* ── Neumorphic Groove Divider ── */}
          <div className="mx-3 py-1">
            <div className="h-px" style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04), 0 -1px 0 rgba(0,0,0,0.35)", background: "transparent" }} />
          </div>

          {/* ── Hotkeys ── */}
          <div className="px-3 py-2.5">
            <p className="text-[7px] font-black uppercase tracking-[0.14em] mb-2" style={{ color: "rgba(255,255,255,0.2)" }}>
              Hotkeys
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {SHORTCUTS.map((s) => (
                <div
                  key={s.keys}
                  className="flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-[10px]"
                  style={{ background: BASE, boxShadow: nm(false) }}
                >
                  <span className="text-[7.5px] font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>{s.label}</span>
                  <kbd
                    className="text-[6.5px] font-bold font-mono px-1.5 py-0.5 rounded-[5px]"
                    style={{
                      background: BASE,
                      boxShadow: nm(),
                      color: "#c8894a",
                      border: "none",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>

          {/* ── Groove Divider ── */}
          <div className="mx-3 py-1">
            <div className="h-px" style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04), 0 -1px 0 rgba(0,0,0,0.35)", background: "transparent" }} />
          </div>

          {/* ── User row ── */}
          <div className="px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                style={{ background: BASE, boxShadow: nm() }}
              >
                {user?.picture ? (
                  <img src={user.picture} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-[10px] font-black">{user?.name?.[0]?.toUpperCase() || "U"}</span>
                )}
              </div>
              <div>
                <p className="text-[9px] font-bold leading-none" style={{ color: "rgba(255,255,255,0.7)" }}>
                  {user?.name || "Guest"}
                </p>
                <p className="text-[7.5px] mt-0.5 font-medium" style={{ color: "#c8894a", opacity: 0.65 }}>
                  Ad-supported · Free
                </p>
              </div>
            </div>
            {/* Logout — neumorphic icon button */}
            <button
              onClick={handleLogout}
              title="Logout"
              className="w-7 h-7 flex items-center justify-center rounded-[8px] transition-all"
              style={{ background: BASE, boxShadow: nm(), color: "rgba(255,255,255,0.28)" }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = nm(false); e.currentTarget.style.color = "#f87171"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = nm(); e.currentTarget.style.color = "rgba(255,255,255,0.28)"; }}
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
            style={{ background: "transparent", pointerEvents: "auto" }}
            onMouseEnter={() => window.ghostly.enableMouse()}
          >
            <motion.div
              initial={{ scale: 0.91, y: 16 }} animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.91, y: 16 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="w-[315px] rounded-[22px] overflow-hidden p-3 flex flex-col gap-2"
              style={{ background: BASE, boxShadow: "10px 10px 28px rgba(0,0,0,0.65), -4px -4px 12px rgba(255,255,255,0.04)" }}
            >
              {/* Top bar */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div
                    className="px-2.5 py-1 rounded-full text-[7.5px] font-black uppercase tracking-[0.1em]"
                    style={{ background: BASE, boxShadow: nm(false), color: "#c8894a" }}
                  >
                    📢 Sponsor
                  </div>
                </div>
                <motion.div
                  key={adClicked ? "unlocked" : "locked"}
                  initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="px-2 py-0.5 rounded-full text-[7.5px] font-black flex items-center gap-1"
                  style={{
                    background: BASE,
                    boxShadow: nm(false),
                    color: adClicked ? "#22c55e" : "#c8894a",
                  }}
                >
                  {adClicked ? <>✓ Unlocked</> : <>🔒 Locked</>}
                </motion.div>
              </div>

              {/* Ad media — neumorphic frame */}
              {displayAd.script_url && displayAd.container_id ? (
                <div style={{ borderRadius: "14px", overflow: "hidden", boxShadow: nm(false) }}>
                  <AdNetworkPlacement ad={displayAd} />
                </div>
              ) : displayAd.image_url && (
                <div className="rounded-[14px] overflow-hidden" style={{ height: "118px", boxShadow: nm(false) }}>
                  <img src={displayAd.image_url} alt="" className="w-full h-full object-cover" />
                </div>
              )}

              {/* Ad content */}
              <div className="px-1">
                <p className="text-[13px] font-black leading-tight text-white">{displayAd.title}</p>
                <p className="text-[9.5px] font-medium mt-1 leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {displayAd.description}
                </p>
              </div>

              {/* Gate notice — inset chip */}
              <div
                className="px-3 py-2 rounded-[11px] flex items-start gap-2"
                style={{ background: BASE, boxShadow: nm(false) }}
              >
                <span className="text-[11px] mt-0.5 shrink-0">{adClicked ? "✅" : "🔓"}</span>
                <p className="text-[8.5px] font-semibold leading-relaxed" style={{ color: adClicked ? "#22c55e" : "rgba(255,255,255,0.48)" }}>
                  {adClicked
                    ? "Sponsor visited! Tap Continue to start your interview."
                    : "Ghotly AI is free through sponsors. Tap below once to unlock your session."}
                </p>
              </div>

              {/* Buttons */}
              <div className="flex flex-col gap-2 px-0.5">
                {/* Learn More */}
                <motion.button
                  whileHover={!adClicked ? { scale: 1.02 } : {}}
                  whileTap={!adClicked ? { scale: 0.97 } : {}}
                  onClick={!adClicked ? handleAdClick : undefined}
                  className="w-full py-2.5 rounded-[12px] text-[11px] font-extrabold flex items-center justify-center gap-2 transition-all"
                  style={{
                    background: adClicked ? BASE : "linear-gradient(135deg, #c8894a 0%, #b27838 100%)",
                    color: adClicked ? "#22c55e" : "#fff",
                    boxShadow: adClicked
                      ? nm(false)
                      : "4px 4px 12px rgba(0,0,0,0.5), -2px -2px 6px rgba(255,255,255,0.04), 0 0 18px rgba(200,137,74,0.28)",
                    border: "none",
                    cursor: adClicked ? "default" : "pointer",
                  }}
                >
                  {adClicked ? <>✓ Visited — Thank you!</> : <>{displayAd.cta_text || "Visit Sponsor"} ↗</>}
                </motion.button>

                {/* Continue */}
                <motion.button
                  onClick={handleContinueAfterAd} disabled={!adClicked}
                  whileHover={adClicked ? { scale: 1.01 } : {}}
                  whileTap={adClicked ? { scale: 0.98 } : {}}
                  className="w-full py-2.5 rounded-[12px] text-[11px] font-extrabold flex items-center justify-center gap-2 transition-all"
                  style={{
                    background: BASE,
                    boxShadow: adClicked ? nm() : nm(false),
                    color: adClicked ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.18)",
                    border: "none",
                    cursor: adClicked ? "pointer" : "not-allowed",
                  }}
                >
                  {adClicked
                    ? <>Continue to Interview →</>
                    : <><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Visit sponsor first</>}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
