import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Ad, useStore } from "../store/useStore";
import { InterviewHistoryModal } from "../components/InterviewHistoryModal";

const SHORTCUTS = [
  { keys: "Ctrl+E", label: "Screenshot" },
  { keys: "Ctrl+0", label: "Send AI" },
  { keys: "Ctrl+N", label: "Next Q" },
  { keys: "Ctrl+B", label: "Show/Hide" },
  { keys: "Ctrl+G", label: "Start Over" },
  { keys: "Ctrl+↵", label: "Ask AI" },
];

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));

const AdNetworkPlacement: React.FC<{ ad: Ad }> = ({ ad }) => {
  const [reloadKey] = useState(() => `${ad.id}-${Date.now()}`);
  const safeContainerId = (ad.container_id || "").replace(/[^\w-]/g, "");
  const safeScriptUrl = ad.script_url?.startsWith("https://") || ad.script_url?.startsWith("http://") ? ad.script_url : "";

  if (!safeContainerId || !safeScriptUrl) return null;

  const srcDoc = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; width: 100%; min-height: 118px; overflow: hidden; background: transparent; }
      body { display: flex; align-items: center; justify-content: center; }
      #${safeContainerId} { width: 100%; min-height: 118px; }
    </style>
  </head>
  <body>
    <div id="${safeContainerId}"></div>
    <script async="async" data-cfasync="false" src="${escapeHtml(safeScriptUrl)}"></script>
  </body>
</html>`;

  return (
    <iframe
      key={reloadKey}
      title="Sponsored ad"
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      className="mx-3 mt-2 block w-[calc(100%-24px)] rounded-[16px] border-0 bg-white"
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
        await window.ghostly.logoutUser();
        setUser(null);
        setAds([]);
        setAppScreen("login");
        throw new Error(res.status === 403 ? "Your account has been blocked. Contact support." : "Please login again.");
      }
      if (!res.ok) return { latestAds: await getCachedAds() };
      const data = await res.json();
      const latestAds = Array.isArray(data.ads) ? data.ads : await getCachedAds();
      setAds(latestAds);
      await window.ghostly.saveAds(latestAds);
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
      if (!latestActiveAd) {
        setGateAd(null);
        setAppScreen("interview-setup");
        return;
      }
      // All users see ad gate (app is free, ads are the model)
      setGateAd(latestActiveAd);
      setAdGate(true);
      setAdClicked(false);
    } catch (error: any) {
      alert(error.message || "Please login again.");
    } finally {
      setStartStatus("idle");
    }
  };

  const handleContinueAfterAd = () => {
    setAdGate(false);
    setGateAd(null);
    setAppScreen("interview-setup");
  };

  const handleAdClick = () => {
    if (displayAd?.cta_url) {
      window.ghostly.openExternal(displayAd.cta_url);
    }
    setAdClicked(true);
  };

  useEffect(() => {
    window.ghostly
      .getHistory()
      .then((h: any[]) => setHistoryCount(Array.isArray(h) ? h.length : 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!historyOpen) {
      window.ghostly
        .getHistory()
        .then((h: any[]) => setHistoryCount(Array.isArray(h) ? h.length : 0))
        .catch(() => {});
    }
  }, [historyOpen]);

  const handleCheckUpdate = () => {
    setCheckStatus("checking");
    window.ghostly.checkForUpdates();
    setTimeout(() => setCheckStatus((s) => (s === "checking" ? "latest" : s)), 8000);
  };

  const handleLogout = async () => {
    await window.ghostly.logoutUser();
    setUser(null);
    setAds([]);
    setAppScreen("login");
  };

  return (
    <div
      className="h-screen w-full flex items-center justify-center px-3 py-2 overflow-y-auto"
      style={{
        background: "transparent",
        pointerEvents: "auto",
        fontFamily: "'Inter', -apple-system, sans-serif",
        userSelect: "none",
      }}
      onMouseEnter={() => window.ghostly.enableMouse()}
    >
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[300px] flex flex-col gap-2"
        style={{ pointerEvents: "auto" }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="w-9 h-9 rounded-[11px] flex items-center justify-center text-[20px] relative shrink-0"
              style={{
                background: "linear-gradient(135deg, #1c1c22, #111114)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.07), 0 0 16px rgba(235,146,69,0.18)",
                border: "1px solid rgba(235,146,69,0.22)",
              }}
            >
              👻
              <span
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                style={{ background: "#22c55e", border: "2px solid #0a0a0c", boxShadow: "0 0 5px rgba(34,197,94,0.9)" }}
              />
            </motion.div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-[17px] font-black tracking-tight text-white leading-none">Ghotly AI</h1>
                <span
                  className="px-1.5 py-0.5 rounded-full text-[8px] font-black"
                  style={{ background: "rgba(235,146,69,0.18)", border: "1px solid rgba(235,146,69,0.3)", color: "#eb9245" }}
                >
                  v{version}
                </span>
              </div>
              <p className="text-[9px] font-medium mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                {user?.email || "Stealth AI Copilot"}
              </p>
            </div>
          </div>
          <button
            onClick={() => window.ghostly.quit()}
            className="w-7 h-7 flex items-center justify-center rounded-[8px] transition-all shrink-0"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.35)" }}
            onMouseEnter={(e) => { window.ghostly.enableMouse(); e.currentTarget.style.background = "rgba(239,68,68,0.18)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.35)"; e.currentTarget.style.color = "#f87171"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Main Card ── */}
        <div
          className="w-full rounded-[18px] overflow-hidden"
          style={{
            background: "linear-gradient(160deg, #18181f 0%, #111116 100%)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {/* ── Action Buttons ── */}
          <div className="px-3 pt-3 pb-2 flex flex-col gap-2">
            {/* Start Interview — primary CTA */}
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStartInterview}
              disabled={startStatus === "syncing"}
              className="w-full py-3 rounded-[13px] text-[13px] font-extrabold flex items-center justify-center gap-2 relative overflow-hidden group"
              style={{
                background: "linear-gradient(135deg, #eb9245 0%, #d97706 100%)",
                color: "#fff",
                boxShadow: "0 6px 20px rgba(235,146,69,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
                border: "none",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[200%] skew-x-[25deg] group-hover:translate-x-[200%] transition-transform duration-500" />
              <span className="text-[15px] group-hover:scale-110 transition-transform duration-200">⚡</span>
              {startStatus === "syncing" ? "Checking sponsor..." : "Start Interview"}
            </motion.button>

            {/* Secondary row */}
            <div className="flex gap-1.5">
              {/* Check Updates */}
              <button
                onClick={handleCheckUpdate}
                disabled={checkStatus === "checking"}
                className="flex-1 py-2 rounded-[10px] text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all"
                style={{
                  background: checkStatus === "latest" ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.05)",
                  border: checkStatus === "latest" ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.09)",
                  color: checkStatus === "latest" ? "#22c55e" : "rgba(255,255,255,0.5)",
                }}
              >
                {checkStatus === "checking" ? (
                  <><svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>Checking…</>
                ) : checkStatus === "latest" ? (
                  <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>Up to Date</>
                ) : (
                  <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21L21.5 8" /></svg>Check Updates</>
                )}
              </button>

              {/* Last Interviews */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setHistoryOpen(true)}
                className="flex-1 py-2 rounded-[10px] text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                <span className="text-[11px]">📋</span>
                Last Interviews
                {historyCount > 0 && (
                  <span
                    className="px-1 py-0.5 rounded-full text-[8px] font-black"
                    style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
                  >
                    {historyCount}
                  </span>
                )}
              </motion.button>
            </div>
          </div>

          {/* Divider */}
          <div className="mx-3 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

          {/* ── Hotkeys ── */}
          <div className="px-3 py-2.5">
            <p className="text-[7px] font-black uppercase tracking-[0.12em] mb-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
              Hotkeys
            </p>
            <div className="grid grid-cols-3 gap-1">
              {SHORTCUTS.map((s) => (
                <div
                  key={s.keys}
                  className="flex items-center justify-between px-2 py-1.5 rounded-[7px]"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <span className="text-[8px] font-medium truncate mr-1" style={{ color: "rgba(255,255,255,0.4)" }}>{s.label}</span>
                  <kbd
                    className="text-[7px] font-bold font-mono px-1 py-0.5 rounded shrink-0"
                    style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="mx-3 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

          {/* ── User / Plan row ── */}
          <div className="px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {user?.picture ? (
                <img src={user.picture} alt={user.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
              ) : (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black shrink-0"
                  style={{ background: "linear-gradient(135deg, #eb9245, #d97706)" }}
                >
                  {user?.name?.[0]?.toUpperCase() || "U"}
                </div>
              )}
              <div>
                <p className="text-[9px] font-bold text-white/70 leading-none">{user?.name || "Guest"}</p>
                <p className="text-[8px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Free · Sponsor supported
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleLogout}
                className="text-[8px] font-bold px-2 py-1 rounded-[6px] transition-all"
                style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.08)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; e.currentTarget.style.color = "#f87171"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.25)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.35)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      <InterviewHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />

      {/* ── Ad Gate Overlay ── */}
      <AnimatePresence>
        {adGate && displayAd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", pointerEvents: "auto" }}
            onMouseEnter={() => window.ghostly.enableMouse()}
          >
            <motion.div
              initial={{ scale: 0.92, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 12 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="w-[330px] rounded-[24px] overflow-hidden"
              style={{
                background: "linear-gradient(160deg, #ffffff 0%, #f8fafc 55%, #fff7ed 100%)",
                border: "1px solid rgba(15,23,42,0.08)",
                boxShadow: "0 28px 80px rgba(0,0,0,0.55)",
              }}
            >
              {/* Sponsor label */}
              <div className="px-4 pt-4 pb-1 flex items-center justify-between">
                <span className="text-[8px] font-black uppercase tracking-[0.18em]" style={{ color: "rgba(15,23,42,0.38)" }}>Sponsored</span>
              </div>

              {/* Ad media */}
              {displayAd.script_url && displayAd.container_id ? (
                <AdNetworkPlacement ad={displayAd} />
              ) : displayAd.image_url && (
                <div className="mx-3 mt-2 rounded-[16px] overflow-hidden border border-slate-200 bg-slate-100" style={{ height: "124px" }}>
                  <img src={displayAd.image_url} alt="" className="w-full h-full object-cover" />
                </div>
              )}

              {/* Ad content */}
              <div className="px-4 pt-3 pb-1">
                <p className="text-[14px] font-black leading-tight" style={{ color: "#0f172a" }}>{displayAd.title}</p>
                <p className="text-[10px] font-semibold mt-1 leading-relaxed" style={{ color: "rgba(51,65,85,0.72)" }}>{displayAd.description}</p>
              </div>

              {/* Gate notice */}
              <div
                className="mx-3 mt-2 px-3 py-2 rounded-[10px] flex items-start gap-2"
                style={{
                  background: adClicked ? "rgba(22,163,74,0.08)" : "rgba(234,88,12,0.08)",
                  border: adClicked ? "1px solid rgba(22,163,74,0.18)" : "1px solid rgba(234,88,12,0.18)",
                }}
              >
                <span className="text-[12px] mt-0.5 shrink-0">{adClicked ? "✓" : "!"}</span>
                <p className="text-[9px] font-bold leading-relaxed" style={{ color: adClicked ? "rgba(22,101,52,0.95)" : "rgba(154,52,18,0.9)" }}>
                  {adClicked
                    ? "Ad visited! You can now start your interview."
                    : "Ghotly AI stays free through sponsored ads. Click the sponsor button once to unlock your interview."}
                </p>
              </div>

              {/* Buttons */}
              <div className="px-3 pb-3 pt-2.5 flex flex-col gap-2">
                {/* Learn More — must click to unlock */}
                <motion.button
                  whileHover={!adClicked ? { scale: 1.02 } : {}}
                  whileTap={!adClicked ? { scale: 0.97 } : {}}
                  onClick={!adClicked ? handleAdClick : undefined}
                  className="w-full py-2.5 rounded-[11px] text-[11px] font-extrabold transition-all"
                  style={{
                    background: adClicked ? "rgba(22,163,74,0.1)" : "linear-gradient(135deg, #111827, #ea580c)",
                    color: adClicked ? "#15803d" : "#fff",
                    boxShadow: adClicked ? "none" : "0 4px 14px rgba(235,146,69,0.35)",
                    border: adClicked ? "1px solid rgba(22,163,74,0.2)" : "none",
                    cursor: adClicked ? "default" : "pointer",
                  }}
                >
                  {adClicked ? "✓ Visited - Thank you!" : displayAd.cta_text || "Learn More"}
                </motion.button>

                {/* Continue — locked until ad clicked */}
                <button
                  onClick={handleContinueAfterAd}
                  disabled={!adClicked}
                  className="w-full py-2.5 rounded-[11px] text-[11px] font-extrabold transition-all"
                  style={{
                    background: adClicked ? "rgba(15,23,42,0.06)" : "rgba(15,23,42,0.03)",
                    color: adClicked ? "rgba(15,23,42,0.9)" : "rgba(15,23,42,0.28)",
                    border: adClicked ? "1px solid rgba(15,23,42,0.12)" : "1px solid rgba(15,23,42,0.06)",
                    cursor: adClicked ? "pointer" : "not-allowed",
                  }}
                >
                  {adClicked ? "Continue to Interview ->" : "Visit ad first to unlock"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
