import { ipcMain, desktopCapturer } from "electron";
import { captureFullScreen } from "./capture";
import { updateHotkeys, DEFAULT_SHORTCUTS, type ShortcutBindings } from "./hotkeys";
import Store from "electron-store";
import https from "https";
import http from "http";

const store = new Store({
  name: "ghostly-data",
  encryptionKey: "ghostly-secure-key-v1",
  defaults: {
    settings: {
      activeProvider: "gemini",
      // gemini-2.0-flash 404s ("no longer available") on current "AQ."-
      // format Auth Keys — this was the default for every brand-new user.
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

export function registerIpcHandlers(): void {
  // User / Auth
  ipcMain.handle("get-user", () => store.get("user") || null);
  ipcMain.handle("save-user", (_event, user: any) => { store.set("user", user); });
  ipcMain.handle("logout-user", () => {
    store.set("user", null);
    store.set("ads", []);
  });

  // Ads
  ipcMain.handle("get-ads", () => store.get("ads") || []);
  ipcMain.handle("save-ads", (_event, ads: any[]) => { store.set("ads", ads); });

  // Desktop sources for system audio capture
  ipcMain.handle("ghostly:get-desktop-sources", async () => {
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

  // Full-screen capture
  ipcMain.handle("ghostly:capture-fullscreen", async () => {
    try {
      return await captureFullScreen();
    } catch (error) {
      console.error("Failed to capture fullscreen:", error);
      throw error;
    }
  });

  // Legacy capture handlers (kept for compatibility)
  ipcMain.handle("capture-screen", async () => {
    try {
      return await captureFullScreen();
    } catch (error) {
      console.error("Failed to capture screen:", error);
      throw error;
    }
  });

  // Keyboard shortcuts
  ipcMain.handle("ghostly:get-shortcuts", () => getStoredShortcuts());

  ipcMain.handle("ghostly:update-shortcuts", (_event, bindings: ShortcutBindings) => {
    if (!bindings || typeof bindings !== "object") return { ok: false, failed: [] };
    const merged = { ...DEFAULT_SHORTCUTS, ...bindings };
    const result = updateHotkeys(merged);
    if (result.ok) store.set("shortcuts", merged);
    return result;
  });

  ipcMain.handle("ghostly:reset-shortcuts", () => {
    const result = updateHotkeys(DEFAULT_SHORTCUTS);
    store.set("shortcuts", DEFAULT_SHORTCUTS);
    return result;
  });

  // Settings
  // Model IDs Google has since pulled for the "AQ."-format Auth Keys it now
  // issues by default — 404s on every call, looked exactly like "Invalid API
  // key" to users. New installs get the fixed default (see above), but
  // existing users already have one of these saved in their store, which the
  // `defaults` block above only applies when no value exists at all — so
  // migrate it forward here instead.
  const DEAD_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"];
  // Groq shuts these two down 08/16/26 (console.groq.com/docs/deprecations).
  const DEAD_GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
  ipcMain.handle("get-settings", () => {
    const settings = store.get("settings") as any;
    if (settings?.activeProvider === "gemini" && DEAD_GEMINI_MODELS.includes(settings.activeModel)) {
      settings.activeModel = "gemini-3.5-flash";
      store.set("settings", settings);
    }
    if (settings?.activeProvider === "groq" && DEAD_GROQ_MODELS.includes(settings.activeModel)) {
      settings.activeModel = "openai/gpt-oss-120b";
      store.set("settings", settings);
    }
    return settings;
  });

  ipcMain.handle("save-settings", (_event, settings: any) => {
    // Fix #7: validate settings is a plain object before saving
    if (settings && typeof settings === "object" && !Array.isArray(settings)) {
      store.set("settings", settings);
    }
  });

  // History
  ipcMain.handle("get-history", () => {
    return store.get("history") || [];
  });

  ipcMain.handle("save-history", (_event, history: any[]) => {
    // Fix: validate history is an array and cap at 30 items to keep store JSON lightweight
    if (Array.isArray(history)) {
      store.set("history", history.slice(0, 30));
    }
  });

  // Saved Profile
  ipcMain.handle("get-saved-profile", () => {
    return store.get("savedProfile") || null;
  });

  ipcMain.handle("save-profile", (_event, profile: any) => {
    // Fix: validate profile is object or null
    if (profile === null || (profile && typeof profile === "object" && !Array.isArray(profile))) {
      store.set("savedProfile", profile);
    }
  });

  // NVIDIA API proxy - bypass CORS
  ipcMain.handle("nvidia-api-call", async (_event, { apiKey, body }: { apiKey: string; body: any }) => {
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

      req.write(postData);
      req.end();
    });
  });

  // NVIDIA key test — cheap GET, no completion tokens spent, same CORS bypass as above
  ipcMain.handle("nvidia-test-key", async (_event, { apiKey }: { apiKey: string }) => {
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
      req.end();
    });
  });

  // Anthropic API proxy - bypass CORS
  ipcMain.handle("anthropic-api-call", async (_event, { apiKey, body }: { apiKey: string; body: any }) => {
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

      req.write(postData);
      req.end();
    });
  });
}
