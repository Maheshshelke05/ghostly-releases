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
  language: string;
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
  interviewType: "dsa" | "system_design" | "frontend" | "sql" | "behavioral";
  language: "python" | "javascript" | "typescript" | "java" | "cpp" | "go";
  apiKeys: Record<string, string>;
  deepgramApiKey: string;
  customInstructions?: string;
  micDeviceId?: string;
  transcriptionEngine: "deepgram";
  opacity?: number;
  autoAI?: boolean;
  autoScroll?: boolean;
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
}

const ENV = {
  groq:        import.meta.env.VITE_GROQ_API_KEY        || "",
  gemini:      import.meta.env.VITE_GEMINI_API_KEY       || "",
  openai:      import.meta.env.VITE_OPENAI_API_KEY       || "",
  anthropic:   import.meta.env.VITE_ANTHROPIC_API_KEY    || "",
  deepgram:    import.meta.env.VITE_DEEPGRAM_API_KEY     || "",
  openrouter:  import.meta.env.VITE_OPENROUTER_API_KEY   || "",
};

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
  settings: {
    activeProvider: "groq",
    activeModel: "llama-3.3-70b-versatile",
    interviewType: "dsa",
    language: "python",
    apiKeys: {
      groq: ENV.groq,
      gemini: ENV.gemini,
      openrouter: ENV.openrouter,
      nvidia: "",
    },
    deepgramApiKey: ENV.deepgram,
    customInstructions: "",
    micDeviceId: "default",
    transcriptionEngine: "deepgram",
    opacity: 1,
    autoAI: true,
    autoScroll: true,
  },

  setAppScreen: (appScreen) => set({ appScreen }),
  setInterviewSession: (session) => set({ interviewSession: session }),
  clearInterviewSession: () => set({ interviewSession: null }),
  setSavedProfile: (profile) => set({ savedProfile: profile }),
  setCurrentSolution: (text) => set({ currentSolution: text }),
  appendToSolution: (chunk) => set((s) => ({ currentSolution: s.currentSolution + chunk })),
  setIsStreaming: (v) => set({ isStreaming: v }),
  setCurrentScreenshot: (b64) => set({ currentScreenshot: b64 }),
  addScreenshot: (b64) => set((s) => ({ screenshots: [...s.screenshots, b64], currentScreenshot: b64 })),
  clearScreenshots: () => set({ screenshots: [], currentScreenshot: null }),
  removeScreenshot: (index) => set((s) => {
    const next = s.screenshots.filter((_, i) => i !== index);
    return { screenshots: next, currentScreenshot: next.length > 0 ? next[next.length - 1] : null };
  }),
  setError: (err) => set({ error: err }),
  clearSolution: () => set({ currentSolution: "", screenshots: [], currentScreenshot: null, error: null, sessionMessages: [] }),
  setMouseEnabled: (v) => set({ mouseEnabled: v }),
  addSessionMessage: (msg) => set((state) => ({ sessionMessages: [...state.sessionMessages, msg] })),
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
}));
