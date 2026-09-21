import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "./store/useStore";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { InterviewSetupPage } from "./pages/InterviewSetupPage";
import { ApiSetupPage } from "./pages/ApiSetupPage";
import { AudioSetupPage } from "./pages/AudioSetupPage";
import { Home } from "./pages/Home";
import { UpdateAnimation } from "./components/UpdateAnimation";
import { SplashScreen } from "./components/SplashScreen";
import "./styles/global.css";

type UpdateState = "idle" | "checking" | "available" | "downloading" | "installing" | "ready" | "error";

// Mirrors REMAPPABLE_SHORTCUTS' labels in SettingsPanel.tsx — kept as a small
// local map here since that file isn't shared with App.tsx.
const SHORTCUT_LABELS: Record<string, string> = {
  captureAndSolve: "Screenshot (Ctrl+E)",
  solve: "Ask AI (Ctrl+Enter)",
  toggleVisibility: "Show / Hide (Ctrl+B)",
  startOver: "Start Over (Ctrl+G)",
  nextQuestion: "Next Question (Ctrl+N)",
  manualSend: "Send to AI (Ctrl+0)",
  prevQuestion: "Scroll Up (Ctrl+8)",
  nextQuestionPage: "Scroll Down (Ctrl+2)",
};

const App: React.FC = () => {
  const { appScreen, setAppScreen, setSettings, setHistory, setUser, setAds, user, loginError, setLoginError } = useStore();
  const [updateState, setUpdateState] = React.useState<UpdateState>("idle");
  const [updateVersion, setUpdateVersion] = React.useState("");
  const [updatePercent, setUpdatePercent] = React.useState(0);
  const [updateError, setUpdateError] = React.useState("");
  const [showFullScreenAnimation, setShowFullScreenAnimation] = React.useState(false);
  const [showSplash, setShowSplash] = React.useState(true);
  const [appReady, setAppReady] = React.useState(false);
  const [hotkeyConflict, setHotkeyConflict] = React.useState<string[] | null>(null);
  // loginError/setLoginError now live in the Zustand store (see useStore.ts)
  // instead of local state — surfaced to LoginPage to distinguish a real
  // failure (server error, auth server down, timeout, blocked account) from
  // "still waiting for the browser." Shared via the store so HomePage.tsx's
  // own forced-logout path can set it too, instead of falling back to a
  // blocking native alert().

  const applyAccountPayload = async (data: any) => {
    const savedAds = await window.ghostly.getAds().catch(() => []);
    const currentAds = useStore.getState().ads;
    const latestAds = Array.isArray(data.ads)
      ? data.ads
      : currentAds.length > 0
        ? currentAds
        : Array.isArray(savedAds)
          ? savedAds
          : [];
    useStore.getState().setAds(latestAds);
    await window.ghostly.saveAds(latestAds);
  };

  const handleBlockedAuth = async () => {
    await window.ghostly.logoutUser();
    useStore.getState().setUser(null);
    useStore.getState().setAds([]);
    useStore.getState().setAppScreen("login");
  };

  useEffect(() => {
    const offAvailable  = window.ghostly.onUpdateAvailable((v) => { setUpdateVersion(v); setUpdateState("available"); });
    const offProgress   = window.ghostly.onUpdateProgress((p) => { setUpdatePercent(p); setUpdateState("downloading"); setShowFullScreenAnimation(true); });
    const offDownloaded = window.ghostly.onUpdateDownloaded(() => {
      setUpdateState("installing");
      setTimeout(() => { setUpdateState("ready"); setTimeout(() => setShowFullScreenAnimation(false), 3000); }, 2000);
    });
    const offNotAvail = window.ghostly.onUpdateNotAvailable(() => setUpdateState("idle"));
    const offError    = window.ghostly.onUpdateError((msg) => {
      const safeMsg = String(msg).replace(/[\r\n]/g, " ").slice(0, 200);
      console.error("[Update]", safeMsg);
      setUpdateError(safeMsg);
      setUpdateState("error");
      setShowFullScreenAnimation(true);
      setTimeout(() => { setShowFullScreenAnimation(false); setUpdateState("idle"); }, 3000);
    });
    return () => { offAvailable(); offProgress(); offDownloaded(); offNotAvail(); offError(); };
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [savedSettings, savedHistory, savedUser, savedAds] = await Promise.all([
          window.ghostly.getSettings(),
          window.ghostly.getHistory(),
          window.ghostly.getUser(),
          window.ghostly.getAds(),
        ]);
        if (savedSettings) {
          // Build-time VITE_*_API_KEY vars are meant only to seed a *first*
          // install that has no saved key yet — env var used to take priority
          // over the saved key even after a user explicitly cleared it in
          // Settings (savedSettings.apiKeys.gemini === ""), silently
          // resurrecting a key they'd removed, on every single launch. `??`
          // (not `||`) matters here: an explicitly-cleared "" must NOT fall
          // through — only a truly absent (undefined) saved key should.
          const merged = {
            ...savedSettings,
            apiKeys: {
              ...savedSettings.apiKeys,
              gemini:    savedSettings.apiKeys?.gemini    ?? import.meta.env.VITE_GEMINI_API_KEY    ?? "",
              groq:      savedSettings.apiKeys?.groq      ?? import.meta.env.VITE_GROQ_API_KEY      ?? "",
              openai:    savedSettings.apiKeys?.openai    ?? import.meta.env.VITE_OPENAI_API_KEY    ?? "",
              anthropic: savedSettings.apiKeys?.anthropic ?? import.meta.env.VITE_ANTHROPIC_API_KEY ?? "",
            },
            deepgramApiKey: savedSettings.deepgramApiKey ?? import.meta.env.VITE_DEEPGRAM_API_KEY ?? "",
          };
          setSettings(merged);
          window.ghostly.setOpacity(1);
        }
        if (savedHistory) setHistory(savedHistory);
        if (savedUser) setUser(savedUser);
        if (savedAds) setAds(savedAds);
      } catch (err) {
        // Used to assume any failure here meant "first run" — a genuinely
        // corrupted/unreadable electron-store file (e.g. an interrupted write
        // during a crash) hits this exact path too, silently dropping a
        // returning user's settings/history/login with zero indication their
        // data failed to load rather than never having existed. Still
        // proceeds with defaults either way (that's the only reasonable
        // recovery), but now at least it's not silent.
        console.error("[Ghostly] Failed to load saved app data:", err);
      }
      setAppReady(true);
    };
    loadData();
  }, []);

  useEffect(() => {
    window.ghostly.enableMouse();
    const t1 = setTimeout(() => window.ghostly.enableMouse(), 100);
    const t2 = setTimeout(() => window.ghostly.enableMouse(), 400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [appScreen]);

  // Extracted out of the auth-token effect below (instead of being defined
  // inline inside it) so the deep-link effect can also call it — a deep link
  // arriving needs the exact same completion logic as the normal POST flow.
  const handleAuthToken = async ({ token, user }: { token: string; user: any }) => {
    setLoginError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/subscription`, {
        headers: { Authorization: `Bearer ${token}` },
        // OAuth had already succeeded by the time this runs — an unbounded
        // fetch here used to mean a slow/unreachable backend left the user
        // stuck on "Waiting for browser login..." forever with no real
        // diagnostic, even though login itself was fine.
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 403) {
        await handleBlockedAuth();
        // Electron's alert() opens a native OS dialog — unlike the app's own
        // window, that dialog is NOT covered by stealth (WDA_EXCLUDEFROMCAPTURE
        // only applies to the BrowserWindow it's set on), so this could
        // genuinely show up in a live screen-share, and it blocks the whole
        // renderer thread until dismissed. handleBlockedAuth() already routes
        // back to LoginPage, so reuse its own error banner instead.
        setLoginError("Your Ghotly AI account has been blocked. Please contact support if this is a mistake.");
        return;
      }
      if (!res.ok) {
        console.error(`[Ghostly] /subscription returned ${res.status} after login`);
        setLoginError(`Server error (${res.status}) finishing login. Please try again in a moment.`);
        return;
      }
      const data = await res.json();
      const fullUser = { ...user, idToken: token };
      setUser(fullUser);
      await window.ghostly.saveUser(fullUser);
      await applyAccountPayload(data);
      setAppScreen("home");
    } catch (err) {
      console.error("[Ghostly] Failed to complete login:", err);
      const isTimeout = err instanceof Error && err.name === "TimeoutError";
      setLoginError(isTimeout
        ? "Server took too long to respond. Check your connection and try again."
        : "Something went wrong finishing login. Please try again.");
    }
  };

  useEffect(() => {
    // Covers the case where Google OAuth (completed in the system browser, via
    // the website's AuthCallback page) posts the token to this app's local
    // auth server before this listener has even mounted — that message would
    // otherwise be lost and login would look permanently stuck.
    window.ghostly.getPendingAuthToken().then((pending) => {
      if (pending) handleAuthToken(pending);
    });

    const offAuth = window.ghostly.onAuthToken(handleAuthToken);
    return () => offAuth();
  }, []);

  useEffect(() => {
    // The ghostly:// custom-protocol handoff (second-instance / macOS
    // open-url) was fully wired in the main process but had no renderer
    // listener at all — if that path were ever exercised instead of the
    // localhost:7842 POST the app actually relies on, the event vanished
    // silently and login would sit on "Waiting..." until its own timeout.
    // No producer currently encodes an auth payload into this URL, so the
    // safe thing to do here (without inventing an unverified format) is
    // re-check the same pending-auth-token buffer the POST flow already
    // uses — if a token did land around the same time, this picks it up
    // instead of leaving the deep link a complete dead end.
    const offDeepLink = window.ghostly.onDeepLink((url) => {
      console.warn("[Ghostly] Received deep link (unexpected — no producer sends this today):", url);
      window.ghostly.getPendingAuthToken().then((pending) => {
        if (pending) handleAuthToken(pending);
      });
    });
    return () => offDeepLink();
  }, []);

  useEffect(() => {
    window.ghostly.getPendingHotkeyConflict().then((pending) => {
      if (pending && pending.length) setHotkeyConflict(pending);
    });
    const offHotkeyConflict = window.ghostly.onHotkeyConflict((failed) => {
      if (failed && failed.length) setHotkeyConflict(failed);
    });
    return () => offHotkeyConflict();
  }, []);

  useEffect(() => {
    window.ghostly.getPendingAuthServerError().then((pending) => {
      if (pending) setLoginError(pending);
    });
    const offAuthServerError = window.ghostly.onAuthServerError((message) => setLoginError(message));
    return () => offAuthServerError();
  }, []);

  useEffect(() => {
    const offShow = window.ghostly.onShow(() => {
      setTimeout(() => {
        if (useStore.getState().appScreen !== "interview") window.ghostly.enableMouse();
      }, 60);
      const { user: currentUser } = useStore.getState();
      if (currentUser?.idToken) {
        fetch(`${import.meta.env.VITE_API_URL}/subscription`, {
          headers: { Authorization: `Bearer ${currentUser.idToken}` },
          signal: AbortSignal.timeout(10000),
        })
          .then(async (r) => {
            if (r.status === 403) { await handleBlockedAuth(); return null; }
            if (!r.ok) return null;
            return r.json();
          })
          .then(async (data) => { if (data) await applyAccountPayload(data); })
          .catch(() => {});
      }
    });
    return () => offShow();
  }, []);

  useEffect(() => {
    if (!appReady || !user?.idToken) return;
    fetch(`${import.meta.env.VITE_API_URL}/subscription`, {
      headers: { Authorization: `Bearer ${user.idToken}` },
      signal: AbortSignal.timeout(10000),
    })
      .then(async (r) => {
        if (r.status === 403) { await handleBlockedAuth(); return null; }
        if (!r.ok) return null;
        return r.json();
      })
      .then(async (data) => { if (data) await applyAccountPayload(data); })
      .catch(() => {});
  }, [appReady, user?.idToken]);

  // Periodic heartbeat every 60s to track user screen time and active status
  useEffect(() => {
    if (!user?.idToken) return;
    const appVersion = window.ghostly?.getVersion ? window.ghostly.getVersion() : "v3.4.0";
    
    const sendHeartbeat = () => {
      fetch(`${import.meta.env.VITE_API_URL}/heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.idToken}`,
        },
        body: JSON.stringify({ duration_seconds: 60, app_version: appVersion, platform: "windows" }),
      }).catch(() => {});
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 60000);
    return () => clearInterval(interval);
  }, [user?.idToken]);

  if (showSplash || !appReady) return <SplashScreen onComplete={() => setShowSplash(false)} />;
  if (!user && appScreen !== "login") return <LoginPage externalError={loginError} onClearExternalError={() => setLoginError(null)} />;

  const SETUP_STEPS = [
    { key: "interview-setup", label: "Session",  icon: "🎯" },
    { key: "audio-setup",     label: "Audio",    icon: "🎙️" },
  ] as const;

  const StepIndicator = () => {
    const currentIdx = SETUP_STEPS.findIndex(s => s.key === appScreen);
    return (
      <div
        className="fixed top-2 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-1 px-3 py-1.5 rounded-full"
        style={{ background: "rgba(10,10,14,0.92)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(20px)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)", pointerEvents: "none" }}
      >
        {SETUP_STEPS.map((step, i) => {
          const isDone   = i < currentIdx;
          const isActive = i === currentIdx;
          return (
            <React.Fragment key={step.key}>
              <div className="flex items-center gap-1">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black transition-all"
                  style={{
                    background: isDone ? "#10b981" : isActive ? "rgba(235,146,69,0.9)" : "rgba(255,255,255,0.08)",
                    border: `1px solid ${isDone ? "#059669" : isActive ? "#eb9245" : "rgba(255,255,255,0.12)"}`,
                    color: isDone || isActive ? "#fff" : "rgba(255,255,255,0.3)",
                  }}
                >
                  {isDone ? "✓" : step.icon}
                </div>
                <span className="text-[9px] font-bold" style={{ color: isActive ? "rgba(255,255,255,0.85)" : isDone ? "#10b981" : "rgba(255,255,255,0.25)" }}>
                  {step.label}
                </span>
              </div>
              {i < SETUP_STEPS.length - 1 && <div className="w-4 h-px mx-0.5" style={{ background: isDone ? "#10b981" : "rgba(255,255,255,0.1)" }} />}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  if (appScreen === "interview-setup") return <>{showFullScreenAnimation && <UpdateAnimation status={updateState} progress={updatePercent} version={updateVersion} error={updateError} />}<StepIndicator /><InterviewSetupPage /></>;
  if (appScreen === "api-setup")       return <>{showFullScreenAnimation && <UpdateAnimation status={updateState} progress={updatePercent} version={updateVersion} error={updateError} />}<StepIndicator /><ApiSetupPage /></>;
  if (appScreen === "audio-setup")     return <>{showFullScreenAnimation && <UpdateAnimation status={updateState} progress={updatePercent} version={updateVersion} error={updateError} />}<StepIndicator /><AudioSetupPage /></>;

  const updateBanner = (
    <AnimatePresence>
      {updateState !== "idle" && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3.5 px-4 py-3 rounded-2xl"
          style={{
            background: "linear-gradient(135deg, #0e0e14 0%, #14141c 100%)",
            border: "1px solid rgba(139,92,246,0.35)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.6), 0 0 24px rgba(139,92,246,0.25), inset 0 1px 0 rgba(255,255,255,0.1)",
            pointerEvents: "auto",
            minWidth: "300px",
          }}
          onMouseEnter={() => window.ghostly.enableMouse()}
        >
          {/* Animated Icon Container */}
          <div className="relative shrink-0">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute -inset-1 rounded-xl opacity-60"
              style={{
                background: updateState === "ready" 
                  ? "conic-gradient(from 0deg, #22c55e, #10b981, transparent, #22c55e)" 
                  : "conic-gradient(from 0deg, #8b5cf6, #eb9245, transparent, #8b5cf6)",
                filter: "blur(4px)",
              }}
            />
            <div
              className="relative w-9 h-9 rounded-xl flex items-center justify-center text-[17px] font-black"
              style={{
                background: updateState === "ready"
                  ? "linear-gradient(135deg, #22c55e, #16a34a)"
                  : "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                boxShadow: updateState === "ready"
                  ? "0 0 12px rgba(34,197,94,0.5)"
                  : "0 0 12px rgba(139,92,246,0.5)",
                color: "#fff",
              }}
            >
              {updateState === "ready" ? "✨" : updateState === "downloading" ? "⚡" : "🔄"}
            </div>
          </div>

          {/* Text & Progress Info */}
          <div className="flex-1 min-w-0 pr-1">
            {updateState === "available" && (
              <>
                <p className="text-[12px] font-extrabold text-white tracking-wide leading-tight">
                  Update Available — v{updateVersion}
                </p>
                <p className="text-[10px] text-white/50 font-sans mt-0.5">
                  New features & performance upgrades ready
                </p>
              </>
            )}
            {updateState === "downloading" && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-extrabold text-white tracking-wide leading-tight">
                    Downloading Update...
                  </p>
                  <span className="text-[10px] font-mono font-bold text-violet-400">
                    {updatePercent}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden relative border border-white/10">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${updatePercent}%` }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="h-full rounded-full relative"
                    style={{
                      background: "linear-gradient(90deg, #8b5cf6, #eb9245, #10b981)",
                      boxShadow: "0 0 10px rgba(139,92,246,0.8)",
                    }}
                  >
                    <motion.div
                      animate={{ x: ["-100%", "200%"] }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-0 w-1/2"
                      style={{
                        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
                      }}
                    />
                  </motion.div>
                </div>
              </>
            )}
            {updateState === "ready" && (
              <>
                <p className="text-[12px] font-extrabold text-white tracking-wide leading-tight">
                  Update Ready to Install 🎉
                </p>
                <p className="text-[10px] text-emerald-400/80 font-sans mt-0.5 font-medium">
                  Restart app now to apply new features
                </p>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {updateState === "available" && (
              <motion.button
                whileHover={{ scale: 1.06, boxShadow: "0 0 20px rgba(139,92,246,0.6)" }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  window.ghostly.downloadUpdate();
                  setUpdateState("downloading");
                  setShowFullScreenAnimation(true);
                }}
                className="px-3.5 py-1.5 rounded-xl text-[11px] font-black tracking-wide text-white transition-all cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  boxShadow: "0 4px 14px rgba(139,92,246,0.45)",
                }}
              >
                ⚡ Download
              </motion.button>
            )}

            {updateState === "ready" && (
              <motion.button
                whileHover={{ scale: 1.06, boxShadow: "0 0 20px rgba(34,197,94,0.6)" }}
                whileTap={{ scale: 0.95 }}
                onClick={() => window.ghostly.installUpdate()}
                className="px-3.5 py-1.5 rounded-xl text-[11px] font-black tracking-wide text-white transition-all cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  boxShadow: "0 4px 14px rgba(34,197,94,0.45)",
                }}
              >
                ✨ Restart & Install
              </motion.button>
            )}

            {updateState !== "downloading" && (
              <button
                onClick={() => setUpdateState("idle")}
                className="w-7 h-7 flex items-center justify-center rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const hotkeyConflictBanner = (
    <AnimatePresence>
      {hotkeyConflict && hotkeyConflict.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex items-start gap-3 px-4 py-3 rounded-2xl"
          style={{
            background: "linear-gradient(135deg, #0e0e14 0%, #14141c 100%)",
            border: "1px solid rgba(251,191,36,0.35)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
            pointerEvents: "auto",
            maxWidth: "360px",
          }}
          onMouseEnter={() => window.ghostly.enableMouse()}
        >
          <span className="text-[16px] shrink-0">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-extrabold text-amber-300 leading-tight">
              {hotkeyConflict.length} shortcut{hotkeyConflict.length > 1 ? "s" : ""} blocked by another app
            </p>
            <p className="text-[10px] text-white/55 font-sans mt-1 leading-relaxed">
              {hotkeyConflict.map((a) => SHORTCUT_LABELS[a] || a).join(", ")} — another running app already uses that key combo. Change it in Settings → Keyboard Shortcuts.
            </p>
          </div>
          <button
            onClick={() => setHotkeyConflict(null)}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer shrink-0"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (appScreen === "interview") return <>{showFullScreenAnimation && <UpdateAnimation status={updateState} progress={updatePercent} version={updateVersion} error={updateError} />}{<Home />}{updateBanner}{hotkeyConflictBanner}</>;
  if (appScreen === "login") return <LoginPage externalError={loginError} onClearExternalError={() => setLoginError(null)} />;
  return <>{showFullScreenAnimation && <UpdateAnimation status={updateState} progress={updatePercent} version={updateVersion} error={updateError} />}{<HomePage />}{updateBanner}{hotkeyConflictBanner}</>;
};

export default App;
