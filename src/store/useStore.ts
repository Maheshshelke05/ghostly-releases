import { create } from "zustand";
import type { ProviderName } from "../lib/ai";

export interface QAPair {
  question: string;
  answer: string;
  feature: "ai-answer" | "screen" | "chat" | "follow-up";
  timestamp: number;
}

export interface Ad {
  id: string;
  title: string;
  description: string;
  image_url?: string;
  cta_text: string;
  cta_url: string;
  ad_code?: string;
  script_url?: string;
  container_id?: string;
  type: string;
  is_active: boolean;
  priority: number;
}

export interface Subscription {
  plan: "free";
  status: string;
  expires_at: null;
}

export interface AppUser {
  userId: string;
  email: string;
  name: string;
  picture?: string;
  idToken: string;
}

export interface Solution {
  id: string;
  timestamp: number;
  screenshotBase64?: string;
  solution: string;
  provider: ProviderName;
  model: string;
  interviewType: string;
  // No longer filled from the removed "Code Language" setting; kept optional for backward
  // compatibility with older saved history entries.
  language?: string;
  // Rich session data
  companyName?: string;
  position?: string;
  durationSeconds?: number;
  featuresUsed?: ("ai-answer" | "screen" | "chat")[];
  qaHistory?: QAPair[];
}

export interface SessionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  screenshotBase64?: string;
}

export interface CandidateProfile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  skills: string;          // comma separated
  experience: string;      // free text: role, company, years
  projects: string;        // free text
  education: string;       // degree, college, year
  certifications: string;
  linkedin: string;
  github: string;
}

export interface InterviewSession {
  companyName: string;
  position: string;
  language: string;
  description: string;
  profile: CandidateProfile | null;
}

export interface Settings {
  activeProvider: ProviderName;
  activeModel: string;
  apiKeys: Record<string, string>;
  // Providers the user switched off (double-click on "Active" in Settings).
  // Their key stays saved but they're never used — see lib/providerState.ts.
  disabledProviders?: string[];
  deepgramApiKey: string;
  // Optional Deepgram `language` override (blank = Deepgram's English default); "multi" or another
  // Deepgram code enables code-switched Hindi/English interviews without changing everyone's default.
  deepgramLanguage?: string;
  customInstructions?: string;
  // Retry the same answer with the next configured provider on a real 429/quota error only.
  // Defaults on; turn off in Settings to always stick to the chosen provider.
  autoSwitchProvider?: boolean;
  micDeviceId?: string;
  transcriptionEngine: "deepgram";
  opacity?: number;
  autoAI?: boolean;
  autoScroll?: boolean;
  // Opt-in backup of tested API keys (lib/keySync.ts). Off by default: uploading a key
  // without asking contradicts the bring-your-own-key promise.
  keySyncEnabled?: boolean;
}

interface GhostlyStore {
  appScreen: "home" | "login" | "interview-setup" | "api-setup" | "audio-setup" | "interview";
  interviewSession: InterviewSession | null;
  savedProfile: CandidateProfile | null;
  currentSolution: string;
  isStreaming: boolean;
  screenshots: string[];
  currentScreenshot: string | null;
  error: string | null;
  sessionMessages: SessionMessage[];
  history: Solution[];
  settings: Settings;
  mouseEnabled: boolean;
  user: AppUser | null;
  subscription: Subscription;
  ads: Ad[];
  // Known login/account failure (blocked account, server error) shared by App.tsx and HomePage.tsx,
  // so LoginPage can show it instead of falling back to a blocking native alert().
  loginError: string | null;

  setAppScreen: (screen: "home" | "login" | "interview-setup" | "api-setup" | "audio-setup" | "interview") => void;
  setInterviewSession: (session: InterviewSession) => void;
  clearInterviewSession: () => void;
  setSavedProfile: (profile: CandidateProfile) => void;
  setCurrentSolution: (text: string) => void;
  appendToSolution: (chunk: string) => void;
  setIsStreaming: (v: boolean) => void;
  setCurrentScreenshot: (b64: string | null) => void;
  addScreenshot: (b64: string) => void;
  clearScreenshots: () => void;
  removeScreenshot: (index: number) => void;
  setError: (err: string | null) => void;
  clearSolution: () => void;
  setMouseEnabled: (v: boolean) => void;
  addSessionMessage: (msg: SessionMessage) => void;
  addToHistory: (s: Solution) => void;
  removeFromHistory: (id: string) => void;
  clearHistory: () => void;
  setHistory: (history: Solution[]) => void;
  updateSettings: (partial: Partial<Settings>) => void;
  setApiKey: (provider: string, key: string) => void;
  setSettings: (settings: Settings) => void;
  setUser: (user: AppUser | null) => void;
  setSubscription: (sub: Subscription) => void;
  setAds: (ads: Ad[]) => void;
  setLoginError: (err: string | null) => void;
}

/** Newest N captures kept in memory (see addScreenshot). */
const MAX_SCREENSHOTS = 3;
/** Newest N transcript messages kept in memory (see addSessionMessage). */
const MAX_SESSION_MESSAGES = 40;

export const useStore = create<GhostlyStore>((set) => ({
  appScreen: "home",
  interviewSession: null,
  savedProfile: null,
  currentSolution: "",
  isStreaming: false,
  screenshots: [],
  currentScreenshot: null,
  error: null,
  sessionMessages: [],
  history: [],
  mouseEnabled: false,
  user: null,
  subscription: { plan: "free", status: "active", expires_at: null },
  ads: [],
  loginError: null,
  settings: {
    activeProvider: "groq",
    // llama-3.3-70b-versatile shuts down 08/16/26 (Groq's deprecation schedule)
    activeModel: "openai/gpt-oss-120b",
    apiKeys: {
      // No build-time VITE_*_API_KEY defaults: Vite inlines them into the renderer bundle, leaking
      // the maintainer's key to every user (and Test would upload it against their account).
      groq: "",
      gemini: "",
      openrouter: "",
      nvidia: "",
    },
    disabledProviders: [],
    deepgramApiKey: "",
    customInstructions: "",
    autoSwitchProvider: true,
    micDeviceId: "default",
    transcriptionEngine: "deepgram",
    opacity: 1,
    autoAI: true,
    autoScroll: true,
    keySyncEnabled: false,
  },

  setAppScreen: (appScreen) => set({ appScreen }),
  setInterviewSession: (session) => set({ interviewSession: session }),
  clearInterviewSession: () => set({ interviewSession: null }),
  setSavedProfile: (profile) => set({ savedProfile: profile }),
  setCurrentSolution: (text) => set({ currentSolution: text }),
  appendToSolution: (chunk) => set((s) => ({ currentSolution: s.currentSolution + chunk })),
  setIsStreaming: (v) => set({ isStreaming: v }),
  setCurrentScreenshot: (b64) => set({ currentScreenshot: b64 }),
  // Only the newest captures are used (runAIStream reads the last one), so older base64 frames are
  // dropped instead of keeping tens of MB alive for the whole interview.
  addScreenshot: (b64) => set((s) => ({ screenshots: [...s.screenshots, b64].slice(-MAX_SCREENSHOTS), currentScreenshot: b64 })),
  clearScreenshots: () => set({ screenshots: [], currentScreenshot: null }),
  removeScreenshot: (index) => set((s) => {
    const next = s.screenshots.filter((_, i) => i !== index);
    return { screenshots: next, currentScreenshot: next.length > 0 ? next[next.length - 1] : null };
  }),
  setError: (err) => set({ error: err }),
  clearSolution: () => set({ currentSolution: "", screenshots: [], currentScreenshot: null, error: null, sessionMessages: [] }),
  setMouseEnabled: (v) => set({ mouseEnabled: v }),
  addSessionMessage: (msg) => set((state) => ({
    // Only the last few messages are used as prompt context, so bound the window; an unbounded
    // array kept every base64 screenshot of a long interview alive for the session.
    sessionMessages: [...state.sessionMessages, msg].slice(-MAX_SESSION_MESSAGES),
  })),
  addToHistory: (s) => set((state) => ({ history: [s, ...state.history].slice(0, 30) })),
  removeFromHistory: (id) => set((state) => ({ history: state.history.filter((s) => s.id !== id) })),
  clearHistory: () => set({ history: [] }),
  setHistory: (history) => set({ history }),
  updateSettings: (partial) => set((s) => ({ settings: { ...s.settings, ...partial } })),
  setApiKey: (provider, key) => set((s) => ({
    settings: { ...s.settings, apiKeys: { ...s.settings.apiKeys, [provider]: key } },
  })),
  setSettings: (settings) => set({ settings }),
  setUser: (user) => set({ user }),
  setSubscription: (subscription) => set({ subscription }),
  setAds: (ads) => set({ ads }),
  setLoginError: (loginError) => set({ loginError }),
}));

// One debounced subscription saves every settings writer; the old hand-called saveSettings missed the
// interview screen's opacity slider and Auto-AI toggle, so both were forgotten on restart.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const flushSettings = () => {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try { window.ghostly?.saveSettings(useStore.getState().settings)?.catch(() => {}); } catch { /* not in Electron */ }
};

useStore.subscribe((state, prev) => {
  if (state.settings === prev.settings) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSettings, 300);
});

// Quitting inside the debounce window would otherwise lose the last change.
if (typeof window !== "undefined") window.addEventListener("beforeunload", flushSettings);
