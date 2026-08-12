/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GROQ_API_KEY: string;
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_WEBSITE_URL: string;
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  ghostly: {
    openExternal: (url: string) => void;
    getDesktopSources: () => Promise<{ id: string; name: string }[]>;
    enableMouse: () => void;
    disableMouse: () => void;
    hide: () => void;
    show: () => void;
    quit: () => void;
    getVersion: () => string;
    onShow: (cb: () => void) => () => void;
    captureFullscreen: () => Promise<string>;
    getSettings: () => Promise<any>;
    saveSettings: (settings: any) => Promise<void>;
    setOpacity: (value: number) => void;
    getHistory: () => Promise<any[]>;
    saveHistory: (history: any[]) => Promise<void>;
    getSavedProfile: () => Promise<any>;
    saveProfile: (profile: any) => Promise<void>;
    getUser: () => Promise<any>;
    saveUser: (user: any) => Promise<void>;
    logoutUser: () => Promise<void>;
    getSubscription: () => Promise<any>;
    saveSubscription: (sub: any) => Promise<void>;
    getAds: () => Promise<any[]>;
    saveAds: (ads: any[]) => Promise<void>;
    onAuthToken: (cb: (data: { token: string; user: any }) => void) => () => void;
    getPendingAuthToken: () => Promise<{ token: string; user: any } | null>;
    onDeepLink: (cb: (url: string) => void) => () => void;
    onScreenshot: (cb: (b64: string) => void) => () => void;
    onSolve: (cb: () => void) => () => void;
    onStartOver: (cb: () => void) => () => void;
    onNextQuestion: (cb: () => void) => () => void;
    onManualSend: (cb: () => void) => () => void;
    onPrevQuestion: (cb: () => void) => () => void;
    onNextQuestionPage: (cb: () => void) => () => void;
    onUpdateAvailable: (cb: (version: string) => void) => () => void;
    onUpdateProgress: (cb: (percent: number) => void) => () => void;
    onUpdateDownloaded: (cb: () => void) => () => void;
    onUpdateNotAvailable: (cb: () => void) => () => void;
    onUpdateError: (cb: (msg: string) => void) => () => void;
    checkForUpdates: () => void;
    downloadUpdate: () => void;
    installUpdate: () => void;
    nvidiaApiCall: (apiKey: string, body: any) => Promise<{ ok: boolean; status: number; data: string }>;
    nvidiaTestKey: (apiKey: string) => Promise<{ ok: boolean; status: number; data: string }>;
    anthropicApiCall: (apiKey: string, body: any) => Promise<{ ok: boolean; status: number; data: string }>;
    getShortcuts: () => Promise<Record<string, string>>;
    updateShortcuts: (bindings: Record<string, string>) => Promise<{ ok: boolean; failed: string[] }>;
    resetShortcuts: () => Promise<{ ok: boolean; failed: string[] }>;
  };
}
