import { ipcMain, desktopCapturer } from "electron";
import { captureFullScreen } from "./capture";
import Store from "electron-store";
import https from "https";
import http from "http";

const store = new Store({
  name: "ghostly-data",
  encryptionKey: "ghostly-secure-key-v1",
  defaults: {
    settings: {
      activeProvider: "gemini",
      activeModel: "gemini-2.0-flash",
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
  },
});

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

  // Settings
  ipcMain.handle("get-settings", () => {
    return store.get("settings");
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
    // Fix: validate history is an array
    if (Array.isArray(history)) {
      store.set("history", history);
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
