import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store/useStore";
import { getProvider } from "../lib/ai";
import { buildPrompt, buildSessionContext, buildLiveInterviewPrompt } from "../lib/prompts";
import { v4 as uuidv4 } from "uuid";
import { TopBar } from "../components/TopBar";
import { SettingsPanel } from "../components/SettingsPanel";
import { SolutionCard } from "../components/SolutionCard";
import { useInterviewAudio } from "../hooks/useInterviewAudio";
import { compressScreenshot } from "../lib/utils/imageCompressor";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));

const BASE = "#1b1b26";
const nm = (raised = true) =>
  raised
    ? "6px 6px 14px rgba(0,0,0,0.55), -3px -3px 8px rgba(255,255,255,0.04)"
    : "inset 4px 4px 10px rgba(0,0,0,0.5), inset -2px -2px 6px rgba(255,255,255,0.04)";

const NavButton: React.FC<{ onClick: () => void; disabled?: boolean; children: React.ReactNode; title?: string }> = ({ onClick, disabled = false, children, title }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-7 h-7 flex items-center justify-center rounded-lg transition-all text-sm font-bold select-none outline-none"
      style={{
        background: BASE,
        boxShadow: disabled ? "none" : hovered ? nm(false) : nm(true),
        color: disabled ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.5)",
      }}
    >
      {children}
    </button>
  );
};

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
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-same-origin"
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
          <label className="text-[9px] font-bold uppercase tracking-widest text-white/30">Your email</label>
          <input value={email} readOnly className="mt-1 w-full rounded-xl px-3 py-2 text-[12px] font-semibold bg-white/[0.06] border border-white/[0.08] text-white/60 outline-none" />
        </div>
        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-white/30">Category</label>
          <select value={supportCategory} onChange={(e) => setSupportCategory(e.target.value)}
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
        <label className="text-[9px] font-bold uppercase tracking-widest text-white/30">Subject</label>
        <input value={supportSubject} onChange={(e) => setSupportSubject(e.target.value)}
          required maxLength={120} placeholder="Example: Screenshot capture is not working"
          className="mt-1 w-full rounded-xl px-3 py-2 text-[12px] font-semibold bg-white/[0.06] border border-white/[0.08] text-white/85 placeholder:text-white/20 outline-none focus:border-orange-400/40" />
      </div>

      <div className="mt-3">
        <label className="text-[9px] font-bold uppercase tracking-widest text-white/30">Message</label>
        <textarea value={supportMessage} onChange={(e) => setSupportMessage(e.target.value)}
          required minLength={10} maxLength={1200} placeholder="Tell what happened, what you clicked, and what you expected."
          className="mt-1 w-full h-28 rounded-xl px-3 py-2 text-[12px] font-semibold bg-white/[0.06] border border-white/[0.08] text-white/85 placeholder:text-white/20 outline-none resize-none focus:border-orange-400/40" />
      </div>

      {supportError && <p className="mt-3 text-[11px] font-bold text-red-300">{supportError}</p>}
      {supportStatus === "sent" && <p className="mt-3 text-[11px] font-bold text-green-300">Report sent. Thank you, I will check it from admin panel.</p>}

      <button type="submit" disabled={supportStatus === "sending" || !supportSubject.trim() || supportMessage.trim().length < 10}
        className="mt-4 w-full py-2.5 rounded-xl text-[12px] font-black transition-all disabled:opacity-40"
        style={{ background: "linear-gradient(135deg, #eb9245, #d97706)", color: "#111" }}>
        {supportStatus === "sending" ? "Sending..." : "Send Report"}
      </button>
    </form>

    <div className="space-y-3">
      <div className="rounded-2xl border border-orange-400/20 p-3"
        style={{ background: "linear-gradient(160deg, rgba(235,146,69,0.12), rgba(255,255,255,0.04))" }}>
        <p className="text-[10px] font-black uppercase tracking-widest text-orange-300/80">Support Ads</p>
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
  const {
    currentSolution, isStreaming, screenshots, error, settings,
    sessionMessages, addScreenshot, setCurrentSolution, appendToSolution,
    setIsStreaming, setError, clearSolution, addToHistory, addSessionMessage, updateSettings, interviewSession,
    user, ads,
  } = useStore();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [followUpText, setFollowUpText] = useState("");
  const [followUpFocused, setFollowUpFocused] = useState(false);
  const [chatFocused, setChatFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<"ai" | "screen" | "chat" | "support">("ai");
  const [liveActive, setLiveActive] = useState(false);
  // Fix: load autoAI from saved settings instead of hardcoded true
  const [autoAI, setAutoAI] = useState(() => settings.autoAI ?? true);
  const [qaPages, setQaPages] = useState<{ question: string; answer: string }[]>([]);

  // ── Session tracking ────────────────────────────────────────────────────────
  const sessionStartRef   = useRef<number>(Date.now());
  const featuresUsedRef   = useRef<Set<"ai-answer" | "screen" | "chat">>(new Set());
  const sessionQARef      = useRef<{ question: string; answer: string; feature: "ai-answer" | "screen" | "chat" | "follow-up"; timestamp: number }[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [userNavigated, setUserNavigated] = useState(false); // user manually changed page
  const [pendingTranscript, setPendingTranscript] = useState("");
  // Chat state
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const audio = useInterviewAudio();

  const screenshotsRef = useRef<string[]>(screenshots);
  const abortControllerRef = useRef<AbortController | null>(null);
  const answerEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { screenshotsRef.current = screenshots; }, [screenshots]);
  useEffect(() => () => { abortControllerRef.current?.abort(); }, []);

  // Auto scroll answer
  useEffect(() => {
    answerEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentSolution]);

  // Auto scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatStreaming]);

  // ── Core AI Stream ──────────────────────────────────────────────────────────
  const runAIStream = useCallback(async (
    screenshotList: string[],
    transcriptOverride?: string,
    followUpQuery?: string,
  ) => {
    const useGroq = !!transcriptOverride && !!settings.apiKeys["groq"];
    const providerName = useGroq ? "groq" : settings.activeProvider;
    const activeKey = useGroq ? settings.apiKeys["groq"] : settings.apiKeys[settings.activeProvider];

    if (!activeKey) {
      setError(`No API key for ${providerName}. Open Settings to add one.`);
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
    if (followUpQuery) {
      // Screen analysis saathi buildPrompt already pass hoto as followUpQuery
      // Check karto ki he already formatted prompt ahe ka simple question
      const isFormattedPrompt = followUpQuery.includes("## Approach") || 
        followUpQuery.includes("You are an expert") ||
        followUpQuery.includes("staff engineer");
      
      if (isFormattedPrompt) {
        prompt = followUpQuery; // Already built prompt — directly use karo
      } else {
        prompt = `${followUpQuery}\n\n(Answer concisely, spoken-style, max 4 sentences.)`;
      }
    } else if (transcriptOverride) {
        prompt = buildLiveInterviewPrompt(transcriptOverride, interviewSession);
    } else {
      prompt = buildPrompt(settings.interviewType, settings.language, interviewSession);
    }

    try {
      const provider = getProvider(providerName);
      let fullSolution = "";
      const latestScreenshot = transcriptOverride ? undefined :
        screenshotList.length > 0 ? screenshotList[screenshotList.length - 1] : undefined;
      const historyContext = sessionMessages.slice(-4).map((m) => ({ role: m.role, content: m.content }));

      const stream = provider.streamSolution({
        base64Image: latestScreenshot, prompt, messages: historyContext,
        model: useGroq ? "llama-3.3-70b-versatile" : settings.activeModel,
        apiKey: activeKey,
        mimeType: latestScreenshot?.includes("image/jpeg") ? "image/jpeg" : "image/png",
        maxTokens: transcriptOverride ? 2048 : 4096,
      });

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

      // Save Q&A to session history
      const questionText = transcriptOverride || (followUpQuery && !followUpQuery.includes("staff engineer") ? followUpQuery : "Screen Analysis");
      const featureTag = transcriptOverride ? "ai-answer" : screenshotList.length ? "screen" : "follow-up";
      sessionQARef.current.push({ question: questionText, answer: fullSolution, feature: featureTag, timestamp: Date.now() });

      // Commit answer to QA page
      if (transcriptOverride) {
        setQaPages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.question === transcriptOverride && !last.answer)
            return [...prev.slice(0, -1), { ...last, answer: fullSolution }];
          return prev;
        });
      }

      addSessionMessage({ id: uuidv4(), role: "user", content: questionText, screenshotBase64: latestScreenshot });
      addSessionMessage({ id: uuidv4(), role: "assistant", content: fullSolution });

      // Clear streaming buffer on completion to prevent duplicate pagination count
      if (!liveActive) {
        clearSolution();
      }

    } catch (err) {
      if (signal.aborted) return;
      setError(err instanceof Error ? err.message : "AI streaming failed");
    } finally {
      if (!signal.aborted) { setIsStreaming(false); }
    }
  }, [settings, sessionMessages, interviewSession, setCurrentSolution, setError, setIsStreaming, appendToSolution, addToHistory, addSessionMessage]);

  // ── Auto AI: silence detection — 2.5s after last transcript change ──────────
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLiveTextRef = useRef("");
  // Fix: stable ref to avoid stale closure inside setTimeout
  const runAIStreamRef = useRef(runAIStream);
  useEffect(() => { runAIStreamRef.current = runAIStream; }, [runAIStream]);

  useEffect(() => {
    if (!liveActive || !autoAI || isStreaming) return;
    const text = audio.liveText.trim();
    if (!text || text === lastLiveTextRef.current) return;
    lastLiveTextRef.current = text;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    const endsWithQuestion = text.endsWith("?") || text.includes("?");
    const silenceDelay = endsWithQuestion ? 800 : 2200;

    silenceTimerRef.current = setTimeout(() => {
      const current = audio.liveText.trim();
      if (!current || isStreaming) return;

      // Filter out short filler interjections (< 4 words unless ends with ?)
      const words = current.split(/\s+/).filter(Boolean);
      const isShortFiller = words.length < 4 && !current.endsWith("?");
      if (isShortFiller) return;

      // Auto-save previous Q&A into QA History Pages before starting new question
      if (pendingTranscript && currentSolution) {
        setQaPages(prev => [...prev, { question: pendingTranscript, answer: currentSolution }]);
        setPageIndex(prev => prev + 1);
      }

      audio.clearLiveText();
      setPendingTranscript(current);
      runAIStreamRef.current([], current);
    }, silenceDelay);

    return () => { if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current); };
  }, [audio.liveText, liveActive, autoAI, isStreaming, pendingTranscript, currentSolution]);

  // ── Toggle Live Mode (AI Answer tab click) ──────────────────────────────────
  const handleToggleLive = useCallback(() => {
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
    // Reset session tracking when starting fresh
    sessionStartRef.current = Date.now();
    featuresUsedRef.current = new Set();
    sessionQARef.current = [];
    clearSolution();
    setQaPages([]);
    setPageIndex(0);
    setPendingTranscript("");
    setLiveActive(true);
    audio.startInterview();
  }, [liveActive, audio, clearSolution, setError]);

  // ── Manual Send — liveText AI ko bhejo, same screen pe answer dikhe ─────────
  const handleManualSend = useCallback(() => {
    const t = audio.liveText.trim();
    if (!t) return;
    audio.clearLiveText();
    setPendingTranscript(t);
    runAIStream([], t);
  }, [audio, runAIStream]);

  // ── Next Question — current Q&A save, screen clear ────────────────────────
  const handleNextQuestion = useCallback(() => {
    if (pendingTranscript && currentSolution) {
      setQaPages(prev => [...prev, { question: pendingTranscript, answer: currentSolution }]);
      setPageIndex(prev => prev + 1);
    }
    setPendingTranscript("");
    clearSolution();
    audio.clearLiveText();
  }, [pendingTranscript, currentSolution, clearSolution, audio]);

  // ── Screen Analysis ─────────────────────────────────────────────────────────
  const handleScreenAnalysis = useCallback(async () => {
    try {
      // Abort any ongoing AI stream first
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        setIsStreaming(false);
      }
      // Pause live audio mode if currently running so feature calls never collide
      if (liveActive) {
        audio.stopInterview();
        setLiveActive(false);
      }
      clearSolution();
      const rawB64 = await window.ghostly.captureFullscreen();
      const compressedB64 = await compressScreenshot(rawB64, 800, 0.7);
      addScreenshot(compressedB64);
      const screenPrompt = buildPrompt(settings.interviewType, settings.language);
      runAIStream([compressedB64], undefined, screenPrompt);
    } catch { setError("Failed to capture screen."); }
  }, [runAIStream, setError, settings.interviewType, settings.language, addScreenshot, liveActive, audio, clearSolution, setIsStreaming]);

  // ── Tab change ──────────────────────────────────────────────────────────────
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
    if (!user?.idToken || supportStatus === "sending") return;

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
          interview_type: settings.interviewType,
          language: settings.language,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setSupportStatus("limited");
        setSupportError(data.error || "You can send only one support message per day.");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Could not send your report.");

      setSupportStatus("sent");
      setSupportSubject("");
      setSupportMessage("");
    } catch (err: any) {
      setSupportStatus("error");
      setSupportError(err.message || "Could not send your report.");
    }
  };

  const handleTabChange = useCallback((tab: "ai" | "screen" | "chat" | "support") => {
    // Abort any active AI stream when switching tabs to avoid feature collisions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }

    // Stop live audio listening when switching away from AI Answer tab
    if (tab !== "ai" && liveActive) {
      audio.stopInterview();
      setLiveActive(false);
    }

    setActiveTab(tab);

    if (tab === "screen") {
      handleScreenAnalysis();
    }
  }, [handleScreenAnalysis, liveActive, audio, setIsStreaming]);

  // ── Normal mode QA pairs — Fix #17: only recalc when streaming done, not every chunk
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

  // ── Page navigation ─────────────────────────────────────────────────────────
  // In live mode: qaPages. In normal mode: normalQaPairs
  const pages = liveActive ? qaPages : normalQaPairs.map(p => ({
    question: p.user?.content || "",
    answer: p.assistant?.content || "",
  }));

  const livePageIndex = pages.length;
  const totalPages = liveActive
    ? pages.length + (audio.liveText || pendingTranscript || isStreaming || currentSolution ? 1 : 0)
    : activeTab === "screen"
      ? (isStreaming || currentSolution || pages.length > 0 ? 1 : 0)
      : Math.max(1, pages.length + (isStreaming ? 1 : 0));

  const isOnLivePage = activeTab === "screen" ? false : pageIndex >= pages.length;
  // Fix: clamp pageIndex to prevent out-of-bounds blank screen
  const safePageIndex = activeTab === "screen" ? 0 : Math.min(pageIndex, Math.max(0, pages.length - 1));
  const activePage = !isOnLivePage ? (pages[safePageIndex] ?? null) : null;

  // In live mode: current screen = pendingTranscript + currentSolution (same screen)
  const liveQuestion = pendingTranscript || audio.liveText;
  const liveAnswer = currentSolution;

  // Auto jump to live page when new question arrives — only if user hasn't manually navigated
  useEffect(() => {
    if (!userNavigated) setPageIndex(livePageIndex);
  }, [qaPages.length, livePageIndex]);

  useEffect(() => {
    if (normalQaPairs.length > 0 && !isStreaming && !liveActive)
      setPageIndex(normalQaPairs.length - 1);
  }, [normalQaPairs.length, isStreaming, liveActive]);

  // Reset userNavigated when a new answer starts streaming
  useEffect(() => {
    if (isStreaming) setUserNavigated(false);
  }, [isStreaming]);

  // Bare Left/Right arrow Q-navigation — only fires while the overlay window has
  // keyboard focus (unlike Ctrl+8/Ctrl+2 below, which work from anywhere via a
  // global shortcut). This used to be registered a second time further down in
  // this component with near-identical logic, which made every arrow press
  // double-fire (advancing/rewinding two pages instead of one) — this is now the
  // only registration.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") { setUserNavigated(true); setPageIndex(p => Math.max(0, p - 1)); }
      // Fix: guard against totalPages=0 to avoid -1 index
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
    // Determine interviewType: if any ai-answer feature used, mark as live-interview
    const hasLive = featuresUsedRef.current.has("ai-answer");
    const sessionEntry = {
      id: uuidv4(),
      timestamp: sessionStartRef.current,
      solution: qaList[0]?.answer || "",
      provider: settings.activeProvider,
      model: settings.activeModel,
      interviewType: hasLive ? "live-interview" : settings.interviewType,
      language: settings.language,
      companyName: interviewSession?.companyName || "",
      position: interviewSession?.position || "",
      durationSeconds: duration,
      featuresUsed: Array.from(featuresUsedRef.current) as ("ai-answer" | "screen" | "chat")[],
      qaHistory: qaList,
    };
    addToHistory(sessionEntry);
    try {
      const h = await window.ghostly.getHistory();
      // Deduplicate: remove any existing entry with same session start timestamp
      const filtered = h.filter((x: any) => x.timestamp !== sessionEntry.timestamp && x.id !== sessionEntry.id);
      await window.ghostly.saveHistory([sessionEntry, ...filtered]);
    } catch { /* best-effort */ }
    // Reset tracking for next session
    sessionStartRef.current = Date.now();
    featuresUsedRef.current = new Set();
    sessionQARef.current = [];
  }, [settings, interviewSession, addToHistory]);

  const handleRestart = useCallback(() => {
    abortControllerRef.current?.abort();
    // Fix: null out ref after abort to prevent double-abort
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
  // Fix: removed saveSessionToHistory from deps — it was causing stale closure
  }, [clearSolution, setIsStreaming, audio]);

  // ── Chat Send ────────────────────────────────────────────────────────────
  const handleChatSend = useCallback(async (text: string) => {
    if (!text.trim() || chatStreaming) return;
    featuresUsedRef.current.add("chat");
    const userMsg = { role: "user" as const, text: text.trim() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setChatStreaming(true);

    const activeKey = settings.apiKeys[settings.activeProvider];
    if (!activeKey) {
      setChatMessages(prev => [...prev, { role: "assistant", text: `No API key for ${settings.activeProvider}. Open Settings to add one.` }]);
      setChatStreaming(false);
      return;
    }

    try {
      const provider = getProvider(settings.activeProvider);
      const history = chatMessages.slice(-8).map(m => ({ role: m.role, content: m.text }));
      const stream = provider.streamSolution({
        prompt: text.trim(),
        messages: history,
        model: settings.activeModel,
        apiKey: activeKey,
        maxTokens: 2048,
      });

      let full = "";
      let lastChatFlush = Date.now();
      setChatMessages(prev => [...prev, { role: "assistant", text: "" }]);
      for await (const chunk of stream) {
        full += chunk;
        const now = Date.now();
        if (now - lastChatFlush > 50) {
          const currentText = full;
          setChatMessages(prev => [
            ...prev.slice(0, -1),
            { role: "assistant", text: currentText },
          ]);
          lastChatFlush = now;
        }
      }
      setChatMessages(prev => [
        ...prev.slice(0, -1),
        { role: "assistant", text: full },
      ]);
      // Save chat Q&A to session history
      sessionQARef.current.push({ question: text.trim(), answer: full, feature: "chat", timestamp: Date.now() });
    } catch (err) {
      setChatMessages(prev => [...prev, { role: "assistant", text: `Error: ${err instanceof Error ? err.message : "AI failed"}` }]);
    } finally {
      setChatStreaming(false);
    }
  }, [chatStreaming, chatMessages, settings]);

  // Force show window, opacity 1, and enable mouse on mount when entering interview screen
  useEffect(() => {
    window.ghostly.setOpacity(1);
    window.ghostly.show();
    window.ghostly.enableMouse();
  }, []);

  // Hotkeys — all of these arrive as IPC events from Electron's system-wide
  // globalShortcut registrations (electron/hotkeys.ts), so they work regardless
  // of which window has OS focus (Zoom, the browser, your IDE). Renderer-side
  // `window.addEventListener('keydown', ...)` handlers used to be registered
  // here for Ctrl+N/Ctrl+0/Ctrl+E/Ctrl+8/Ctrl+2, which only fired while this
  // (usually invisible) overlay window itself happened to have keyboard focus —
  // effectively never during a real interview.
  useEffect(() => {
    // Ctrl+E / Ctrl+Shift+S / Ctrl+Shift+Enter (main process) both funnel through
    // here. Compress to 800px/70% JPEG to match handleScreenAnalysis's payload
    // size (this used to be sent uncompressed for the hotkey path only, several
    // times larger than the button-triggered flow).
    const offScreenshot = window.ghostly.onScreenshot(async (b64) => {
      const compressed = await compressScreenshot(b64, 800, 0.7);
      addScreenshot(compressed);
    });
    // Ctrl+Enter — solve whatever's already captured/transcribed. If it's a
    // screenshot-driven solve, use the same interview-type/language prompt
    // handleScreenAnalysis builds instead of an empty one.
    const offSolve = window.ghostly.onSolve(async () => {
      const followUp = screenshotsRef.current.length > 0
        ? buildPrompt(settings.interviewType, settings.language)
        : undefined;
      await runAIStream(screenshotsRef.current, undefined, followUp);
    });
    const offStartOver = window.ghostly.onStartOver(handleRestart);

    // Ctrl+N — Next Question (only meaningful while live-listening)
    const offNextQuestion = window.ghostly.onNextQuestion(() => {
      if (!liveActive) return;
      if (currentSolution && pendingTranscript) {
        setQaPages(prev => [...prev, { question: pendingTranscript, answer: currentSolution }]);
      }
      setPendingTranscript("");
      clearSolution();
      audio.clearLiveText();
      lastLiveTextRef.current = "";
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    });

    // Ctrl+0 — Manual Send (skip waiting for silence detection)
    const offManualSend = window.ghostly.onManualSend(() => {
      if (liveActive && audio.liveText.trim() && !isStreaming) {
        handleManualSend();
      }
    });

    // Ctrl+8 — Previous Question page
    const offPrevQuestion = window.ghostly.onPrevQuestion(() => {
      setUserNavigated(true);
      setPageIndex(p => Math.max(0, p - 1));
    });

    // Ctrl+2 — Next Question page
    const offNextQuestionPage = window.ghostly.onNextQuestionPage(() => {
      setUserNavigated(true);
      setPageIndex(p => Math.min(Math.max(0, totalPages - 1), p + 1));
    });

    return () => {
      offScreenshot();
      offSolve();
      offStartOver();
      offNextQuestion();
      offManualSend();
      offPrevQuestion();
      offNextQuestionPage();
    };
  }, [runAIStream, addScreenshot, handleRestart, liveActive, isStreaming, currentSolution, pendingTranscript, handleManualSend, audio.liveText, settings.interviewType, settings.language, totalPages]);

  const displayLiveText = audio.liveText || pendingTranscript;

  return (
    <div className="h-screen w-full bg-transparent text-white font-mono pointer-events-none flex flex-col" style={{ userSelect: "none", WebkitUserSelect: "none" } as React.CSSProperties}>

      {/* ── TopBar ── */}
      <div className="flex-none">
        <TopBar
          onOpenSettings={() => setSettingsOpen(true)}
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
          onToggleAutoAI={() => setAutoAI(v => !v)}
        />
      </div>

      {/* ── Settings Panel ── */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
            <SettingsPanel onClose={() => setSettingsOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Content ── */}
      {!settingsOpen && (
        <div className="flex-1 min-h-0 flex justify-center px-3 pb-3 mt-1 pointer-events-auto overflow-hidden">
          <div className="w-full flex flex-col h-full">
            <div
              className="flex-1 min-h-0 flex flex-col rounded-2xl overflow-hidden border border-white/[0.07] shadow-2xl"
              style={{ background: "rgba(16,16,18,0.94)", backdropFilter: "blur(28px)" }}
              onMouseEnter={() => window.ghostly.enableMouse()}
            >
              {/* ── Card Header ── */}
              <div className="flex items-center justify-between px-4 h-11 border-b border-white/[0.06] flex-shrink-0"
                style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>

                {activeTab === "support" ? (
                  <>
                    <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                      <span className="text-[11px] font-semibold text-orange-300/80 font-sans">Support & Report</span>
                    </div>
                    <div /><div />
                  </>
                ) : activeTab === "chat" ? (
                  /* Chat header */
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
                          value={Math.round((settings.opacity ?? 1) * 100)}
                          onChange={(e) => { const v = parseInt(e.target.value)/100; updateSettings({opacity:v}); window.ghostly.setOpacity(v); }}
                          className="w-14 h-1 accent-orange-400 cursor-pointer" />
                      </div>
                    </div>
                  </>
                ) : (
                <>
                  <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                    <button onClick={() => { setUserNavigated(true); setPageIndex(p => Math.max(0, p - 1)); }}
                      disabled={pageIndex === 0 || totalPages === 0}
                      className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/30 hover:text-white/70 disabled:opacity-20 transition-colors text-sm">‹</button>
                    <span className="text-[11px] text-white/30 font-mono tabular-nums min-w-[40px] text-center">
                      {totalPages === 0 ? "—" : `${Math.min(pageIndex + 1, totalPages)} / ${totalPages}`}
                    </span>
                    <button onClick={() => { setUserNavigated(true); setPageIndex(p => Math.min(Math.max(0, totalPages - 1), p + 1)); }}
                      disabled={pageIndex >= totalPages - 1 || totalPages === 0}
                      className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/30 hover:text-white/70 disabled:opacity-20 transition-colors text-sm">›</button>
                  </div>

                  {/* Dots */}
                  {totalPages > 1 && (
                    <div className="flex gap-1.5 items-center" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                      {Array.from({ length: Math.min(totalPages, 10) }).map((_, i) => (
                        <button key={i} onClick={() => { setUserNavigated(true); setPageIndex(i); }}
                          className={`rounded-full transition-all ${
                            i === pageIndex ? "w-5 h-1.5 bg-[#eb9245]" :
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
                        value={Math.round((settings.opacity ?? 1) * 100)}
                        onChange={(e) => {
                          const v = parseInt(e.target.value) / 100;
                          updateSettings({ opacity: v });
                          window.ghostly.setOpacity(v);
                        }}
                        className="w-14 h-1 accent-orange-400 cursor-pointer" />
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
                )} {/* end chat/normal header */}
              </div>

              {/* ── Card Body ── */}
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
                ) : (activeTab as string) === "support-old" ? (
                  /* ── SUPPORT PANEL ── */
                  <div className="flex flex-col items-center gap-5 py-2">
                    <div className="text-center">
                      <div className="text-3xl mb-1.5">💛</div>
                      <p className="text-[15px] font-bold text-white/80 font-sans">Support Ghostly AI</p>
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
                        <p className="text-[11px] text-white/40 font-sans">Developer · Ghostly AI</p>
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
                            navigator.clipboard.writeText("mahishelke0505@ybl");
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
                  /* ── CHAT PANEL ── */
                  <div className="flex flex-col h-full">
                    {chatMessages.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
                        <div className="text-4xl">💬</div>
                        <p className="text-[14px] font-semibold text-white/40 font-sans">Chat with Ghostly AI</p>
                        <p className="text-[12px] text-white/20 font-sans">Ask anything — coding, interview prep, explanations...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4 pb-2">
                        {chatMessages.map((msg, i) => (
                          <div key={i} className={`flex flex-col gap-1.5 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                            <span className={`text-[9px] font-bold uppercase tracking-widest ${
                              msg.role === "user" ? "text-[#eb9245]/60" : "text-blue-400/60"
                            }`}>
                              {msg.role === "user" ? "You" : "👻 Ghostly AI"}
                            </span>
                            {msg.role === "user" ? (
                              <div className="max-w-[85%] bg-[#eb9245]/15 border border-[#eb9245]/20 rounded-2xl rounded-tr-sm px-4 py-2.5 text-[13px] text-white/85 font-sans leading-relaxed">
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
                            <span className="w-1.5 h-1.5 bg-[#eb9245] rounded-full animate-pulse" />
                            <span className="w-1.5 h-1.5 bg-[#eb9245] rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
                            <span className="w-1.5 h-1.5 bg-[#eb9245] rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>
                    )}
                  </div>
                ) : (
                <AnimatePresence mode="wait">
                  {totalPages === 0 && !isStreaming ? (
                    /* Empty state */
                    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="h-full flex flex-col items-center justify-center gap-4 text-center py-8">
                      <div className="text-5xl">👻</div>
                      <div>
                        <p className="text-[15px] font-semibold text-white/50 font-sans mb-2">Ghostly AI is ready</p>
                        <p className="text-[12px] text-white/25 font-sans leading-relaxed">
                          Click <span className="text-[#eb9245] font-semibold">AI Answer</span> to start live transcription<br />
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

                      {/* ── Interviewer Question ── */}
                      {/* Hide question box for Screen Analysis or system prompt */}
                      {activeTab !== "screen" && !(isOnLivePage && liveActive) &&
                        (isOnLivePage ? liveQuestion : activePage?.question) &&
                        activePage?.question !== "Screen Analysis" &&
                        !activePage?.question?.includes("staff engineer") && (
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

                      {/* ── AI Answer ── clean main area ── */}
                      {(activeTab === "screen" || (isOnLivePage ? (isStreaming || liveAnswer) : activePage?.answer)) && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-violet-400/80 uppercase tracking-widest">🤖 Ghostly AI Solution</span>
                              {isStreaming && (
                                <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
                              )}
                            </div>
                            {!isStreaming && (
                              <CopyButton text={activeTab === "screen" ? (currentSolution || activePage?.answer || pages[pages.length - 1]?.answer || "") : (isOnLivePage ? liveAnswer : activePage?.answer || "")} />
                            )}
                          </div>
                          <div className="rounded-xl overflow-hidden border border-violet-500/15 shadow-2xl"
                            style={{ background: "rgba(10,10,14,0.75)" }}>
                            <SolutionCard
                              content={activeTab === "screen" ? (currentSolution || activePage?.answer || pages[pages.length - 1]?.answer || "") : (isOnLivePage ? liveAnswer : (activePage?.answer || ""))}
                              isStreaming={isStreaming}
                            />
                          </div>
                          <div ref={answerEndRef} />
                        </div>
                      )}

                      {/* Waiting state on live page — clean empty screen */}
                      {isOnLivePage && !isStreaming && !liveAnswer && (
                        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                          <span className="text-3xl">🎙️</span>
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-green-400/60 rounded-full animate-pulse" />
                            <span className="text-[13px] text-white/25 font-sans">
                              {liveActive ? "Listening… speak and click Send to AI" : "Click AI Answer to start listening"}
                            </span>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
                )} {/* end chat conditional */}
              </div>

              {/* ── Input Footer ── */}
              {activeTab !== "support" && (
              <>
              <div className="flex-shrink-0 px-4 py-3 border-t border-white/[0.05]"
                style={{ background: "rgba(10,10,12,0.9)" }}>
                {activeTab === "chat" ? (
                  <form onSubmit={(e) => { e.preventDefault(); handleChatSend(chatInput); }} className="relative">
                    <input
                      type="text" value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask Ghostly AI anything..."
                      disabled={chatStreaming}
                      className="w-full bg-white/[0.05] border border-white/[0.07] hover:border-white/[0.14] focus:border-[#eb9245]/50 rounded-xl pl-4 pr-12 py-2.5 text-[13px] font-sans text-white/90 placeholder:text-white/25 focus:outline-none transition-colors disabled:opacity-40"
                    />
                    <button type="submit" disabled={chatStreaming || !chatInput.trim()}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-xl transition-all ${chatInput.trim() ? "bg-[#eb9245] text-black hover:bg-[#f5a55a] shadow-md" : "text-white/20"}`}>
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
                      className="w-full bg-white/[0.05] border border-white/[0.07] hover:border-white/[0.14] focus:border-[#eb9245]/50 rounded-xl pl-4 pr-12 py-2.5 text-[13px] font-sans text-white/90 placeholder:text-white/25 focus:outline-none transition-colors disabled:opacity-40"
                    />
                    <button type="submit" disabled={isStreaming || !followUpText.trim()}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-xl transition-all ${followUpText.trim() ? "bg-[#eb9245] text-black hover:bg-[#f5a55a] shadow-md" : "text-white/20"}`}>
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

      {/* ── Error Banner ── */}
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
