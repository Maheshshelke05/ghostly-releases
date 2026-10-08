import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store/useStore";
import { MinimizedLogo } from "../components/MinimizedLogo";
import { useMinimizedClickThrough } from "../hooks/useMinimizedClickThrough";
import GhostMascot from "../components/ghost/GhostMascot";

interface LoginPageProps {
  // A known, real failure (auth server down, backend error, timeout) reported
  // by App.tsx — shown immediately instead of the generic "still waiting"
  // message, since we actually know what went wrong here.
  externalError?: string | null;
  onClearExternalError?: () => void;
}

// Light-theme palette for this screen (shared with the Home screen).
const INK = "#15162b";
const SUBTLE = "#6b7280";
const FAINT = "#9ca3af";
const CARD_BG = "#ffffff";
const BORDER = "#e8e8ee";
const SURFACE = "#f7f7fa";

const LOGIN_URL = "https://www.ghotlyai.in/electron-login";
const SUPPORT_URL = "https://www.ghotlyai.in/support/";

// Give the "opening your browser" state a beat to register before the card shrinks away.
const MINIMIZE_DELAY_MS = 450;

const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const SlidersIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="21" x2="6" y2="14" /><line x1="6" y1="10" x2="6" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
    <line x1="18" y1="21" x2="18" y2="16" /><line x1="18" y1="12" x2="18" y2="3" />
    <line x1="3" y1="14" x2="9" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="15" y1="16" x2="21" y2="16" />
  </svg>
);
const DocIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
    <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" />
  </svg>
);
const MoveIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8b8fa3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="5 9 2 12 5 15" /><polyline points="9 5 12 2 15 5" /><polyline points="15 19 12 22 9 19" /><polyline points="19 9 22 12 19 15" />
    <line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" />
  </svg>
);
const MinimizeIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8b8fa3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);
const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const PowerIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" />
  </svg>
);

const CONTAINER = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.12 } } };
const ITEM = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: [0.16, 1, 0.3, 1] as any } } };

export const LoginPage: React.FC<LoginPageProps> = ({ externalError, onClearExternalError }) => {
  const { setAppScreen, user } = useStore();
  const [status, setStatus] = useState<"idle" | "waiting">("idle");
  // No way back if the browser tab is closed, the local auth callback (port
  // 7842) gets blocked by a firewall/antivirus, or anything else in the OAuth
  // handoff fails silently — this screen used to just say "Waiting..." forever
  // with no retry, so a user in that state had to force-quit the whole app.
  const [timedOut, setTimedOut] = useState(false);
  // Bumped on every handleLogin() call (including "Try Again"). The failsafe
  // timer effect below used to key only on [status] — since status is already
  // "waiting" when Try Again is clicked, React saw no dependency change and
  // never re-armed the timer, so a second stall left the user permanently
  // stuck with no banner and no way out except Quit.
  const [attempt, setAttempt] = useState(0);

  // Minimized = the card has shrunk into the logo so the browser (where the login
  // happens) is fully visible. Nothing is unmounted, so the wait keeps running.
  const cardRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [fullyHidden, setFullyHidden] = useState(false);
  const [pillPos, setPillPos] = useState({ left: 12, top: 8 });
  const minimizeTimer = useRef<number | undefined>(undefined);

  const minimize = useCallback(() => {
    window.clearTimeout(minimizeTimer.current);
    const r = cardRef.current?.getBoundingClientRect();
    // Land the logo exactly where the card's own logo is, so the card visibly shrinks into it.
    if (r && r.width > 0) setPillPos({ left: Math.round(r.left + 8), top: Math.round(r.top + 2) });
    setCollapsed(true);
  }, []);

  const expand = useCallback(() => {
    window.clearTimeout(minimizeTimer.current);
    setFullyHidden(false);
    setCollapsed(false);
    window.ghostly.enableMouse();
  }, []);

  useEffect(() => () => window.clearTimeout(minimizeTimer.current), []);

  useMinimizedClickThrough(collapsed);

  useEffect(() => {
    if (user) setAppScreen("home");
  }, [user]);

  useEffect(() => {
    if (status !== "waiting") { setTimedOut(false); return; }
    const t = setTimeout(() => setTimedOut(true), 20000);
    return () => clearTimeout(t);
  }, [status, attempt]);

  // A real failure reported by the app: bring the card back so the user sees what
  // went wrong, and drop the "waiting" state so Login works as a retry.
  useEffect(() => {
    if (!externalError) return;
    setStatus("idle");
    expand();
  }, [externalError, expand]);

  const handleLogin = () => {
    setStatus("waiting");
    setTimedOut(false);
    onClearExternalError?.();
    setAttempt((a) => a + 1);
    window.ghostly.openExternal(LOGIN_URL);
    window.clearTimeout(minimizeTimer.current);
    minimizeTimer.current = window.setTimeout(minimize, MINIMIZE_DELAY_MS);
  };

  const handleCancel = () => { setStatus("idle"); setTimedOut(false); };

  const features = [
    { Icon: ShieldIcon, title: "Screenshare protection", desc: "Hidden from screen sharing" },
    { Icon: SlidersIcon, title: "Customizable AI responses", desc: "Your style, your keys" },
    { Icon: DocIcon, title: "Screen-analyze coding help", desc: "Solves what is on screen" },
  ];

  return (
    <div
      className="h-screen w-full flex items-center justify-center overflow-hidden"
      style={{
        background: "transparent",
        pointerEvents: "none",
        fontFamily: "'Inter', -apple-system, sans-serif",
        userSelect: "none",
      }}
    >
      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, y: 14, scale: 0.96 }}
        animate={collapsed ? { opacity: 0, y: 0, scale: 0.16 } : { opacity: 1, y: 0, scale: 1 }}
        transition={collapsed ? { duration: 0.38, ease: [0.5, 0, 0.75, 0] } : { duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
        onAnimationComplete={() => { if (collapsed) setFullyHidden(true); }}
        className="w-full max-w-[380px] flex flex-col"
        style={{
          pointerEvents: "auto",
          background: CARD_BG,
          borderRadius: "22px",
          border: `1px solid ${BORDER}`,
          boxShadow: "0 24px 60px rgba(20,20,40,0.28), 0 2px 8px rgba(20,20,40,0.08)",
          overflow: "hidden",
          transformOrigin: "24px 22px",
          visibility: fullyHidden ? "hidden" : "visible",
        }}
        onMouseEnter={() => window.ghostly.enableMouse()}
      >
        {/* ── Header: logo + name (click to minimize), move / minimize / close ── */}
        <div
          className="flex items-center justify-between px-3.5 py-2.5"
          style={{ WebkitAppRegion: "drag", borderBottom: `1px solid ${BORDER}` } as React.CSSProperties}
        >
          <motion.button
            onClick={minimize}
            whileHover="hover"
            whileTap={{ scale: 0.96 }}
            title="Minimize — shrink to the logo (click the logo to reopen)"
            aria-label="Minimize Ghotly AI"
            className="group flex items-center gap-1.5 -ml-1 pl-1 pr-2 h-7 rounded-[9px] outline-none transition-colors hover:bg-[#f2f3f6]"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <motion.span variants={{ hover: { rotate: [0, -10, 8, 0], scale: 1.1, transition: { duration: 0.5 } } }} style={{ lineHeight: 0, display: "inline-block" }}><GhostMascot size={22} variant="calm" alt="" /></motion.span>
            <span className="text-[12px] font-bold" style={{ color: INK }}>Ghotly AI</span>
          </motion.button>
          <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            <span className="w-6 h-6 rounded-[7px] flex items-center justify-center cursor-move" style={{ background: "#f2f3f6" }} title="Drag to move">
              <MoveIcon />
            </span>
            <button onClick={minimize} className="w-6 h-6 rounded-[7px] flex items-center justify-center transition-colors hover:bg-[#e8e8ee]" style={{ background: "#f2f3f6" }} title="Minimize">
              <MinimizeIcon />
            </button>
            <button onClick={() => window.ghostly.quit()} className="w-6 h-6 rounded-[7px] flex items-center justify-center transition-colors hover:brightness-95" style={{ background: "#ef4444" }} title="Quit">
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <motion.div variants={CONTAINER} initial="hidden" animate="show" className="px-7 pt-5 pb-4 flex flex-col items-center gap-3.5">
          {/* Mascot */}
          <motion.div variants={ITEM} className="relative flex items-center justify-center">
            <motion.span
              aria-hidden
              className="absolute w-[84px] h-[84px] rounded-full"
              style={{ background: "radial-gradient(circle, rgba(109,111,176,0.16), transparent 70%)" }}
              animate={{ scale: [1, 1.18, 1], opacity: [0.9, 0.4, 0.9] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="relative w-[84px] h-[84px] rounded-full flex items-center justify-center"
              style={{ background: "#f2f3f6", boxShadow: "inset 0 0 0 1px rgba(20,20,40,0.04)" }}
            >
              <GhostMascot size={72} variant="hello" alt="" />
              <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full" style={{ background: "#22c55e", border: "2.5px solid #ffffff" }} />
            </motion.div>
          </motion.div>

          <motion.div variants={ITEM} className="text-center">
            <h1 className="text-[19px] font-extrabold leading-none tracking-tight" style={{ color: INK }}>Welcome to Ghotly AI</h1>
            <p className="text-[11.5px] font-medium mt-2 leading-snug" style={{ color: SUBTLE }}>
              Log in to your Ghotly AI account<br />to start your interview.
            </p>
          </motion.div>

          {externalError && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="w-full flex items-start gap-2 px-3 py-2.5 rounded-xl"
              style={{ background: "#fef2f2", border: "1px solid #fecaca" }}
              role="alert"
            >
              <span className="text-[10px] shrink-0">⚠️</span>
              <p className="text-[10.5px] font-semibold leading-relaxed" style={{ color: "#b91c1c" }}>{externalError}</p>
            </motion.div>
          )}

          <motion.div variants={ITEM} className="w-full">
            {status === "waiting" ? (
              <div className="w-full flex flex-col gap-2">
                <div
                  className="w-full h-[50px] rounded-full flex items-center justify-center gap-2.5"
                  style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}
                >
                  <motion.span
                    className="w-2 h-2 rounded-full"
                    style={{ background: "#22c55e" }}
                    animate={{ opacity: [1, 0.4, 1], scale: [1, 1.3, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                  <span className="text-[12.5px] font-bold" style={{ color: "#16a34a" }}>Waiting for browser login...</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: SURFACE }}>
                  <span className="text-[10px] shrink-0">💡</span>
                  <p className="text-[10px] font-semibold leading-relaxed" style={{ color: SUBTLE }}>
                    Finish signing in on the website — this window opens by itself once you are logged in.
                  </p>
                </div>
                {timedOut && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-2 px-3 py-2.5 rounded-xl"
                    style={{ background: "#fffbeb", border: "1px solid #fde68a" }}
                  >
                    <p className="text-[10px] font-semibold leading-relaxed" style={{ color: "#92400e" }}>
                      Taking longer than expected. If the browser tab was closed or login didn't finish, try again below.
                    </p>
                    <div className="flex gap-1.5">
                      <button onClick={handleLogin} className="flex-1 py-1.5 rounded-lg text-[10.5px] font-bold transition-all hover:brightness-110" style={{ background: INK, color: "#fff" }}>
                        Try Again
                      </button>
                      <button onClick={handleCancel} className="flex-1 py-1.5 rounded-lg text-[10.5px] font-bold transition-all hover:bg-white" style={{ background: "#f2f3f6", border: `1px solid ${BORDER}`, color: SUBTLE }}>
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            ) : (
              <>
                <motion.button
                  whileHover={{ scale: 1.015, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleLogin}
                  className="relative w-full h-[50px] rounded-full flex items-center justify-center gap-2 outline-none border-none overflow-hidden"
                  style={{ background: INK, color: "#fff", boxShadow: "0 8px 22px rgba(21,22,43,0.30)" }}
                >
                  <motion.span
                    aria-hidden
                    className="absolute top-0 bottom-0 w-16 pointer-events-none"
                    style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent)", skewX: -20 }}
                    initial={{ x: "-150%" }}
                    animate={{ x: ["-150%", "650%"] }}
                    transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity, repeatDelay: 3.5 }}
                  />
                  <span className="text-[13.5px] font-bold">Login with Ghotly AI</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg>
                </motion.button>
                <p className="text-center text-[9.5px] font-medium mt-2" style={{ color: FAINT }}>
                  Opens your browser · this window shrinks to the logo.
                </p>
              </>
            )}
          </motion.div>

          {/* ── Feature list — folds away while waiting / on an error so the card never outgrows the window ── */}
          <motion.div variants={ITEM} className="w-full">
          <AnimatePresence initial={false}>
            {status !== "waiting" && !externalError && (
              <motion.div
                key="features"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="w-full"
                style={{ overflow: "hidden" }}
              >
                <div className="w-full flex flex-col gap-1.5 pt-0.5">
                  {features.map(({ Icon, title, desc }) => (
                    <div key={title} className="flex items-center gap-3 rounded-xl px-3 h-[38px]" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                      <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#fff", border: `1px solid ${BORDER}` }}><Icon /></span>
                      <span className="min-w-0 leading-tight">
                        <span className="block text-[11.5px] font-bold" style={{ color: INK }}>{title}</span>
                        <span className="block text-[9px] font-medium" style={{ color: FAINT }}>{desc}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </motion.div>

          {/* ── Footer: quit + help ── */}
          <motion.div variants={ITEM} className="w-full flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
            <button
              onClick={() => window.ghostly.quit()}
              className="flex items-center gap-1.5 px-2.5 h-8 -ml-2.5 rounded-lg text-[11px] font-bold outline-none transition-colors hover:bg-[#fef2f2] hover:text-[#dc2626]"
              style={{ color: SUBTLE }}
            >
              <PowerIcon /> Quit
            </button>
            <button
              onClick={() => window.ghostly.openExternal(SUPPORT_URL)}
              className="px-2.5 h-8 -mr-2.5 rounded-lg text-[11px] font-bold outline-none transition-colors hover:bg-[#f2f3f6]"
              style={{ color: SUBTLE }}
            >
              Need help? ↗
            </button>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* ── Minimized: the logo, where the card's own logo was ── */}
      <AnimatePresence>
        {collapsed && (
          <MinimizedLogo
            key="login-logo"
            onExpand={expand}
            busy={status === "waiting" && !timedOut}
            warn={status === "waiting" && timedOut}
            left={pillPos.left}
            top={pillPos.top}
            title={status === "waiting" ? (timedOut ? "Login is taking longer than expected — click to see" : "Waiting for browser login — click to see") : "Open Ghotly AI"}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
