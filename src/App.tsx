import React, { useEffect } from "react";
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

const App: React.FC = () => {
  const { appScreen, setAppScreen, setSettings, setHistory, setUser, setAds, user } = useStore();
  const [updateState, setUpdateState] = React.useState<UpdateState>("idle");
  const [updateVersion, setUpdateVersion] = React.useState("");
  const [updatePercent, setUpdatePercent] = React.useState(0);
  const [updateError, setUpdateError] = React.useState("");
  const [showFullScreenAnimation, setShowFullScreenAnimation] = React.useState(false);
  const [showSplash, setShowSplash] = React.useState(true);
  const [appReady, setAppReady] = React.useState(false);

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
          const merged = {
            ...savedSettings,
            apiKeys: {
              ...savedSettings.apiKeys,
              gemini:    import.meta.env.VITE_GEMINI_API_KEY    || savedSettings.apiKeys?.gemini    || "",
              groq:      import.meta.env.VITE_GROQ_API_KEY      || savedSettings.apiKeys?.groq      || "",
              openai:    import.meta.env.VITE_OPENAI_API_KEY    || savedSettings.apiKeys?.openai    || "",
              anthropic: import.meta.env.VITE_ANTHROPIC_API_KEY || savedSettings.apiKeys?.anthropic || "",
            },
            deepgramApiKey: import.meta.env.VITE_DEEPGRAM_API_KEY || savedSettings.deepgramApiKey || "",
          };
          setSettings(merged);
          window.ghostly.setOpacity(1);
        }
        if (savedHistory) setHistory(savedHistory);
        if (savedUser) setUser(savedUser);
        if (savedAds) setAds(savedAds);
      } catch { /* first run */ }
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
    const offAuth = window.ghostly.onAuthToken(async ({ token, user }) => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/subscription`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 403) {
          await handleBlockedAuth();
          alert("Your Ghotly AI account has been blocked. Please contact support if this is a mistake.");
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        const fullUser = { ...user, idToken: token };
        setUser(fullUser);
        await window.ghostly.saveUser(fullUser);
        await applyAccountPayload(data);
        setAppScreen("home");
      } catch { /* ignore */ }
    });
    return () => offAuth();
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
    })
      .then(async (r) => {
        if (r.status === 403) { await handleBlockedAuth(); return null; }
        if (!r.ok) return null;
        return r.json();
      })
      .then(async (data) => { if (data) await applyAccountPayload(data); })
      .catch(() => {});
  }, [appReady, user?.idToken]);

  if (showSplash || !appReady) return <SplashScreen onComplete={() => setShowSplash(false)} />;
  if (!user && appScreen !== "login") return <LoginPage />;

  const SETUP_STEPS = [
    { key: "interview-setup", label: "Session",  icon: "🎯" },
    { key: "api-setup",       label: "API Keys", icon: "🔑" },
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

  const updateBanner = updateState !== "idle" ? (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl"
      style={{ background: "linear-gradient(135deg, rgba(18,18,22,0.98), rgba(24,24,30,0.98))", border: "1px solid rgba(235,146,69,0.3)", backdropFilter: "blur(24px)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", pointerEvents: "auto", minWidth: "280px" }}
      onMouseEnter={() => window.ghostly.enableMouse()}
    >
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-[16px]" style={{ background: "linear-gradient(135deg, #eb9245, #c97320)", boxShadow: "0 2px 8px rgba(235,146,69,0.4)" }}>
        {updateState === "ready" ? "✅" : "🔄"}
      </div>
      <div className="flex-1 min-w-0">
        {updateState === "available" && (<><p className="text-[12px] font-bold text-white leading-tight">Update Available — v{updateVersion}</p><p className="text-[10px] text-white/40 font-sans">New features & improvements ready</p></>)}
        {updateState === "downloading" && (<><p className="text-[12px] font-bold text-white leading-tight">Downloading... {updatePercent}%</p><div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full transition-all duration-300" style={{ width: `${updatePercent}%`, background: "linear-gradient(90deg, #eb9245, #c97320)" }} /></div></>)}
        {updateState === "ready" && (<><p className="text-[12px] font-bold text-white leading-tight">Update Ready to Install</p><p className="text-[10px] text-white/40 font-sans">Restart app to apply update</p></>)}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {updateState === "available" && (
          <button onClick={() => { window.ghostly.downloadUpdate(); setUpdateState("downloading"); setShowFullScreenAnimation(true); }} className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all" style={{ background: "linear-gradient(135deg, #eb9245, #c97320)", color: "#000", boxShadow: "0 2px 8px rgba(235,146,69,0.3)" }}>Download</button>
        )}
        {updateState === "ready" && (
          <button onClick={() => window.ghostly.installUpdate()} className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all" style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", boxShadow: "0 2px 8px rgba(34,197,94,0.3)" }}>Restart & Install</button>
        )}
        {updateState !== "downloading" && (
          <button onClick={() => setUpdateState("idle")} className="w-6 h-6 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 transition-colors">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>
    </div>
  ) : null;

  if (appScreen === "interview") return <>{showFullScreenAnimation && <UpdateAnimation status={updateState} progress={updatePercent} version={updateVersion} error={updateError} />}{<Home />}{updateBanner}</>;
  if (appScreen === "login") return <LoginPage />;
  return <>{showFullScreenAnimation && <UpdateAnimation status={updateState} progress={updatePercent} version={updateVersion} error={updateError} />}{<HomePage />}{updateBanner}</>;
};

export default App;
