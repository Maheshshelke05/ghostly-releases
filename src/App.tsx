import React, { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "./store/useStore";
import { resetKeySyncCache } from "./lib/keySync";
// Only ApiSetupPage's provider table is needed eagerly (it seeds the retired-model
// fix on load). The heavy pages are split: the login screen used to download the
// whole interview engine, react-syntax-highlighter's Prism grammars, the resume
// parser (pdfjs/mammoth) and the markdown pipeline before anyone had signed in.
import { AI_PROVIDERS, ApiSetupPage } from "./pages/ApiSetupPage";
import { UpdateAnimation } from "./components/UpdateAnimation";
import { SplashScreen } from "./components/SplashScreen";
import "./styles/global.css";

const HomePage       = React.lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));
const LoginPage      = React.lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const InterviewSetupPage = React.lazy(() => import("./pages/InterviewSetupPage").then((m) => ({ default: m.InterviewSetupPage })));
const AudioSetupPage = React.lazy(() => import("./pages/AudioSetupPage").then((m) => ({ default: m.AudioSetupPage })));
const Home           = React.lazy(() => import("./pages/Home").then((m) => ({ default: m.Home })));

const SETUP_STEPS = [
  { key: "interview-setup", label: "Session",  icon: "🎯" },
  { key: "audio-setup",     label: "Audio",    icon: "🎙️" },
] as const;

// ── Step indicator ────────────────────────────────────────────────────────────
// Declared at module scope on purpose: while it lived inside App's body it got a
// new function identity on every render, so React saw a different component type
// and unmounted/remounted its whole subtree — on every streamed chunk.
const StepIndicator: React.FC<{ appScreen: string }> = ({ appScreen }) => {
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

const PageFallback: React.FC = () => (
  <div className="h-screen w-full flex items-center justify-center" style={{ background: "#f2f3f6" }}>
    <span
      role="status"
      aria-label="Loading"
      className="w-5 h-5 rounded-full animate-spin"
      style={{ border: "2px solid #c7c9f0", borderTopColor: "#6d6fb0" }}
    />
  </div>
);

// The account/login helpers live at module scope so nothing in them needs to be
// a dependency of an effect — they only ever touch the store through getState().
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
  resetKeySyncCache();
  useStore.getState().setUser(null);
  useStore.getState().setAds([]);
  useStore.getState().setAppScreen("login");
};

/**
 * Completes a login. Idempotent per token: the IPC listener and the pending-token
 * buffer can both deliver the *same* token (the POST can land between the listener
 * being attached and the buffer being drained), and running this twice meant two
 * /subscription fetches, two saveUser, two saveAds — a bad login writing the ads
 * file twice.
 */
const authTokenInFlight = new Set<string>();

const handleAuthToken = async ({ token, user }: { token: string; user: any }) => {
  if (!token || authTokenInFlight.has(token)) return;
  authTokenInFlight.add(token);
  const { setLoginError, setUser, setAppScreen } = useStore.getState();
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
  } finally {
    // Released so a later retry with the same token can still run.
    authTokenInFlight.delete(token);
  }
};

const detectPlatform = (): string => {
  const ua = (typeof navigator !== "undefined" ? navigator.userAgent : "").toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux")) return "linux";
  return "windows";
};

type UpdateState = "idle" | "checking" | "available" | "downloading" | "installing" | "ready" | "error";

// Mirrors REMAPPABLE_SHORTCUTS' labels in HomeSettingsPanel.tsx - kept as a small
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
  // Per-field selectors, not useStore(): subscribing to the whole store made App
  // re-render on every mutation — including appendToSolution, ~20x/second while an
  // answer streams — which re-rendered the entire page tree on every chunk.
  const appScreen   = useStore((s) => s.appScreen);
  const user        = useStore((s) => s.user);
  const loginError  = useStore((s) => s.loginError);
  const setLoginError = useStore((s) => s.setLoginError);
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

  // Every setTimeout here is tracked so unmount can't leave one pending.
  const timersRef = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);
  useEffect(() => () => { timersRef.current.forEach(window.clearTimeout); timersRef.current = []; }, []);

  useEffect(() => {
    const offAvailable  = window.ghostly.onUpdateAvailable((v) => { setUpdateVersion(v); setUpdateState("available"); });
    const offProgress   = window.ghostly.onUpdateProgress((p) => { setUpdatePercent(p); setUpdateState("downloading"); setShowFullScreenAnimation(true); });
    const offDownloaded = window.ghostly.onUpdateDownloaded(() => {
      setUpdateState("installing");
      later(() => { setUpdateState("ready"); later(() => setShowFullScreenAnimation(false), 3000); }, 2000);
    });
    const offNotAvail = window.ghostly.onUpdateNotAvailable(() => setUpdateState("idle"));
    const offError    = window.ghostly.onUpdateError((msg) => {
      const safeMsg = String(msg).replace(/[\r\n]/g, " ").slice(0, 200);
      console.error("[Update]", safeMsg);
      setUpdateError(safeMsg);
      setUpdateState("error");
      setShowFullScreenAnimation(true);
      later(() => { setShowFullScreenAnimation(false); setUpdateState("idle"); }, 3000);
    });
    return () => { offAvailable(); offProgress(); offDownloaded(); offNotAvail(); offError(); };
  }, [later]);

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
          // No VITE_*_API_KEY fallback here any more, and none in useStore's
          // defaults either: Vite inlines those into the renderer bundle, so a
          // shipped build carried the maintainer's keys to every user — and the
          // merged value then looked like the user's own saved key, so pressing
          // "Test" uploaded that build-time key to the backend against whatever
          // end-user account happened to be signed in. Say it loudly instead of
          // shipping it quietly.
          const leakedKeys = ["VITE_GEMINI_API_KEY", "VITE_GROQ_API_KEY", "VITE_OPENAI_API_KEY", "VITE_ANTHROPIC_API_KEY", "VITE_OPENROUTER_API_KEY", "VITE_DEEPGRAM_API_KEY"]
            .filter((k) => !!(import.meta.env as Record<string, string>)[k]);
          if (leakedKeys.length) {
            console.error(
              `[Ghostly] Build-time API keys in this bundle (${leakedKeys.join(", ")}). ` +
              "They ship inside the app to every user and are now ignored. Remove them from the build environment."
            );
          }
          // A provider can retire a model after a user already saved it as their active choice
          // (e.g. NVIDIA's mixtral-8x7b-instruct-v0.1 was pulled from their catalog entirely) —
          // every call then fails with that provider's own "model not found / end of life" error,
          // with no in-app way to notice short of reopening Settings and reselecting one by hand.
          // Falls back to that provider's current first-listed model, same safe default already
          // used when ApiSetupPage/HomeSettingsPanel can't find the saved model in the live list.
          const merged = { ...savedSettings };
          const activeProviderCfg = AI_PROVIDERS.find((p) => p.id === merged.activeProvider);
          if (activeProviderCfg && !activeProviderCfg.models.includes(merged.activeModel)) {
            merged.activeModel = activeProviderCfg.models[0];
          }
          useStore.getState().setSettings(merged);
          window.ghostly.setOpacity(1);
        }
        if (savedHistory) useStore.getState().setHistory(savedHistory);
        if (savedUser) useStore.getState().setUser(savedUser);
        if (savedAds) useStore.getState().setAds(savedAds);
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

  useEffect(() => {
    // Listener FIRST, buffer second. Draining the buffer first left a window where
    // a token that POSTed right then was handled twice: once as an event, once
    // from the already-resolved pending buffer — two /subscription fetches, two
    // saveUser, two saveAds, two setAppScreen("home"). (handleAuthToken also
    // de-dupes per token, so either order can't double-write.)
    // Draining also still covers the case where Google OAuth (completed in the
    // system browser, via the website's AuthCallback page) posts the token to this
    // app's local auth server before this listener has even mounted.
    const offAuth = window.ghostly.onAuthToken(handleAuthToken);
    window.ghostly.getPendingAuthToken()
      .then((pending) => { if (pending) handleAuthToken(pending); })
      .catch(() => {});
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
      window.ghostly.getPendingAuthToken()
        .then((pending) => { if (pending) handleAuthToken(pending); })
        .catch(() => {});
    });
    return () => offDeepLink();
  }, []);

  useEffect(() => {
    window.ghostly.getPendingHotkeyConflict().then((pending) => {
      if (pending && pending.length) setHotkeyConflict(pending);
    }).catch(() => {});
    const offHotkeyConflict = window.ghostly.onHotkeyConflict((failed) => {
      if (failed && failed.length) setHotkeyConflict(failed);
    });
    return () => offHotkeyConflict();
  }, []);

  useEffect(() => {
    window.ghostly.getPendingAuthServerError().then((pending) => {
      if (pending) setLoginError(pending);
    }).catch(() => {});
    const offAuthServerError = window.ghostly.onAuthServerError((message) => setLoginError(message));
    return () => offAuthServerError();
  }, []);

  useEffect(() => {
    const offShow = window.ghostly.onShow(() => {
      later(() => {
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
  }, [later]);

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
    const startedAt = Date.now();

    const sendHeartbeat = () => {
      // Real elapsed time, not a hardcoded 60: a five-second session used to
      // report a full minute of usage every beat.
      const durationSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      fetch(`${import.meta.env.VITE_API_URL}/heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.idToken}`,
        },
        body: JSON.stringify({ duration_seconds: durationSeconds, app_version: appVersion, platform: detectPlatform() }),
      }).catch(() => {});
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 60000);
    return () => clearInterval(interval);
  }, [user?.idToken]);

  const finishSplash = useCallback(() => setShowSplash(false), []);
  const clearLoginError = useCallback(() => setLoginError(null), [setLoginError]);

  if (showSplash || !appReady) return <SplashScreen onComplete={finishSplash} />;
  if (!user && appScreen !== "login") {
    return <Suspense fallback={<PageFallback />}><LoginPage externalError={loginError} onClearExternalError={clearLoginError} /></Suspense>;
  }

  if (appScreen === "interview-setup") return <Suspense fallback={<PageFallback />}><>{showFullScreenAnimation && <UpdateAnimation status={updateState} progress={updatePercent} version={updateVersion} error={updateError} />}<StepIndicator appScreen={appScreen} /><InterviewSetupPage /></></Suspense>;
  if (appScreen === "api-setup")       return <>{showFullScreenAnimation && <UpdateAnimation status={updateState} progress={updatePercent} version={updateVersion} error={updateError} />}<StepIndicator appScreen={appScreen} /><ApiSetupPage /></>;
  if (appScreen === "audio-setup")     return <Suspense fallback={<PageFallback />}><>{showFullScreenAnimation && <UpdateAnimation status={updateState} progress={updatePercent} version={updateVersion} error={updateError} />}<StepIndicator appScreen={appScreen} /><AudioSetupPage /></></Suspense>;

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
