import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store/useStore";
import { streamWithFallback, warmProviderConnection, type ProviderName } from "../lib/ai";
import { activeProviderKey, isProviderDisabled, usableApiKeys } from "../lib/providerState";
import { buildPrompt, buildLiveInterviewPrompt, buildChatPrompt, buildFollowUpPrompt } from "../lib/prompts";
import { v4 as uuidv4 } from "uuid";
import { TopBar, type InterviewTab } from "../components/TopBar";
import { JobPortalHeader, JobPortalPanel, JobPortalFooter } from "../components/JobPortalTab";
import { HomeSettingsPanel } from "../components/HomeSettingsPanel";
import { MinimizedLogo } from "../components/MinimizedLogo";
import { useMinimizedClickThrough } from "../hooks/useMinimizedClickThrough";
import { SolutionCard } from "../components/SolutionCard";
import { useInterviewAudio } from "../hooks/useInterviewAudio";
import { compressScreenshot } from "../lib/utils/imageCompressor";
import GhostMascot from "../components/ghost/GhostMascot";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));

const SupportAdPlacement: React.FC<{ scriptUrl?: string; containerId?: string }> = ({ scriptUrl, containerId }) => {
  const safeContainerId = (containerId || "").replace(/[^\w-]/g, "");
  const safeScriptUrl = scriptUrl?.startsWith("https://") || scriptUrl?.startsWith("http://") ? scriptUrl : "";

  if (!safeContainerId || !safeScriptUrl) return null;

  const srcDoc = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; width: 100%; min-height: 120px; overflow: hidden; background: transparent; }
      body { display: flex; align-items: center; justify-content: center; }
      #${safeContainerId} { width: 100%; min-height: 120px; }
    </style>
  </head>
  <body>
    <div id="${safeContainerId}"></div>
    <script async="async" data-cfasync="false" src="${escapeHtml(safeScriptUrl)}"></script>
  </body>
</html>`;

  return (
    <iframe
      title="Sponsored support ad"
      srcDoc={srcDoc}
      // allow-scripts WITHOUT allow-same-origin: together they'd give the ad a
      // same-origin document and access to window.parent.ghostly (saved API keys).
      sandbox="allow-scripts allow-popups"
      className="w-full rounded-xl border-0 bg-white"
      style={{ height: "124px" }}
    />
  );
};

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
      }}
      className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold transition-all"
      style={copied
        ? { background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.25)" }
        : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.07)" }
      }
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
};

const COMMUNITY_URL = "https://chat.whatsapp.com/E5FwqHfExlOBrKhZffspZv?s=cl&p=i&mlu=4&ilr=4";

const CommunityButton: React.FC = () => (
  <button
    type="button"
    onClick={() => window.ghostly.openExternal(COMMUNITY_URL)}
    className="lg:col-span-2 group w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all active:scale-[0.99]"
    style={{ background: "linear-gradient(135deg, rgba(37,211,102,0.16), rgba(37,211,102,0.05))", border: "1px solid rgba(37,211,102,0.32)" }}
    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(37,211,102,0.6)"; e.currentTarget.style.boxShadow = "0 0 20px rgba(37,211,102,0.18)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(37,211,102,0.32)"; e.currentTarget.style.boxShadow = "none"; }}
  >
    <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#25D366" }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
        <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.04 21.5h-.01a9.45 9.45 0 0 1-4.82-1.32l-.35-.2-3.58.94.96-3.49-.23-.36a9.43 9.43 0 0 1-1.45-5.03c0-5.21 4.24-9.45 9.46-9.45 2.52 0 4.9.99 6.68 2.77a9.4 9.4 0 0 1 2.76 6.69c0 5.21-4.24 9.45-9.42 9.45zM20.52 3.45A11.4 11.4 0 0 0 12.04 0C5.73 0 .6 5.13.6 11.44c0 2.02.53 3.99 1.53 5.73L.5 24l6.98-1.83a11.43 11.43 0 0 0 5.46 1.39h.01c6.31 0 11.44-5.13 11.44-11.44 0-3.06-1.19-5.93-3.35-8.09z" />
      </svg>
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[13px] font-black text-white leading-tight">Join our WhatsApp Community</span>
      <span className="block text-[10.5px] text-white/45 mt-0.5">Get help, tips and updates from other Ghotly AI users</span>
    </span>
    <span className="text-[#25D366]/70 group-hover:text-[#25D366] shrink-0">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg>
    </span>
  </button>
);

interface SupportPanelProps {
  email: string;
  supportAd?: { script_url?: string; container_id?: string };
  supportCategory: string;
  setSupportCategory: (value: string) => void;
  supportSubject: string;
  setSupportSubject: (value: string) => void;
  supportMessage: string;
  setSupportMessage: (value: string) => void;
  supportStatus: "idle" | "sending" | "sent" | "limited" | "error";
  supportError: string;
  onSubmit: (e: React.FormEvent) => void;
}

const SupportPanel: React.FC<SupportPanelProps> = ({
  email,
  supportAd,
  supportCategory,
  setSupportCategory,
  supportSubject,
  setSupportSubject,
  supportMessage,
  setSupportMessage,
  supportStatus,
  supportError,
  onSubmit,
}) => (
  <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 py-1">
    <CommunityButton />
    <form onSubmit={onSubmit} className="rounded-2xl border border-white/[0.08] p-4"
      style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))" }}>
      <div className="mb-4">
        <p className="text-[15px] font-black text-white leading-tight">Report a problem</p>
        <p className="text-[11px] text-white/35 mt-1 leading-relaxed">
          Send bugs, feature issues, payment problems, or anything not working. One report per day is allowed.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="support-email" className="text-[9px] font-bold uppercase tracking-widest text-white/30">Your email</label>
          <input id="support-email" value={email} readOnly className="mt-1 w-full rounded-xl px-3 py-2 text-[12px] font-semibold bg-white/[0.06] border border-white/[0.08] text-white/60 outline-none" />
        </div>
        <div>
          <label htmlFor="support-category" className="text-[9px] font-bold uppercase tracking-widest text-white/30">Category</label>
          <select id="support-category" value={supportCategory} onChange={(e) => setSupportCategory(e.target.value)}
            className="mt-1 w-full rounded-xl px-3 py-2 text-[12px] font-semibold bg-white/[0.06] border border-white/[0.08] text-white/80 outline-none">
            <option>Bug report</option>
            <option>Feature not working</option>
            <option>Ad gate or access issue</option>
            <option>Login issue</option>
            <option>Feature request</option>
            <option>Other</option>
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor="support-subject" className="text-[9px] font-bold uppercase tracking-widest text-white/30">Subject</label>
        <input id="support-subject" value={supportSubject} onChange={(e) => setSupportSubject(e.target.value)}
          required maxLength={120} placeholder="Example: Screenshot capture is not working"
          className="mt-1 w-full rounded-xl px-3 py-2 text-[12px] font-semibold bg-white/[0.06] border border-white/[0.08] text-white/85 placeholder:text-white/20 outline-none focus:border-violet-400/40" />
      </div>

      <div className="mt-3">
        <label htmlFor="support-message" className="text-[9px] font-bold uppercase tracking-widest text-white/30">Message</label>
        <textarea id="support-message" value={supportMessage} onChange={(e) => setSupportMessage(e.target.value)}
          required minLength={10} maxLength={1200} placeholder="Tell what happened, what you clicked, and what you expected."
          className="mt-1 w-full h-28 rounded-xl px-3 py-2 text-[12px] font-semibold bg-white/[0.06] border border-white/[0.08] text-white/85 placeholder:text-white/20 outline-none resize-none focus:border-violet-400/40" />
      </div>

      {supportError && <p className="mt-3 text-[11px] font-bold text-red-300">{supportError}</p>}
      {supportStatus === "sent" && <p className="mt-3 text-[11px] font-bold text-green-300">Report sent. Thank you, I will check it from admin panel.</p>}

      <button type="submit" disabled={supportStatus === "sending" || !supportSubject.trim() || supportMessage.trim().length < 10}
        className="mt-4 w-full py-2.5 rounded-xl text-[12px] font-black transition-all disabled:opacity-40"
        style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff" }}>
        {supportStatus === "sending" ? "Sending..." : "Send Report"}
      </button>
    </form>

    <div className="space-y-3">
      <div className="rounded-2xl border border-violet-400/20 p-3"
        style={{ background: "linear-gradient(160deg, rgba(139,92,246,0.12), rgba(255,255,255,0.04))" }}>
        <p className="text-[10px] font-black uppercase tracking-widest text-violet-300/80">Support Ads</p>
        <p className="mt-1 text-[11px] text-white/45 leading-relaxed">
          Sponsored content may appear here while you send feedback. No ads are shown in the interview answer area.
        </p>
      </div>
      {supportAd ? (
        <SupportAdPlacement scriptUrl={supportAd.script_url} containerId={supportAd.container_id} />
      ) : (
        <div className="rounded-xl border border-white/[0.08] px-3 py-8 text-center text-[11px] font-bold text-white/25">
          No support ad configured
        </div>
      )}
    </div>
  </div>
);

export const Home: React.FC = () => {
  // Per-field selectors, not useStore(): a bare useStore() re-rendered this whole
  // screen on every unrelated store write, including while an answer streams.
  const currentSolution = useStore((s) => s.currentSolution);
  const isStreaming = useStore((s) => s.isStreaming);
  const screenshots = useStore((s) => s.screenshots);
  const error = useStore((s) => s.error);
  const settings = useStore((s) => s.settings);
  const sessionMessages = useStore((s) => s.sessionMessages);
  const interviewSession = useStore((s) => s.interviewSession);
  const user = useStore((s) => s.user);
  const ads = useStore((s) => s.ads);
  const addScreenshot = useStore((s) => s.addScreenshot);
  const setCurrentSolution = useStore((s) => s.setCurrentSolution);
  const appendToSolution = useStore((s) => s.appendToSolution);
  const setIsStreaming = useStore((s) => s.setIsStreaming);
  const setError = useStore((s) => s.setError);
  const clearSolution = useStore((s) => s.clearSolution);
  const clearScreenshots = useStore((s) => s.clearScreenshots);
  const addSessionMessage = useStore((s) => s.addSessionMessage);
  const addToHistory = useStore((s) => s.addToHistory);
  const updateSettings = useStore((s) => s.updateSettings);

  const [settingsOpen, setSettingsOpen] = useState(false);
  // Minimized = the whole overlay collapsed to just the logo. Everything stays mounted
  // (live audio, streaming answers and the session keep running); it is only hidden.
  const [collapsed, setCollapsed] = useState(false);
  const [fullyHidden, setFullyHidden] = useState(false);
  const handleMinimize = useCallback(() => setCollapsed(true), []);
  useMinimizedClickThrough(collapsed);
  const handleExpand = useCallback(() => {
    setFullyHidden(false);
    setCollapsed(false);
    window.ghostly.enableMouse();
  }, []);
  const [followUpText, setFollowUpText] = useState("");
  const [activeTab, setActiveTab] = useState<InterviewTab>("ai");
  const [liveActive, setLiveActive] = useState(false);
  // Read straight from the store, not a local copy seeded once: toggling Auto-AI
  // mid-interview reset it, and useStore persists every updateSettings.
  const autoAI = settings.autoAI ?? true;
  const [qaPages, setQaPages] = useState<{ question: string; answer: string }[]>([]);
  // Shown briefly whenever streamWithFallback actually switches provider —
  // this is the whole point of making the switch visible instead of silent.
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!fallbackNotice) return;
    const t = setTimeout(() => setFallbackNotice(null), 6000);
    return () => clearTimeout(t);
  }, [fallbackNotice]);

  const sessionStartRef   = useRef<number>(Date.now());
  const featuresUsedRef   = useRef<Set<"ai-answer" | "screen" | "chat">>(new Set());
  const sessionQARef      = useRef<{ question: string; answer: string; feature: "ai-answer" | "screen" | "chat" | "follow-up"; timestamp: number }[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [userNavigated, setUserNavigated] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState("");
  // Chat state — every message carries an id so React keys bubbles by identity:
  // indexed keys made SolutionCard's "Copied" state stick to the wrong bubble.
  const [chatMessages, setChatMessages] = useState<{ id: string; role: "user" | "assistant"; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const audio = useInterviewAudio();

  const screenshotsRef = useRef<string[]>(screenshots);
  const abortControllerRef = useRef<AbortController | null>(null);
  const answerEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { screenshotsRef.current = screenshots; }, [screenshots]);
  // Guards async hotkey handlers against setError/setState after unmount; re-armed
  // on mount because React 18 StrictMode mounts → unmounts → mounts in dev.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    answerEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentSolution]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatStreaming]);

  // Keep the provider's connection warm during the interview so the first answer
  // doesn't spend ~0.2s+ on DNS/TCP/TLS; idle connections drop after a few minutes.
  useEffect(() => {
    const name = settings.activeProvider as ProviderName;
    warmProviderConnection(name);
    const t = window.setInterval(() => warmProviderConnection(name), 4 * 60 * 1000);
    return () => window.clearInterval(t);
  }, [settings.activeProvider]);

  const runAIStream = useCallback(async (
    screenshotList: string[],
    transcriptOverride?: string,
    followUpQuery?: string,
  ) => {
    const providerName = settings.activeProvider;
    const activeKey = activeProviderKey(settings);

    if (!activeKey) {
      setError(
        isProviderDisabled(settings, providerName)
          ? `${providerName} is deactivated. Open Settings → API Keys and activate a provider.`
          : `No API key for ${providerName}. Open Settings to add one.`
      );
      setIsStreaming(false);
      return;
    }

    const isFollowUp = !!followUpQuery;
    if (!screenshotList.length && !transcriptOverride && !isFollowUp && !sessionMessages.length) {
      setError("No screenshots yet. Press Ctrl+E to capture screen first.");
      setIsStreaming(false);
      return;
    }

    abortControllerRef.current?.abort();
    const ctrl = new AbortController();
    abortControllerRef.current = ctrl;
    const signal = ctrl.signal;

    setCurrentSolution("");
    setError(null);
    setIsStreaming(true);
    setFollowUpText("");

    let prompt = "";
    // Detect a fully-built prompt once and reuse it for questionText too, so screen
    // analysis doesn't store the raw "You are an expert..." prompt as the question.
    const isFormattedPrompt = !!followUpQuery && (
      followUpQuery.includes("## Approach") ||
      followUpQuery.includes("You are an expert") ||
      followUpQuery.includes("staff engineer")
    );
    if (followUpQuery) {
      if (isFormattedPrompt) {
        prompt = followUpQuery;
      } else {
        prompt = buildFollowUpPrompt(followUpQuery, interviewSession);
      }
    } else if (transcriptOverride) {
        prompt = buildLiveInterviewPrompt(transcriptOverride, interviewSession);
    } else {
      prompt = buildPrompt(interviewSession);
    }

    try {
      let fullSolution = "";
      const latestScreenshot = transcriptOverride ? undefined :
        screenshotList.length > 0 ? screenshotList[screenshotList.length - 1] : undefined;
      const historyContext = sessionMessages.slice(-4).map((m) => ({ role: m.role, content: m.content }));

      const stream = streamWithFallback(
        providerName as ProviderName,
        {
          base64Image: latestScreenshot, prompt, messages: historyContext,
          model: settings.activeModel,
          apiKey: activeKey,
          mimeType: latestScreenshot?.includes("image/jpeg") ? "image/jpeg" : "image/png",
          maxTokens: transcriptOverride ? 2048 : 4096,
          // AbortController alone was only checked between chunks, so a stalled
          // request hung forever; compose a 60s hard timeout so it eventually fails.
          signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
        },
        usableApiKeys(settings),
        settings.autoSwitchProvider ?? true,
        ({ from, to, reason }) => setFallbackNotice(
          reason === "vision"
            ? `👁️ ${from} can't see screenshots — this answer used ${to} instead.`
            : `⚡ ${from} hit a rate limit — this answer used ${to} instead.`
        ),
      );

      let lastFlush = Date.now();
      let pendingBuffer = "";

      for await (const chunk of stream) {
        if (signal.aborted) break;
        fullSolution += chunk;
        pendingBuffer += chunk;

        const now = Date.now();
        if (now - lastFlush > 50) {
          appendToSolution(pendingBuffer);
          pendingBuffer = "";
          lastFlush = now;
        }
      }

      if (pendingBuffer && !signal.aborted) {
        appendToSolution(pendingBuffer);
        pendingBuffer = "";
      }

      if (signal.aborted) return;

      // Track feature used
      if (transcriptOverride) featuresUsedRef.current.add("ai-answer");
      else if (screenshotList.length) featuresUsedRef.current.add("screen");

      const questionText = transcriptOverride || (followUpQuery && !isFormattedPrompt ? followUpQuery : "Screen Analysis");
      const featureTag = transcriptOverride ? "ai-answer" : screenshotList.length ? "screen" : "follow-up";
      sessionQARef.current.push({ question: questionText, answer: fullSolution, feature: featureTag, timestamp: Date.now() });

      if (transcriptOverride) {
        setQaPages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.question === transcriptOverride && !last.answer)
            return [...prev.slice(0, -1), { ...last, answer: fullSolution }];
          return prev;
        });
      }

      // No screenshotBase64 here: nothing reads it, and one base64 frame per
      // transcript entry kept every capture alive in memory for the whole session.
      addSessionMessage({ id: uuidv4(), role: "user", content: questionText });
      addSessionMessage({ id: uuidv4(), role: "assistant", content: fullSolution });

      // Clear the streaming buffer and screenshots only — sessionMessages powers
      // Q1/Q2 pagination; clearSolution() wiped the answer just added to history.
      if (!liveActive) {
        setCurrentSolution("");
        clearScreenshots();
      }

    } catch (err) {
      if (signal.aborted) return;
      setError(err instanceof Error ? err.message : "AI streaming failed");
    } finally {
      // Cleared on the abort path too; only the stream that still owns the
      // controller may clear it, or an aborted run left isStreaming stuck true.
      if (abortControllerRef.current === ctrl) {
        abortControllerRef.current = null;
        setIsStreaming(false);
      }
    }
  }, [settings, sessionMessages, interviewSession, setCurrentSolution, setError, setIsStreaming, appendToSolution, addToHistory, addSessionMessage, liveActive, clearScreenshots, setFallbackNotice]);

  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLiveTextRef = useRef("");
  // Stable ref avoids a stale closure inside setTimeout.
  const runAIStreamRef = useRef(runAIStream);
  useEffect(() => { runAIStreamRef.current = runAIStream; }, [runAIStream]);

  // Read liveActive through a ref: passive effect cleanup may not run before an
  // already-scheduled timer, letting a stale timer fire an extra AI request.
  const liveActiveRef = useRef(liveActive);
  useEffect(() => { liveActiveRef.current = liveActive; }, [liveActive]);

  // Same for stream/answer state. Keeping these as effect deps broke auto-submit:
  // any change during the delay cleared the timer and the guard refused to re-arm.
  const liveStateRef = useRef({ isStreaming, pendingTranscript, currentSolution });
  useEffect(() => { liveStateRef.current = { isStreaming, pendingTranscript, currentSolution }; });

  useEffect(() => {
    if (!liveActive || !autoAI) return;
    const text = audio.liveText.trim();
    if (!text || text === lastLiveTextRef.current) return;
    lastLiveTextRef.current = text;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    const endsWithQuestion = text.endsWith("?") || text.includes("?");
    const silenceDelay = endsWithQuestion ? 800 : 2200;

    const fire = () => {
      if (!liveActiveRef.current) return;
      const { isStreaming: streaming, pendingTranscript: pending, currentSolution: solution } = liveStateRef.current;
      // Someone spoke while the previous answer was still streaming: re-check
      // shortly instead of dropping the question (the old effect never re-armed).
      if (streaming) {
        silenceTimerRef.current = setTimeout(fire, 500);
        return;
      }

      // Filter out short filler interjections (< 4 words unless ends with ?)
      const words = text.split(/\s+/).filter(Boolean);
      const isShortFiller = words.length < 4 && !text.endsWith("?");
      if (isShortFiller) return;

      if (pending && solution) {
        setQaPages(prev => [...prev, { question: pending, answer: solution }]);
        setPageIndex(prev => prev + 1);
      }

      audio.clearLiveText();
      setPendingTranscript(text);
      runAIStreamRef.current([], text);
    };
    silenceTimerRef.current = setTimeout(fire, silenceDelay);

    return () => { if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current); };
  }, [audio.liveText, liveActive, autoAI]);

  const handleToggleLive = useCallback(async () => {
    if (liveActive) {
      audio.stopInterview();
      setLiveActive(false);
      setPendingTranscript("");
      return;
    }
    if (!audio.isModelReady) {
      setError(audio.downloadProgress !== null
        ? `Transcription engine downloading (${audio.downloadProgress}%). Please wait...`
        : "Deepgram API key missing — add it in Api Setup.");
      return;
    }
    sessionStartRef.current = Date.now();
    featuresUsedRef.current = new Set();
    sessionQARef.current = [];
    clearSolution();
    setQaPages([]);
    setPageIndex(0);
    setPendingTranscript("");
    setLiveActive(true);
    // Awaited: if capture fails (getDisplayMedia rejected, no audio tracks),
    // liveActive stayed stuck true with "Listening…" pulsing and no error.
    const started = await audio.startInterview();
    if (!started) {
      setLiveActive(false);
      setError("Couldn't start listening — check Windows Sound Settings for a working default playback device, then try again.");
    }
  }, [liveActive, audio, clearSolution, setError]);

  const handleManualSend = useCallback(() => {
    const t = audio.liveText.trim();
    if (!t) return;
    audio.clearLiveText();
    setPendingTranscript(t);
    runAIStream([], t);
  }, [audio, runAIStream]);

  const handleNextQuestion = useCallback(() => {
    if (pendingTranscript && currentSolution) {
      setQaPages(prev => [...prev, { question: pendingTranscript, answer: currentSolution }]);
      setPageIndex(prev => prev + 1);
    }
    setPendingTranscript("");
    clearSolution();
    audio.clearLiveText();
  }, [pendingTranscript, currentSolution, clearSolution, audio]);

  const handleScreenAnalysis = useCallback(async () => {
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        setIsStreaming(false);
      }
      // Pause live audio so feature calls never collide.
      if (liveActive) {
        audio.stopInterview();
        setLiveActive(false);
      }
      // Reset only the streaming buffer and screenshots for the new capture, not
      // sessionMessages — that would erase every previous Q1/Q2 screen-analysis page.
      setCurrentSolution("");
      clearScreenshots();
      setError(null);
      const rawB64 = await window.ghostly.captureFullscreen();
      if (!isMountedRef.current) return;
      const compressedB64 = await compressScreenshot(rawB64);
      if (!isMountedRef.current) return;
      addScreenshot(compressedB64);
      // interviewSession carries the job description/profile/custom instructions;
      // omitting it here made Screen Analysis ignore everything set in Setup.
      const screenPrompt = buildPrompt(interviewSession);
      // Awaited so a failure inside the stream is actually visible to this
      // try/catch — fire-and-forget made the surrounding catch unreachable.
      await runAIStream([compressedB64], undefined, screenPrompt);
    } catch { if (isMountedRef.current) setError("Failed to capture screen."); }
  }, [runAIStream, setError, addScreenshot, liveActive, audio, setCurrentSolution, clearScreenshots, setIsStreaming, interviewSession]);

  const supportAd = useMemo(() => ads.find((ad) => ad.is_active && ad.script_url && ad.container_id), [ads]);
  const [supportCategory, setSupportCategory] = useState("Bug report");
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportStatus, setSupportStatus] = useState<"idle" | "sending" | "sent" | "limited" | "error">("idle");
  const [supportError, setSupportError] = useState("");
  const [copied, setCopied] = useState(false);
  const imgBase = window.location.protocol === "file:" ? "app://" : "/";

  const handleSupportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (supportStatus === "sending") return;
    if (!user?.idToken) {
      setSupportStatus("error");
      setSupportError("You are not logged in. Please log in again and resend.");
      return;
    }

    setSupportStatus("sending");
    setSupportError("");

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/support`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.idToken}`,
        },
        body: JSON.stringify({
          category: supportCategory,
          subject: supportSubject.trim(),
          message: supportMessage.trim(),
          app_version: window.ghostly.getVersion(),
          page: activeTab,
        }),
        signal: AbortSignal.timeout(15000),
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setSupportStatus("limited");
        setSupportError(data.error || "You can send only one support message per day.");
        return;
      }
      // Sign-in tokens last about an hour, so a long session can outlive its token —
      // say so instead of showing the server's raw "Invalid token"; typed text is kept.
      if (res.status === 401) {
        setSupportStatus("error");
        setSupportError("Your login has expired. Please log in again, then send the report (your text is kept).");
        return;
      }
      if (res.status === 403) {
        setSupportStatus("error");
        setSupportError(data.error ? `Your account is blocked: ${data.error}` : "Your account is blocked. Contact support.");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Could not send your report.");

      setSupportStatus("sent");
      setSupportSubject("");
      setSupportMessage("");
    } catch (err: any) {
      setSupportStatus("error");
      setSupportError(
        err?.name === "TimeoutError" || err?.name === "AbortError"
          ? "The server took too long to respond. Check your connection and try again."
          : err instanceof TypeError
          ? "Could not reach the server. Check your internet connection and try again."
          : err.message || "Could not send your report."
      );
    }
  };

  const handleTabChange = useCallback((tab: InterviewTab) => {
    // Abort any active AI stream when switching tabs to avoid feature collisions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }

    // Stop live audio when switching away from AI Answer tab.
    if (tab !== "ai" && liveActive) {
      audio.stopInterview();
      setLiveActive(false);
    }

    setActiveTab(tab);
    // TopBar already calls onScreenAnalysis() directly on the Screen tab; this used
    // to trigger it too, firing two capture+AI cycles that raced and wiped answers.
  }, [liveActive, audio, setIsStreaming]);

  // Recalc only when streaming finishes, not on every chunk.
  const sessionMessagesForPairs = isStreaming ? undefined : sessionMessages;
  const normalQaPairs = useMemo(() => {
    const src = sessionMessagesForPairs ?? sessionMessages;
    const pairs: { user: any; assistant: any }[] = [];
    let cur: any = null;
    src.forEach((msg) => {
      if (msg.role === "user") { if (cur) pairs.push(cur); cur = { user: msg, assistant: null }; }
      else if (msg.role === "assistant" && cur) { cur.assistant = msg; pairs.push(cur); cur = null; }
    });
    if (cur) pairs.push(cur);
    return pairs;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionMessagesForPairs]);

  const pages = liveActive ? qaPages : normalQaPairs.map(p => ({
    question: p.user?.content || "",
    answer: p.assistant?.content || "",
  }));

  const livePageIndex = pages.length;
  // Screen uses the same pagination as other tabs; it used to be capped at page 0
  // because sessionMessages was wiped on each screen analysis.
  const totalPages = liveActive
    ? pages.length + (audio.liveText || pendingTranscript || isStreaming || currentSolution ? 1 : 0)
    : Math.max(1, pages.length + (isStreaming ? 1 : 0));

  const isOnLivePage = pageIndex >= pages.length;
  // Clamp pageIndex to prevent an out-of-bounds blank screen.
  const safePageIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const activePage = !isOnLivePage ? (pages[safePageIndex] ?? null) : null;

  const liveQuestion = pendingTranscript || audio.liveText;
  const liveAnswer = currentSolution;

  // Auto-jump to the newest page unless the user navigated by hand. Two effects
  // used to fight here; one of them set pageIndex one past the end.
  useEffect(() => {
    if (userNavigated) return;
    setPageIndex(liveActive ? livePageIndex : Math.max(0, pages.length - 1));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- userNavigated is read, not a trigger: re-running on it would undo a manual page click.
  }, [liveActive, pages.length, livePageIndex]);

  useEffect(() => {
    if (isStreaming) setUserNavigated(false);
  }, [isStreaming]);

  // Bare arrows only fire while this overlay has focus (Ctrl+8/Ctrl+2 are global).
  // Registered once: a duplicate registration made every press advance two pages.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") { setUserNavigated(true); setPageIndex(p => Math.max(0, p - 1)); }
      // Guard totalPages=0 to avoid a -1 index.
      if (e.key === "ArrowRight") { setUserNavigated(true); setPageIndex(p => Math.min(Math.max(0, totalPages - 1), p + 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [totalPages]);

  const handleFollowUpSubmit = useCallback((text: string) => {
    if (!text.trim() || isStreaming) return;
    runAIStream([], undefined, text.trim());
  }, [isStreaming, runAIStream]);

  const saveSessionToHistory = useCallback(async () => {
    const qaList = sessionQARef.current;
    if (!qaList.length) return;
    const duration = Math.round((Date.now() - sessionStartRef.current) / 1000);
    const hasLive = featuresUsedRef.current.has("ai-answer");
    const sessionEntry = {
      id: uuidv4(),
      timestamp: sessionStartRef.current,
      solution: qaList[0]?.answer || "",
      provider: settings.activeProvider,
      model: settings.activeModel,
      interviewType: hasLive ? "live-interview" : "general",
      companyName: interviewSession?.companyName || "",
      position: interviewSession?.position || "",
      durationSeconds: duration,
      featuresUsed: Array.from(featuresUsedRef.current) as ("ai-answer" | "screen" | "chat")[],
      qaHistory: qaList,
    };
    addToHistory(sessionEntry);
    try {
      const h = await window.ghostly.getHistory();
      // Deduplicate by session timestamp or id — `&&` here would keep an entry
      // matching either one, the opposite of the intent (id was dead code anyway).
      const filtered = h.filter((x: any) => x.timestamp !== sessionEntry.timestamp || x.id !== sessionEntry.id);
      await window.ghostly.saveHistory([sessionEntry, ...filtered]);
    } catch { /* best-effort */ }
    sessionStartRef.current = Date.now();
    featuresUsedRef.current = new Set();
    sessionQARef.current = [];
  }, [settings, interviewSession, addToHistory]);

  const handleRestart = useCallback(() => {
    abortControllerRef.current?.abort();
    // Null the ref after abort so it isn't aborted twice.
    abortControllerRef.current = null;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    lastLiveTextRef.current = "";
    setIsStreaming(false);
    clearSolution();
    audio.stopInterview();
    setLiveActive(false);
    setQaPages([]);
    setPageIndex(0);
    setUserNavigated(false);
    setPendingTranscript("");
  }, [clearSolution, setIsStreaming, audio]);

  const handleChatSend = useCallback(async (text: string) => {
    if (!text.trim() || chatStreaming) return;
    featuresUsedRef.current.add("chat");
    const userMsg = { id: uuidv4(), role: "user" as const, text: text.trim() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setChatStreaming(true);

    const activeKey = activeProviderKey(settings);
    if (!activeKey) {
      setChatMessages(prev => [...prev, {
        id: uuidv4(),
        role: "assistant",
        text: isProviderDisabled(settings, settings.activeProvider)
          ? `${settings.activeProvider} is deactivated. Open Settings → API Keys and activate a provider.`
          : `No API key for ${settings.activeProvider}. Open Settings to add one.`,
      }]);
      setChatStreaming(false);
      return;
    }

    try {
      const history = chatMessages.slice(-8).map(m => ({ role: m.role, content: m.text }));
      const stream = streamWithFallback(
        settings.activeProvider as ProviderName,
        {
          prompt: buildChatPrompt(text.trim(), interviewSession), messages: history, model: settings.activeModel, apiKey: activeKey, maxTokens: 2048,
          // Same stalled-connection gap as the AI-answer path; chat has no cancel
          // button, so this timeout is its only way out of a dead request.
          signal: AbortSignal.timeout(60000),
        },
        usableApiKeys(settings),
        settings.autoSwitchProvider ?? true,
        ({ from, to, reason }) => setFallbackNotice(
          reason === "vision"
            ? `👁️ ${from} can't see screenshots — this answer used ${to} instead.`
            : `⚡ ${from} hit a rate limit — this answer used ${to} instead.`
        ),
      );

      let full = "";
      let lastChatFlush = Date.now();
      const assistantId = uuidv4();
      setChatMessages(prev => [...prev, { id: assistantId, role: "assistant", text: "" }]);
      for await (const chunk of stream) {
        full += chunk;
        const now = Date.now();
        if (now - lastChatFlush > 50) {
          const currentText = full;
          setChatMessages(prev => [
            ...prev.slice(0, -1),
            { id: assistantId, role: "assistant", text: currentText },
          ]);
          lastChatFlush = now;
        }
      }
      setChatMessages(prev => [
        ...prev.slice(0, -1),
        { id: assistantId, role: "assistant", text: full },
      ]);
      sessionQARef.current.push({ question: text.trim(), answer: full, feature: "chat", timestamp: Date.now() });
    } catch (err) {
      setChatMessages(prev => [...prev, { id: uuidv4(), role: "assistant", text: `Error: ${err instanceof Error ? err.message : "AI failed"}` }]);
    } finally {
      setChatStreaming(false);
    }
  }, [chatStreaming, chatMessages, settings, setFallbackNotice, interviewSession]);

  useEffect(() => {
    window.ghostly.setOpacity(1);
    window.ghostly.show();
    window.ghostly.enableMouse();
  }, []);

  // After Ctrl+E/Ctrl+Enter the window goes click-through; interactive elements
  // re-enable mouse on hover, so restore click-through when the pointer leaves.
  useEffect(() => {
    const onMouseOut = (e: MouseEvent) => {
      if (e.relatedTarget === null) window.ghostly.disableMouse();
    };
    window.addEventListener("mouseout", onMouseOut);
    return () => window.removeEventListener("mouseout", onMouseOut);
  }, []);

  // Hotkeys arrive as IPC from Electron's globalShortcut, so they work regardless
  // of OS focus; a ref keeps this effect registered once instead of per chunk.
  const hotkeyRef = useRef({ liveActive, isStreaming, currentSolution, pendingTranscript, totalPages, interviewSession, handleManualSend, handleRestart, clearLiveText: audio.clearLiveText });
  useEffect(() => {
    hotkeyRef.current = { liveActive, isStreaming, currentSolution, pendingTranscript, totalPages, interviewSession, handleManualSend, handleRestart, clearLiveText: audio.clearLiveText };
  });

  useEffect(() => {
    // Ctrl+E / Ctrl+Shift+S / Ctrl+Shift+Enter all funnel here; same compression as
    // handleScreenAnalysis so both paths send an identical, text-legible payload.
    const offScreenshot = window.ghostly.onScreenshot(async (b64) => {
      const compressed = await compressScreenshot(b64);
      if (!isMountedRef.current) return;
      addScreenshot(compressed);
    });
    // Ctrl+Enter solves what's already captured; for a screenshot use the same
    // adaptive prompt handleScreenAnalysis builds instead of an empty one.
    const offSolve = window.ghostly.onSolve(async () => {
      const { interviewSession: session } = hotkeyRef.current;
      const followUp = screenshotsRef.current.length > 0
        ? buildPrompt(session)
        : undefined;
      await runAIStreamRef.current(screenshotsRef.current, undefined, followUp);
    });
    const offStartOver = window.ghostly.onStartOver(() => hotkeyRef.current.handleRestart());

    // Capture errors used to only log to the terminal — invisible in a packaged
    // app, where it looked like the hotkey silently did nothing.
    const offCaptureError = window.ghostly.onCaptureError((message) => setError(message));

    // Ctrl+N — Next Question (only while live-listening)
    const offNextQuestion = window.ghostly.onNextQuestion(() => {
      const { liveActive: live, currentSolution: solution, pendingTranscript: pending, clearLiveText } = hotkeyRef.current;
      if (!live) return;
      if (solution && pending) {
        setQaPages(prev => [...prev, { question: pending, answer: solution }]);
      }
      setPendingTranscript("");
      clearSolution();
      clearLiveText();
      lastLiveTextRef.current = "";
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    });

    // Ctrl+0 — Manual Send (skip silence detection)
    const offManualSend = window.ghostly.onManualSend(() => {
      const { liveActive: live, isStreaming: streaming, handleManualSend: send } = hotkeyRef.current;
      if (live && !streaming) send();
    });

    // Ctrl+8 — Previous Question page
    const offPrevQuestion = window.ghostly.onPrevQuestion(() => {
      setUserNavigated(true);
      setPageIndex(p => Math.max(0, p - 1));
    });

    // Ctrl+2 — Next Question page
    const offNextQuestionPage = window.ghostly.onNextQuestionPage(() => {
      setUserNavigated(true);
      setPageIndex(p => Math.min(Math.max(0, hotkeyRef.current.totalPages - 1), p + 1));
    });

    return () => {
      offScreenshot();
      offSolve();
      offStartOver();
      offCaptureError();
      offNextQuestion();
      offManualSend();
      offPrevQuestion();
      offNextQuestionPage();
    };
    // Only stable references here (zustand actions + setState), so this runs once
    // and once only: on unmount, to remove every listener.
  }, [addScreenshot, setError, clearSolution]);

  const displayLiveText = audio.liveText || pendingTranscript;

  return (
    <div className="h-screen w-full bg-transparent text-white font-mono pointer-events-none flex flex-col" style={{ userSelect: "none", WebkitUserSelect: "none" } as React.CSSProperties}>

      {/* Everything except the logo collapses toward the top-left. `visibility` (not
          just opacity) switches off after the fade so nothing invisible catches the mouse. */}
      <motion.div
        className="flex-1 min-h-0 flex flex-col"
        initial={false}
        animate={collapsed ? { opacity: 0, scale: 0.9 } : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        onAnimationComplete={() => { if (collapsed) setFullyHidden(true); }}
        style={{ transformOrigin: "28px 28px", visibility: fullyHidden ? "hidden" : "visible" }}
      >
      <div className="flex-none">
        <TopBar
          onOpenSettings={() => setSettingsOpen((v) => !v)}
          settingsOpen={settingsOpen}
          isLiveActive={liveActive}
          onToggleLive={handleToggleLive}
          onScreenAnalysis={handleScreenAnalysis}
          liveText={displayLiveText}
          onMicSend={handleManualSend}
          onNextQuestion={handleNextQuestion}
          showNext={liveActive && !isStreaming && !!currentSolution}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onStop={() => { saveSessionToHistory(); handleRestart(); useStore.getState().setAppScreen("home"); setTimeout(() => window.ghostly.enableMouse(), 50); setTimeout(() => window.ghostly.enableMouse(), 300); }}
          autoAI={autoAI}
          onToggleAutoAI={() => updateSettings({ autoAI: !autoAI })}
          onMinimize={handleMinimize}
        />
      </div>

      {/* Same panel as the home screen. Not wrapped in AnimatePresence: it plays its
           own exit, and a parent-driven exit can hang behind its tab switcher. */}
      {settingsOpen && <HomeSettingsPanel onClose={() => setSettingsOpen(false)} topInset={56} />}

      {!settingsOpen && (
        <div className="flex-1 min-h-0 flex justify-center px-3 pb-3 mt-1 pointer-events-auto overflow-hidden">
          <div className="w-full flex flex-col h-full">
            <div
              className="flex-1 min-h-0 flex flex-col rounded-2xl overflow-hidden"
              // Fully opaque: backdrop-filter can't blur the real window behind this
              // transparent overlay, and 0.94 alpha still let its text ghost through.
              style={{ background: "#0e0e12", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 20px 50px rgba(0,0,0,0.45)" }}
              onMouseEnter={() => window.ghostly.enableMouse()}
            >
              <div className="flex items-center justify-between px-4 h-11 flex-shrink-0"
                style={{ WebkitAppRegion: "drag", borderBottom: "1px solid rgba(255,255,255,0.06)" } as React.CSSProperties}>

                {activeTab === "support" ? (
                  <>
                    <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                      <span className="text-[11px] font-semibold text-violet-300/80 font-sans">Support & Report</span>
                    </div>
                    <div /><div />
                  </>
                ) : activeTab === "jobs" ? (
                  <>
                    <JobPortalHeader />
                    <div /><div />
                  </>
                ) : activeTab === "chat" ? (
                  <>
                    <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                      <span className="text-[11px] font-semibold text-white/50 font-sans">Chat</span>
                      {chatMessages.length > 0 && (
                        <button onClick={() => setChatMessages([])}
                          className="text-[10px] text-white/25 hover:text-red-400 transition-colors font-sans">Clear</button>
                      )}
                    </div>
                    <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties} />
                    <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-white/25 uppercase tracking-wider">Opacity</span>
                        <input type="range" min="20" max="100"
                          aria-label="Overlay opacity"
                          value={Math.round((settings.opacity ?? 1) * 100)}
                          onChange={(e) => { const v = parseInt(e.target.value)/100; updateSettings({opacity:v}); window.ghostly.setOpacity(v); }}
                          className="w-14 h-1 accent-violet-400 cursor-pointer" />
                      </div>
                    </div>
                  </>
                ) : (
                <>
                  <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                    <button onClick={() => { setUserNavigated(true); setPageIndex(p => Math.max(0, p - 1)); }}
                      aria-label="Previous question"
                      disabled={pageIndex === 0 || totalPages === 0}
                      className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/30 hover:text-white/70 disabled:opacity-20 transition-colors text-sm">‹</button>
                    <span className="text-[11px] text-white/30 font-mono tabular-nums min-w-[40px] text-center">
                      {totalPages === 0 ? "—" : `${Math.min(pageIndex + 1, totalPages)} / ${totalPages}`}
                    </span>
                    <button onClick={() => { setUserNavigated(true); setPageIndex(p => Math.min(Math.max(0, totalPages - 1), p + 1)); }}
                      aria-label="Next question"
                      disabled={pageIndex >= totalPages - 1 || totalPages === 0}
                      className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/30 hover:text-white/70 disabled:opacity-20 transition-colors text-sm">›</button>
                  </div>

                  {/* Dots */}
                  {totalPages > 1 && (
                    <div className="flex gap-1.5 items-center" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                      {Array.from({ length: Math.min(totalPages, 10) }).map((_, i) => (
                        <button key={i} onClick={() => { setUserNavigated(true); setPageIndex(i); }}
                          aria-label={`Question ${i + 1} of ${Math.min(totalPages, 10)}`}
                          aria-current={i === pageIndex ? "page" : undefined}
                          className={`rounded-full transition-all ${
                            i === pageIndex ? "w-5 h-1.5 bg-violet-400" :
                            i === livePageIndex && liveActive ? "w-1.5 h-1.5 bg-green-400/70" :
                            "w-1.5 h-1.5 bg-white/20 hover:bg-white/40"
                          }`} />
                      ))}
                    </div>
                  )}

                  {/* Right controls */}
                  <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-white/25 uppercase tracking-wider">Opacity</span>
                      <input type="range" min="20" max="100"
                        aria-label="Overlay opacity"
                        value={Math.round((settings.opacity ?? 1) * 100)}
                        onChange={(e) => {
                          const v = parseInt(e.target.value) / 100;
                          updateSettings({ opacity: v });
                          window.ghostly.setOpacity(v);
                        }}
                        className="w-14 h-1 accent-violet-400 cursor-pointer" />
                    </div>
                    <div className="w-px h-4 bg-white/10" />
                    <button onClick={handleRestart} title="Clear session"
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21L21.5 8" />
                      </svg>
                    </button>
                  </div>
                </>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                {activeTab === "support" ? (
                  <SupportPanel
                    email={user?.email || ""}
                    supportAd={supportAd}
                    supportCategory={supportCategory}
                    setSupportCategory={setSupportCategory}
                    supportSubject={supportSubject}
                    setSupportSubject={setSupportSubject}
                    supportMessage={supportMessage}
                    setSupportMessage={setSupportMessage}
                    supportStatus={supportStatus}
                    supportError={supportError}
                    onSubmit={handleSupportSubmit}
                  />
                ) : activeTab === "jobs" ? (
                  <JobPortalPanel />
                ) : (activeTab as string) === "support-old" ? (
                  <div className="flex flex-col items-center gap-5 py-2">
                    <div className="text-center">
                      <div className="text-3xl mb-1.5">💛</div>
                      <p className="text-[15px] font-bold text-white/80 font-sans">Support Ghotly AI</p>
                      <p className="text-[12px] text-white/35 font-sans mt-1 leading-relaxed">
                        If this tool helped you crack an interview,<br />consider buying the developer a coffee! ☕
                      </p>
                    </div>

                    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-[#eb9245]/20 w-full max-w-[320px]"
                      style={{ background: "linear-gradient(135deg, rgba(235,146,69,0.08), rgba(235,146,69,0.03))" }}>
                      <img src={`${imgBase}mahesh.png`} alt="Mahesh Shelke"
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                        style={{ border: "2px solid rgba(235,146,69,0.5)" }} />
                      <div>
                        <p className="text-[13px] font-bold text-white">Mahesh Shelke</p>
                        <p className="text-[11px] text-white/40 font-sans">Developer · Ghotly AI</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-center gap-3 w-full max-w-[320px]">
                      <div className="w-full rounded-2xl overflow-hidden border border-white/[0.08] p-3"
                        style={{ background: "rgba(255,255,255,0.97)" }}>
                        <img src={`${imgBase}payment.png`} alt="UPI QR Code"
                          className="w-full object-contain rounded-xl"
                          style={{ maxHeight: "220px" }} />
                      </div>

                      <div className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl border border-white/[0.08]"
                        style={{ background: "rgba(255,255,255,0.04)" }}>
                        <div>
                          <p className="text-[9px] text-white/30 uppercase tracking-widest font-bold">UPI ID</p>
                          <p className="text-[13px] font-mono font-bold text-white/85">mahishelke0505@ybl</p>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText("mahishelke0505@ybl").catch(() => {});
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border"
                          style={copied ? { background: "rgba(34,197,94,0.15)", borderColor: "rgba(34,197,94,0.3)", color: "#4ade80" } : { background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
                        >
                          {copied ? (
                            <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>Copied!</>
                          ) : (
                            <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</>
                          )}
                        </button>
                      </div>

                      <p className="text-[10px] text-white/25 font-sans text-center">
                        Scan with any UPI app · PhonePe · GPay · Paytm
                      </p>
                    </div>
                  </div>
                ) : activeTab === "chat" ? (
                  <div className="flex flex-col h-full">
                    {chatMessages.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
                        <div className="text-4xl">💬</div>
                        <p className="text-[14px] font-semibold text-white/40 font-sans">Chat with Ghotly AI</p>
                        <p className="text-[12px] text-white/20 font-sans">Ask anything — coding, interview prep, explanations...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4 pb-2">
                        {chatMessages.map((msg, i) => (
                          <div key={msg.id} className={`flex flex-col gap-1.5 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                            <span className={`text-[9px] font-bold uppercase tracking-widest ${
                              msg.role === "user" ? "text-violet-400/60" : "text-blue-400/60"
                            }`}>
                              {msg.role === "user" ? "You" : <span className="inline-flex items-center gap-1"><GhostMascot size={16} variant="calm" alt="" /> Ghotly AI</span>}
                            </span>
                            {msg.role === "user" ? (
                              <div className="max-w-[85%] bg-violet-500/15 border border-violet-500/20 rounded-2xl rounded-tr-sm px-4 py-2.5 text-[13px] text-white/85 font-sans leading-relaxed">
                                {msg.text}
                              </div>
                            ) : (
                              <div className="w-full rounded-xl overflow-hidden border border-white/[0.05]" style={{ background: "rgba(8,8,10,0.7)" }}>
                                <SolutionCard content={msg.text} isStreaming={chatStreaming && i === chatMessages.length - 1 && msg.text === ""} />
                              </div>
                            )}
                          </div>
                        ))}
                        {chatStreaming && chatMessages[chatMessages.length - 1]?.role === "assistant" && chatMessages[chatMessages.length - 1]?.text === "" && (
                          <div className="flex items-center gap-2 text-white/30 text-[12px] font-sans">
                            <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
                            <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
                            <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>
                    )}
                  </div>
                ) : (
                <AnimatePresence mode="wait">
                  {totalPages === 0 && !isStreaming ? (
                    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="h-full flex flex-col items-center justify-center gap-4 text-center py-8">
                      <GhostMascot size={84} variant="hello" alt="" />
                      <div>
                        <p className="text-[15px] font-semibold text-white/50 font-sans mb-2">Ghotly AI is ready</p>
                        <p className="text-[12px] text-white/25 font-sans leading-relaxed">
                          Click <span className="text-violet-400 font-semibold">AI Answer</span> to start live transcription<br />
                          or <span className="text-white/40 font-semibold">Analyze Screen</span> to capture & solve
                        </p>
                      </div>
                      {!audio.isModelReady && (
                        audio.downloadProgress !== null ? (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full mt-2">
                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                            <span className="text-[10px] text-blue-400/80">
                              {`Loading engine... ${audio.downloadProgress}%`}
                            </span>
                          </div>
                        ) : (
                          <button
                            onClick={() => setSettingsOpen(true)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/25 rounded-full mt-2 hover:bg-amber-500/15 transition-colors"
                          >
                            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                            <span className="text-[10px] text-amber-400/90">Deepgram API key missing — open Settings</span>
                          </button>
                        )
                      )}
                    </motion.div>
                  ) : (
                    <motion.div key={pageIndex}
                      initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.1 }}
                      className="flex flex-col gap-5">

                      {/* Hide the question box for Screen Analysis: questionText is the
                          literal "Screen Analysis" for any built-prompt answer. */}
                      {!(isOnLivePage && liveActive) &&
                        (isOnLivePage ? liveQuestion : activePage?.question) &&
                        activePage?.question !== "Screen Analysis" && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-yellow-400/60 uppercase tracking-widest">🎙️ Interviewer</span>
                              {!isOnLivePage && (
                                <span className="text-[9px] text-white/20 font-mono">Q{pageIndex + 1}</span>
                              )}
                            </div>
                            <CopyButton text={isOnLivePage ? liveQuestion : activePage?.question || ""} />
                          </div>
                          <div className="text-[13px] text-white/80 leading-relaxed font-sans bg-white/[0.03] rounded-xl px-4 py-3 border border-white/[0.05]">
                            {isOnLivePage ? liveQuestion : activePage?.question}
                          </div>
                        </div>
                      )}

                      {(isOnLivePage ? (isStreaming || liveAnswer) : activePage?.answer) && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-violet-400/80 uppercase tracking-widest">🤖 Ghotly AI Solution</span>
                              {isStreaming && (
                                <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
                              )}
                            </div>
                            {!isStreaming && (
                              <CopyButton text={isOnLivePage ? liveAnswer : activePage?.answer || ""} />
                            )}
                          </div>
                          <div className="rounded-xl overflow-hidden border border-violet-500/15 shadow-2xl"
                            style={{ background: "rgba(10,10,14,0.75)" }}>
                            <SolutionCard
                              content={isOnLivePage ? liveAnswer : (activePage?.answer || "")}
                              isStreaming={isStreaming}
                            />
                          </div>
                          <div ref={answerEndRef} />
                        </div>
                      )}

                      {isOnLivePage && !isStreaming && !liveAnswer && (
                        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center px-4">
                          <span className="text-3xl">🎙️</span>
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-green-400/60 rounded-full animate-pulse" />
                            <span className="text-[13px] text-white/25 font-sans">
                              {liveActive ? "Listening… speak and click Send to AI" : "Click AI Answer to start listening"}
                            </span>
                          </div>
                          {/* Was silent before: an active session with no audio for 12s
                              now says why instead of leaving the user staring at nothing. */}
                          {liveActive && audio.statusWarning && (
                            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl border border-amber-400/25 max-w-[380px]"
                              style={{ background: "rgba(251,191,36,0.08)" }}>
                              <span className="text-[13px] shrink-0">⚠️</span>
                              <p className="text-[10.5px] text-amber-200/85 font-sans leading-relaxed text-left">{audio.statusWarning}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
                )}
              </div>

              {activeTab === "jobs" && <JobPortalFooter />}
              {activeTab !== "support" && activeTab !== "jobs" && (
              <>
              <div className="flex-shrink-0 px-4 py-3 border-t border-white/[0.05]"
                style={{ background: "rgba(10,10,12,0.6)" }}>
                {activeTab === "chat" ? (
                  <form onSubmit={(e) => { e.preventDefault(); handleChatSend(chatInput); }} className="relative">
                    <input
                      type="text" value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask Ghotly AI anything..."
                      disabled={chatStreaming}
                      className="w-full bg-white/[0.05] border border-white/[0.07] hover:border-white/[0.14] focus:border-violet-400/50 rounded-xl pl-4 pr-12 py-2.5 text-[13px] font-sans text-white/90 placeholder:text-white/25 focus:outline-none transition-colors disabled:opacity-40"
                    />
                    <button type="submit" disabled={chatStreaming || !chatInput.trim()}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-xl transition-all ${chatInput.trim() ? "bg-violet-500 text-white hover:bg-violet-400 shadow-md" : "text-white/20"}`}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={(e) => { e.preventDefault(); handleFollowUpSubmit(followUpText); }} className="relative">
                    <input
                      type="text" value={followUpText}
                      onChange={(e) => setFollowUpText(e.target.value)}
                      placeholder="Ask AI anything..."
                      disabled={isStreaming}
                      className="w-full bg-white/[0.05] border border-white/[0.07] hover:border-white/[0.14] focus:border-violet-400/50 rounded-xl pl-4 pr-12 py-2.5 text-[13px] font-sans text-white/90 placeholder:text-white/25 focus:outline-none transition-colors disabled:opacity-40"
                    />
                    <button type="submit" disabled={isStreaming || !followUpText.trim()}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-xl transition-all ${followUpText.trim() ? "bg-violet-500 text-white hover:bg-violet-400 shadow-md" : "text-white/20"}`}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </button>
                  </form>
                )}
              </div>
              </>
              )}
            </div>
          </div>
        </div>
      )}

      </motion.div>

      <AnimatePresence>
        {collapsed && <MinimizedLogo key="minimized-logo" onExpand={handleExpand} live={liveActive} busy={isStreaming} />}
      </AnimatePresence>

      <AnimatePresence>
        {fallbackNotice && !error && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl pointer-events-auto bg-violet-500/15 border border-violet-500/25 backdrop-blur-md shadow-xl">
            <p className="text-[12px] text-violet-200/90 font-sans flex gap-2 items-center">
              {fallbackNotice}
              <button onClick={() => setFallbackNotice(null)} className="ml-2 text-violet-300/50 hover:text-violet-200 transition-colors">✕</button>
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl pointer-events-auto bg-red-500/15 border border-red-500/25 backdrop-blur-md shadow-xl">
            <p className="text-[12px] text-red-200/90 font-sans flex gap-2 items-center">
              <span>⚠️</span> {error}
              <button onClick={() => setError(null)} className="ml-2 text-red-300/50 hover:text-red-200 transition-colors">✕</button>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
