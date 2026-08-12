import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ghostly", {
  // Open URL in system browser (Chrome etc)
  openExternal: (url: string): void => ipcRenderer.send("ghostly:open-external", url),

  // System Audio source fetcher
  getDesktopSources: (): Promise<{id: string, name: string}[]> =>
    ipcRenderer.invoke("ghostly:get-desktop-sources"),

  // Mouse click-through control
  enableMouse: (): void => ipcRenderer.send("ghostly:enable-mouse"),
  disableMouse: (): void => ipcRenderer.send("ghostly:disable-mouse"),

  // Window control
  hide: (): void => ipcRenderer.send("ghostly:hide"),
  show: (): void => ipcRenderer.send("ghostly:show"),
  quit: (): void => ipcRenderer.send("ghostly:quit"),
  getVersion: (): string => ipcRenderer.sendSync("ghostly:get-version"),
  onShow: (cb: () => void): (() => void) => {
    const listener = (): void => cb();
    ipcRenderer.on("ghostly:show", listener);
    return () => ipcRenderer.removeListener("ghostly:show", listener);
  },

  // Capture
  captureFullscreen: (): Promise<string> =>
    ipcRenderer.invoke("ghostly:capture-fullscreen"),

  // Settings persistence
  getSettings: (): Promise<any> => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings: any): Promise<void> =>
    ipcRenderer.invoke("save-settings", settings),

  // Opacity control
  setOpacity: (value: number): void => ipcRenderer.send("ghostly:set-opacity", value),

  // History persistence
  getHistory: (): Promise<any[]> => ipcRenderer.invoke("get-history"),
  saveHistory: (history: any[]): Promise<void> =>
    ipcRenderer.invoke("save-history", history),

  // Profile persistence
  getSavedProfile: (): Promise<any> => ipcRenderer.invoke("get-saved-profile"),
  saveProfile: (profile: any): Promise<void> =>
    ipcRenderer.invoke("save-profile", profile),

  // Auth / User
  getUser: (): Promise<any> => ipcRenderer.invoke("get-user"),
  saveUser: (user: any): Promise<void> => ipcRenderer.invoke("save-user", user),
  logoutUser: (): Promise<void> => ipcRenderer.invoke("logout-user"),
  getAds: (): Promise<any[]> => ipcRenderer.invoke("get-ads"),
  saveAds: (ads: any[]): Promise<void> => ipcRenderer.invoke("save-ads", ads),
  onAuthToken: (cb: (data: { token: string; user: any }) => void): (() => void) => {
    const listener = (_: any, data: { token: string; user: any }): void => cb(data);
    ipcRenderer.on("ghostly:auth-token", listener);
    return () => ipcRenderer.removeListener("ghostly:auth-token", listener);
  },

  // Deep link callback (Google OAuth)
  onDeepLink: (cb: (url: string) => void): (() => void) => {
    const listener = (_: any, url: string): void => cb(url);
    ipcRenderer.on("ghostly:deep-link", listener);
    return () => ipcRenderer.removeListener("ghostly:deep-link", listener);
  },

  // Events from main process (hotkeys)
  onScreenshot: (cb: (b64: string) => void): (() => void) => {
    const listener = (_: any, b64: string): void => cb(b64);
    ipcRenderer.on("ghostly:screenshot", listener);
    return () => ipcRenderer.removeListener("ghostly:screenshot", listener);
  },

  onSolve: (cb: () => void): (() => void) => {
    const listener = (): void => cb();
    ipcRenderer.on("ghostly:solve", listener);
    return () => ipcRenderer.removeListener("ghostly:solve", listener);
  },

  onStartOver: (cb: () => void): (() => void) => {
    const listener = (): void => cb();
    ipcRenderer.on("ghostly:start-over", listener);
    return () => ipcRenderer.removeListener("ghostly:start-over", listener);
  },

  onNextQuestion: (cb: () => void): (() => void) => {
    const listener = (): void => cb();
    ipcRenderer.on("ghostly:next-question", listener);
    return () => ipcRenderer.removeListener("ghostly:next-question", listener);
  },

  onManualSend: (cb: () => void): (() => void) => {
    const listener = (): void => cb();
    ipcRenderer.on("ghostly:manual-send", listener);
    return () => ipcRenderer.removeListener("ghostly:manual-send", listener);
  },

  onPrevQuestion: (cb: () => void): (() => void) => {
    const listener = (): void => cb();
    ipcRenderer.on("ghostly:prev-question", listener);
    return () => ipcRenderer.removeListener("ghostly:prev-question", listener);
  },

  onNextQuestionPage: (cb: () => void): (() => void) => {
    const listener = (): void => cb();
    ipcRenderer.on("ghostly:next-question-page", listener);
    return () => ipcRenderer.removeListener("ghostly:next-question-page", listener);
  },

  // Auto updater
  onUpdateAvailable: (cb: (version: string) => void): (() => void) => {
    const listener = (_: any, version: string): void => cb(version);
    ipcRenderer.on("ghostly:update-available", listener);
    return () => ipcRenderer.removeListener("ghostly:update-available", listener);
  },
  onUpdateProgress: (cb: (percent: number) => void): (() => void) => {
    const listener = (_: any, percent: number): void => cb(percent);
    ipcRenderer.on("ghostly:update-progress", listener);
    return () => ipcRenderer.removeListener("ghostly:update-progress", listener);
  },
  onUpdateDownloaded: (cb: () => void): (() => void) => {
    const listener = (): void => cb();
    ipcRenderer.on("ghostly:update-downloaded", listener);
    return () => ipcRenderer.removeListener("ghostly:update-downloaded", listener);
  },
  onUpdateNotAvailable: (cb: () => void): (() => void) => {
    const listener = (): void => cb();
    ipcRenderer.on("ghostly:update-not-available", listener);
    return () => ipcRenderer.removeListener("ghostly:update-not-available", listener);
  },
  onUpdateError: (cb: (msg: string) => void): (() => void) => {
    const listener = (_: any, msg: string): void => cb(msg);
    ipcRenderer.on("ghostly:update-error", listener);
    return () => ipcRenderer.removeListener("ghostly:update-error", listener);
  },
  downloadUpdate: (): void => ipcRenderer.send("ghostly:download-update"),
  installUpdate: (): void => ipcRenderer.send("ghostly:install-update"),
  checkForUpdates: (): void => ipcRenderer.send("ghostly:check-update"),

  // NVIDIA API proxy
  nvidiaApiCall: (apiKey: string, body: any): Promise<{ ok: boolean; status: number; data: string }> =>
    ipcRenderer.invoke("nvidia-api-call", { apiKey, body }),
  nvidiaTestKey: (apiKey: string): Promise<{ ok: boolean; status: number; data: string }> =>
    ipcRenderer.invoke("nvidia-test-key", { apiKey }),

  // Anthropic API proxy
  anthropicApiCall: (apiKey: string, body: any): Promise<{ ok: boolean; status: number; data: string }> =>
    ipcRenderer.invoke("anthropic-api-call", { apiKey, body }),

  // Keyboard shortcuts
  getShortcuts: (): Promise<Record<string, string>> => ipcRenderer.invoke("ghostly:get-shortcuts"),
  updateShortcuts: (bindings: Record<string, string>): Promise<{ ok: boolean; failed: string[] }> =>
    ipcRenderer.invoke("ghostly:update-shortcuts", bindings),
  resetShortcuts: (): Promise<{ ok: boolean; failed: string[] }> =>
    ipcRenderer.invoke("ghostly:reset-shortcuts"),
});
