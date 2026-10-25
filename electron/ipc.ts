import { ipcMain, desktopCapturer, app, BrowserWindow, safeStorage, type IpcMainInvokeEvent, type IpcMainEvent } from "electron";
import { captureFullScreen } from "./capture";
import { updateHotkeys, DEFAULT_SHORTCUTS, type ShortcutBindings } from "./hotkeys";
import Store from "electron-store";
import https from "https";

const store = new Store({
  name: "ghostly-data",
  encryptionKey: "ghostly-secure-key-v1",
  defaults: {
    settings: {
      activeProvider: "gemini",
      // gemini-2.0-flash 404s ("no longer available") on current "AQ."-format Auth Keys.
      activeModel: "gemini-3.5-flash",
      interviewType: "dsa",
      language: "python",
      apiKeys: {
        gemini: "",
        openai: "",
        anthropic: "",
        groq: "",
      },
    },
    history: [],
    savedProfile: null,
    user: null,
    subscription: { plan: "free", status: "active", expires_at: null },
    ads: [],
    shortcuts: DEFAULT_SHORTCUTS,
  },
});

export function getStoredShortcuts(): ShortcutBindings {
  // Merge over defaults so a store saved before a new action existed still
  // gets that action's default binding instead of `undefined`.
  return { ...DEFAULT_SHORTCUTS, ...(store.get("shortcuts") as Partial<ShortcutBindings> | undefined) };
}

// Every handler is reachable from any frame the renderer creates: the support ad is a
// srcDoc iframe with this window's privileged preload, so it could read every API key.
const DEV_SERVER_URL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;

export function assertTrustedSender(event: IpcMainInvokeEvent | IpcMainEvent): void {
  const win = BrowserWindow.fromWebContents(event.sender);
  const frame = event.senderFrame;
  const url = frame?.url ?? "";
  const topLevel = !!win && !!frame && frame.parent === null && win.webContents.mainFrame === frame;
  const trusted =
    url.startsWith("file://") ||
    url.startsWith("app://") ||
    (!app.isPackaged && DEV_SERVER_URL.test(url));
  if (!topLevel || !trusted) {
    throw new Error(`Blocked IPC from untrusted frame: ${url || "<unknown>"}`);
  }
}

function handle(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: any[]) => any,
): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event);
    return listener(event, ...args);
  });
}

// The store's encryptionKey is a literal in this public source, so safeStorage (OS
// keychain) encrypts each secret in its own *Enc field; legacy plaintext is migrated on read.
const PROVIDER_KEYS = ["gemini", "groq", "openai", "anthropic", "grok", "openrouter", "nvidia", "ollama"];
// Provider key names are used as object keys below, so keep them boring — this
// also keeps `__proto__`/`constructor` out of anything we spread.
const SAFE_KEY_NAME = /^[a-z0-9_-]{1,32}$/;
const USER_FIELDS = ["userId", "email", "name", "picture"];
const PROFILE_FIELDS = [
  "fullName", "email", "phone", "location", "summary", "skills",
  "experience", "projects", "education", "certifications", "linkedin", "github",
];

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

const encField = (name: string): string => `${name}Enc`;

function decryptField(name: string): string {
  const blob = store.get(encField(name));
  if (typeof blob !== "string" || !blob) return "";
  try {
    return safeStorage.decryptString(Buffer.from(blob, "base64"));
  } catch {
    // Moved machine/account — ciphertext is unreadable, which is the point; treat as unset.
    return "";
  }
}

/** electron-store types delete() with keyof, but encrypted names are built at runtime. */
function deleteEncrypted(name: string): void {
  store.delete(encField(name) as Parameters<typeof store.delete>[0]);
}

/** Returns false when safeStorage is unavailable, so callers keep plaintext. */
function encryptField(name: string, value: string): boolean {
  if (!encryptionAvailable()) return false;
  if (!value) deleteEncrypted(name);
  else store.set(encField(name), safeStorage.encryptString(value).toString("base64"));
  return true;
}

function migratePlaintextSecrets(): void {
  if (!encryptionAvailable()) return;
  const settings: any = store.get("settings") || {};
  const keys: Record<string, any> =
    settings.apiKeys && typeof settings.apiKeys === "object" ? settings.apiKeys : {};
  let leaked = false;
  for (const [name, value] of Object.entries(keys)) {
    if (typeof value !== "string" || !value || !SAFE_KEY_NAME.test(name)) continue;
    leaked = true;
    if (store.get(encField(name)) === undefined) encryptField(name, value);
  }
  if (typeof settings.deepgramApiKey === "string" && settings.deepgramApiKey) {
    leaked = true;
    if (store.get(encField("deepgramApiKey")) === undefined) {
      encryptField("deepgramApiKey", settings.deepgramApiKey);
    }
  }
  const user: any = store.get("user") || null;
  let leakedUser = false;
  if (user && typeof user.idToken === "string" && user.idToken) {
    leakedUser = true;
    if (store.get(encField("idToken")) === undefined) encryptField("idToken", user.idToken);
  }
  if (leaked) {
    delete settings.apiKeys;
    delete settings.deepgramApiKey;
    store.set("settings", settings);
  }
  if (leakedUser) store.set("user", { ...user, idToken: "" });
}

function readSettings(): any {
  const settings: any = { ...((store.get("settings") as any) || {}) };
  const plainKeys: Record<string, any> =
    settings.apiKeys && typeof settings.apiKeys === "object" ? settings.apiKeys : {};
  const apiKeys: Record<string, string> = {};
  for (const name of new Set([...Object.keys(plainKeys), ...PROVIDER_KEYS])) {
    if (!SAFE_KEY_NAME.test(name)) continue;
    apiKeys[name] = decryptField(name) || (typeof plainKeys[name] === "string" ? plainKeys[name].slice(0, 1024) : "");
  }
  settings.apiKeys = apiKeys;
  settings.deepgramApiKey = decryptField("deepgramApiKey") ||
    (typeof settings.deepgramApiKey === "string" ? settings.deepgramApiKey.slice(0, 1024) : "");
  return settings;
}

function writeSettings(patch: any): void {
  // Pick-merge, never a whole-object overwrite: a partial save (or a hostile
  // frame) must not be able to drop keys this build doesn't know about.
  const settings: any = { ...((store.get("settings") as any) || {}) };
  const strings: Array<[string, number]> = [
    ["activeProvider", 64], ["activeModel", 128], ["interviewType", 64], ["language", 64],
    ["deepgramLanguage", 32], ["customInstructions", 20000], ["micDeviceId", 128],
    ["transcriptionEngine", 32],
  ];
  for (const [key, max] of strings) {
    if (typeof patch[key] === "string") settings[key] = patch[key].slice(0, max);
  }
  for (const flag of ["autoSwitchProvider", "autoAI", "autoScroll"]) {
    if (typeof patch[flag] === "boolean") settings[flag] = patch[flag];
  }
  if (typeof patch.opacity === "number" && Number.isFinite(patch.opacity)) {
    settings.opacity = Math.min(1, Math.max(0.1, patch.opacity));
  }
  if (Array.isArray(patch.disabledProviders)) {
    settings.disabledProviders = patch.disabledProviders
      .filter((p: any) => typeof p === "string")
      .slice(0, 32)
      .map((p: string) => p.slice(0, 64));
  }

  const apiKeys: Record<string, string> =
    settings.apiKeys && typeof settings.apiKeys === "object" ? { ...settings.apiKeys } : {};
  let encrypted = false;
  if (patch.apiKeys && typeof patch.apiKeys === "object" && !Array.isArray(patch.apiKeys)) {
    for (const [name, value] of Object.entries(patch.apiKeys)) {
      if (!SAFE_KEY_NAME.test(name) || typeof value !== "string") continue;
      apiKeys[name] = value.slice(0, 1024);
      if (encryptField(name, apiKeys[name])) encrypted = true;
    }
  }
  let deepgramApiKey = typeof settings.deepgramApiKey === "string" ? settings.deepgramApiKey : "";
  if (typeof patch.deepgramApiKey === "string") {
    deepgramApiKey = patch.deepgramApiKey.slice(0, 1024);
    if (encryptField("deepgramApiKey", deepgramApiKey)) encrypted = true;
  }
  if (encrypted) {
    delete settings.apiKeys;
    delete settings.deepgramApiKey;
  } else {
    settings.apiKeys = apiKeys;
    settings.deepgramApiKey = deepgramApiKey;
  }
  store.set("settings", settings);
}

function readUser(): any {
  const user: any = store.get("user") || null;
  if (!user || typeof user !== "object") return null;
  const idToken = decryptField("idToken") || (typeof user.idToken === "string" ? user.idToken : "");
  return { ...user, idToken };
}

export function registerIpcHandlers(clearPendingAuthToken: () => void = () => {}): void {
  migratePlaintextSecrets();
  // User / Auth
  handle("get-user", () => readUser());
  handle("save-user", (_event, user: any) => {
    if (!user || typeof user !== "object" || Array.isArray(user)) return;
    const clean: Record<string, string> = {};
    for (const field of USER_FIELDS) {
      if (typeof user[field] === "string") clean[field] = user[field].slice(0, 1024);
    }
    if (typeof user.idToken === "string") {
      const idToken = user.idToken.slice(0, 8192);
      if (encryptField("idToken", idToken)) delete clean.idToken;
      else clean.idToken = idToken;
    }
    store.set("user", clean);
  });
  handle("logout-user", () => {
    store.set("user", null);
    store.set("ads", []);
    deleteEncrypted("idToken");
    // A token buffered by main.ts's local auth server survives logout and would sign
    // the user straight back in on mount.
    clearPendingAuthToken();
  });

  // Ads
  handle("get-ads", () => store.get("ads") || []);
  handle("save-ads", (_event, ads: any[]) => { store.set("ads", ads); });

  // Desktop sources for system audio capture
  handle("ghostly:get-desktop-sources", async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        fetchWindowIcons: false,
      });
      // Return all screen sources — renderer picks the first one for audio loopback
      return sources.map((s) => ({ id: s.id, name: s.name }));
    } catch (error) {
      console.error("Failed to get desktop sources:", error);
      throw error;
    }
  });

  // Full-screen capture — captured on the display this window is on, not
  // whichever one the cursor happens to be over.
  handle("ghostly:capture-fullscreen", async (event) => {
    try {
      return await captureFullScreen(BrowserWindow.fromWebContents(event.sender));
    } catch (error) {
      console.error("Failed to capture fullscreen:", error);
      throw error;
    }
  });

  // Legacy capture handlers (kept for compatibility)
  handle("capture-screen", async (event) => {
    try {
      return await captureFullScreen(BrowserWindow.fromWebContents(event.sender));
    } catch (error) {
      console.error("Failed to capture screen:", error);
      throw error;
    }
  });

  // Keyboard shortcuts
  handle("ghostly:get-shortcuts", () => getStoredShortcuts());

  handle("ghostly:update-shortcuts", (_event, bindings: ShortcutBindings) => {
    if (!bindings || typeof bindings !== "object") return { ok: false, failed: [] };
    const merged = { ...DEFAULT_SHORTCUTS, ...bindings };
    const result = updateHotkeys(merged);
    if (result.ok) store.set("shortcuts", merged);
    return result;
  });

  handle("ghostly:reset-shortcuts", () => {
    const result = updateHotkeys(DEFAULT_SHORTCUTS);
    store.set("shortcuts", DEFAULT_SHORTCUTS);
    return result;
  });

  // Model IDs Google pulled for the "AQ."-format Auth Keys: they 404 on every call and
  // look like "Invalid API key", so migrate a stored one forward on read.
  const DEAD_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"];
  // Groq shuts these two down 08/16/26 (console.groq.com/docs/deprecations).
  const DEAD_GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
  handle("get-settings", () => {
    const settings = readSettings();
    if (settings?.activeProvider === "gemini" && DEAD_GEMINI_MODELS.includes(settings.activeModel)) {
      settings.activeModel = "gemini-3.5-flash";
      writeSettings({ activeModel: settings.activeModel });
    }
    if (settings?.activeProvider === "groq" && DEAD_GROQ_MODELS.includes(settings.activeModel)) {
      settings.activeModel = "openai/gpt-oss-120b";
      writeSettings({ activeModel: settings.activeModel });
    }
    return settings;
  });

  handle("save-settings", (_event, settings: any) => {
    if (settings && typeof settings === "object" && !Array.isArray(settings)) {
      writeSettings(settings);
    }
  });

  // History
  handle("get-history", () => {
    return store.get("history") || [];
  });

  handle("save-history", (_event, history: any[]) => {
    // Cap at 30 items to keep the store JSON lightweight.
    if (Array.isArray(history)) {
      store.set("history", history.slice(0, 30));
    }
  });

  // Saved Profile
  handle("get-saved-profile", () => {
    return store.get("savedProfile") || null;
  });

  handle("save-profile", (_event, profile: any) => {
    if (profile === null) {
      store.set("savedProfile", null);
      return;
    }
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) return;
    // Pick-merge + length caps: never persist an arbitrary blob from the frame.
    const clean: Record<string, string> = {};
    for (const field of PROFILE_FIELDS) {
      if (typeof profile[field] === "string") clean[field] = profile[field].slice(0, 20000);
    }
    store.set("savedProfile", clean);
  });

  // NVIDIA API proxy - bypass CORS
  handle("nvidia-api-call", async (_event, { apiKey, body }: { apiKey: string; body: any }) => {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body);
      const options = {
        hostname: "integrate.api.nvidia.com",
        port: 443,
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "Content-Length": Buffer.byteLength(postData),
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, status: res.statusCode, data });
          } else {
            resolve({ ok: false, status: res.statusCode, data });
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });
      // Without this, a connection that opens but never responds (dead network,
      // packet-dropping proxy) hangs the renderer's await forever.
      req.setTimeout(30000, () => req.destroy(new Error("NVIDIA request timed out after 30s")));

      req.write(postData);
      req.end();
    });
  });

  // NVIDIA key test — cheap GET, no completion tokens spent, same CORS bypass as above
  handle("nvidia-test-key", async (_event, { apiKey }: { apiKey: string }) => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "integrate.api.nvidia.com",
        port: 443,
        path: "/v1/models",
        method: "GET",
        headers: { "Authorization": `Bearer ${apiKey}` },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, status: res.statusCode, data });
          } else {
            resolve({ ok: false, status: res.statusCode, data });
          }
        });
      });

      req.on("error", (error) => reject(error));
      req.setTimeout(15000, () => req.destroy(new Error("NVIDIA key test timed out after 15s")));
      req.end();
    });
  });

  // Anthropic API proxy - bypass CORS
  handle("anthropic-api-call", async (_event, { apiKey, body }: { apiKey: string; body: any }) => {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body);
      const options = {
        hostname: "api.anthropic.com",
        port: 443,
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Length": Buffer.byteLength(postData),
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, status: res.statusCode, data });
          } else {
            resolve({ ok: false, status: res.statusCode, data });
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });
      req.setTimeout(30000, () => req.destroy(new Error("Anthropic request timed out after 30s")));

      req.write(postData);
      req.end();
    });
  });
}
