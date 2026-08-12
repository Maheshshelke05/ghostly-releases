import { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, desktopCapturer, shell, protocol } from "electron";
import path from "path";
import http from "http";
import { autoUpdater } from "electron-updater";
import { registerHotkeys, unregisterHotkeys } from "./hotkeys";
import { registerIpcHandlers } from "./ipc";
import { applyStealthMode, removeStealthMode, safeguardVisibility } from "./stealth";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let authServer: http.Server | null = null;

// Populated by warmScreenSource() well before the user ever enables audio, so the
// live setDisplayMediaRequestHandler below almost always hits the cache instead of
// running the remove-stealth -> enumerate -> reapply-after-800ms dance while the
// user may already be mid screen-share (that live dance was the "overlay briefly
// visible in Google Meet" leak). Kept at module scope so both the pre-warm call and
// the request handler share the same cache.
let cachedScreenSource: Electron.DesktopCapturerSource | null = null;
let screenSourceWarmupPromise: Promise<void> | null = null;

function warmScreenSource(): Promise<void> {
  if (cachedScreenSource) return Promise.resolve();
  if (screenSourceWarmupPromise) return screenSourceWarmupPromise;

  // desktopCapturer.getSources() runs a Windows desktop-duplication capture session.
  // If our own window is WDA_EXCLUDEFROMCAPTURE at that exact moment, Windows' DWM
  // can stop compositing that window to the real screen too (not just to capture
  // streams) — the whole app, TopBar included, goes invisible on the user's own
  // monitor. Drop the exclusion for the duration of the enumeration, then restore
  // it once the capture session has actually torn down.
  if (mainWindow) removeStealthMode(mainWindow);
  screenSourceWarmupPromise = desktopCapturer
    .getSources({ types: ["screen"] })
    .then((sources) => {
      cachedScreenSource = sources[0] ?? null;
    })
    .catch(() => {
      cachedScreenSource = null;
    })
    .finally(() => {
      // Reapplying immediately can retrigger the same glitch — give the capture
      // session's teardown a moment to finish first.
      setTimeout(() => { if (mainWindow) applyStealthMode(mainWindow); }, 800);
      screenSourceWarmupPromise = null;
    });
  return screenSourceWarmupPromise;
}

function startAuthServer() {
  authServer = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }
    if (req.method === "POST" && req.url === "/auth") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { token, user } = JSON.parse(body);
          mainWindow?.webContents.send("ghostly:auth-token", { token, user });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400); res.end("Bad Request");
        }
      });
    } else {
      res.writeHead(404); res.end();
    }
  });
  authServer.listen(7842, "127.0.0.1");
}

function handleDeepLink(url: string) {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  mainWindow.webContents.send("ghostly:deep-link", url);
}

function enforceStealthOnWindow(win: BrowserWindow): void {
  if (!app.isPackaged) return;
  win.on("show", () => { applyStealthMode(win); safeguardVisibility(win); });
  win.on("focus", () => { applyStealthMode(win); safeguardVisibility(win); });
  win.on("restore", () => { applyStealthMode(win); safeguardVisibility(win); });
}

function createMainWindow(): BrowserWindow {
  const primary = screen.getPrimaryDisplay().workAreaSize;

  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 700,
    height: 600,
    minWidth: 400,
    minHeight: 300,
    x: Math.floor((primary.width - 700) / 2),
    y: 80,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setIgnoreMouseEvents(false);

  enforceStealthOnWindow(win);

  // Surface renderer failures to the terminal instead of leaving a silently blank
  // window — a transparent frameless window that fails to paint looks identical to
  // one that's simply "not visible", with no way to tell the difference otherwise.
  win.webContents.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL) => {
    console.error(
      `[Ghostly] ❌ Renderer failed to load (${errorCode} ${errorDescription}): ${validatedURL}`,
    );
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("[Ghostly] ❌ Renderer process gone:", JSON.stringify(details));
  });
  win.webContents.on("unresponsive", () => {
    console.error("[Ghostly] ❌ Renderer became unresponsive");
  });
  win.webContents.on("preload-error", (_e, preloadPath, error) => {
    console.error(`[Ghostly] ❌ Preload script error in ${preloadPath}:`, error);
  });
  if (!app.isPackaged) {
    win.webContents.on("console-message", (_e, level, message, line, sourceId) => {
      if (level >= 2) {
        // warning(2) / error(3) only — keep the terminal readable
        console.log(`[Renderer ${level === 3 ? "ERROR" : "WARN"}] ${message} (${sourceId}:${line})`);
      }
    });
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  win.once("ready-to-show", () => {
    win.setOpacity(1);
    win.show();
    win.focus();
    win.setAlwaysOnTop(true, "screen-saver");
    if (app.isPackaged) applyStealthMode(win);
  });

  return win;
}

function toggleWindowVisibility() {
  if (!mainWindow) return;
  const isCurrentlyHidden = mainWindow.getOpacity() === 0 || !mainWindow.isVisible();
  if (isCurrentlyHidden) {
    mainWindow.setOpacity(1);
    mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.setAlwaysOnTop(true, "screen-saver");
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.focus();
    mainWindow.webContents.send("ghostly:show");
    // The 0 -> 1 opacity jump can leave Windows' DWM holding a stale (blank)
    // composited frame for this window — same class of bug as the stealth-mode
    // repaint glitch, just triggered by the ordinary hide/show toggle instead of
    // SetWindowDisplayAffinity. Nudge it so it can never come back up blank.
    safeguardVisibility(mainWindow);
  } else {
    mainWindow.setOpacity(0);
    mainWindow.blur();
  }
}

function createTray(): Tray {
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAY0lEQVR4nGNgGAXDBTAiC/z//5/h////DIyMjAxMTEwMYPr/fwYGBgYGBkZGRgYmRiADyIYJMDExAeUYGRmgcowgGsgGqWFkZASpYWJiAqthBOrBAKgaGA3igzCQP7xdMwoAAD6OI0GqswYnAAAAAElFTkSuQmCC",
  );
  const t = new Tray(icon);
  t.setToolTip("Ghostly — Stealth AI Assistant");
  t.setContextMenu(Menu.buildFromTemplate([
    { label: "Show/Hide Ghostly", click: toggleWindowVisibility },
    { label: "Capture Screen", click: () => mainWindow?.webContents.send("ghostly:screenshot") },
    { type: "separator" },
    { label: "Quit Ghostly", click: () => app.quit() },
  ]));
  t.on("click", toggleWindowVisibility);
  return t;
}

// ── Single instance lock — MUST be before app.whenReady ──────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    const url = commandLine.find((arg) => arg.startsWith("ghostly://"));
    if (url) handleDeepLink(url);
    else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // ── App ready ───────────────────────────────────────────────────────────────
  app.whenReady().then(() => {
    // Register deep link protocol
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("ghostly", process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient("ghostly");
    }

    // Serve static files (images) from renderer folder in production
    protocol.registerFileProtocol("app", (request, callback) => {
      const url = request.url.replace("app://", "");
      const filePath = app.isPackaged
        ? path.join(process.resourcesPath, "app.asar", "out", "renderer", url)
        : path.join(__dirname, "../../out/renderer", url);
      callback({ path: filePath });
    });

    startAuthServer();
    registerIpcHandlers();
    mainWindow = createMainWindow();
    tray = createTray();
    registerHotkeys(mainWindow);

    // Permissions
    mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => {
      cb(["media", "microphone", "camera", "audioCapture", "desktopCapture", "display-capture"].includes(permission));
    });
    mainWindow.webContents.session.setPermissionCheckHandler((_wc, permission) =>
      ["media", "microphone", "camera", "audioCapture", "desktopCapture", "display-capture"].includes(permission)
    );
    // useInterviewAudio's startInterview() calls getDisplayMedia() fresh every time the
    // user (re)enables audio — including mid-interview, after disabling and re-enabling
    // while already screen-sharing in Zoom/Meet/Teams. warmScreenSource() is kicked off
    // proactively (see setTimeout below) well before this normally fires, so this is
    // almost always just a cache read — no live remove-stealth/enumerate/reapply dance
    // in the middle of an active screen share, which is exactly the "window briefly
    // visible in Google Meet" bug users reported. The video track is stopped
    // immediately after this resolves anyway (only the loopback audio is used), so the
    // resolved screen source is safe to cache and reuse for the rest of the app session.
    mainWindow.webContents.session.setDisplayMediaRequestHandler((_req, cb) => {
      warmScreenSource().then(() => {
        // audio: "loopback" — captures ALL system audio including Zoom, Meet, Teams
        // This is the key flag that makes cross-app audio capture work on Windows
        cb(cachedScreenSource ? { video: cachedScreenSource, audio: "loopback" } : {});
      });
    }, { useSystemPicker: false });

    // Pre-warm the screen source now, while the user is very unlikely to already be
    // mid screen-share (app just launched) — by the time they actually join a call and
    // enable audio, the handler above should already have a cache hit. The delay lets
    // the window finish its initial show + first applyStealthMode() from
    // "ready-to-show" so the two stealth toggles don't race each other.
    setTimeout(() => warmScreenSource(), 2000);

    // IPC handlers
    ipcMain.on("ghostly:open-external", (_event, url: string) => {
      try {
        const parsed = new URL(url);
        if (["https:", "http:", "mailto:"].includes(parsed.protocol)) {
          shell.openExternal(url);
        }
      } catch { /* invalid URL — ignore */ }
    });
    ipcMain.on("ghostly:enable-mouse", () => mainWindow?.setIgnoreMouseEvents(false));
    ipcMain.on("ghostly:disable-mouse", () => mainWindow?.setIgnoreMouseEvents(false));
    ipcMain.on("ghostly:set-opacity", (_event, value: number) => {
      if (mainWindow) mainWindow.setOpacity(Math.min(1, Math.max(0.1, value)));
    });
    ipcMain.on("ghostly:hide", () => {
      if (mainWindow) { mainWindow.setOpacity(0); mainWindow.blur(); mainWindow.setIgnoreMouseEvents(true, { forward: false }); }
    });
    ipcMain.on("ghostly:show", () => {
      if (mainWindow) {
        mainWindow.setOpacity(1);
        mainWindow.show();
        mainWindow.setAlwaysOnTop(true, "screen-saver");
        mainWindow.setIgnoreMouseEvents(false);
        mainWindow.focus();
        safeguardVisibility(mainWindow);
        setTimeout(() => {
          if (mainWindow) {
            mainWindow.setAlwaysOnTop(true, "screen-saver");
            mainWindow.setIgnoreMouseEvents(false);
          }
        }, 150);
      }
    });
    ipcMain.on("ghostly:quit", () => app.quit());
    ipcMain.on("ghostly:get-version", (event) => { event.returnValue = app.getVersion(); });
    ipcMain.on("ghostly:move", (_event, dx: number, dy: number) => {
      if (mainWindow) {
        const [x, y] = mainWindow.getPosition();
        mainWindow.setPosition(x + dx, y + dy);
      }
    });

    // ── Auto Updater ────────────────────────────────────────────────────────
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = require("electron-log");
    (autoUpdater.logger as any).transports.file.level = "info";

    autoUpdater.on("checking-for-update", () => {
      console.log("[Updater] Checking for update...");
      mainWindow?.webContents.send("ghostly:update-checking");
    });
    autoUpdater.on("update-available", (info) => {
      const safeVersion = String(info.version).replace(/[^\w.-]/g, "");
      console.log("[Updater] Update available:", safeVersion);
      mainWindow?.webContents.send("ghostly:update-available", safeVersion);
    });
    autoUpdater.on("update-not-available", (info) => {
      const safeVersion = String(info.version).replace(/[^\w.-]/g, "");
      console.log("[Updater] No update available. Current:", safeVersion);
      mainWindow?.webContents.send("ghostly:update-not-available");
    });
    autoUpdater.on("download-progress", (progress) => {
      mainWindow?.webContents.send("ghostly:update-progress", Math.round(progress.percent));
    });
    autoUpdater.on("update-downloaded", () => {
      console.log("[Updater] Update downloaded!");
      mainWindow?.webContents.send("ghostly:update-downloaded");
    });
    autoUpdater.on("error", (err) => {
      const safeMsg = String(err.message).replace(/[\r\n]/g, " ").slice(0, 200);
      console.error("[Updater] Error:", safeMsg);
      mainWindow?.webContents.send("ghostly:update-error", safeMsg);
    });

    ipcMain.on("ghostly:download-update", () => autoUpdater.downloadUpdate());
    ipcMain.on("ghostly:install-update", () => autoUpdater.quitAndInstall());
    ipcMain.on("ghostly:check-update", () => {
      if (app.isPackaged) {
        autoUpdater.checkForUpdates();
      } else {
        mainWindow?.webContents.send("ghostly:update-error", "Auto-update only works in packaged app.");
      }
    });

    // Check for updates 3 seconds after app ready
    if (app.isPackaged) {
      setTimeout(() => autoUpdater.checkForUpdates(), 3000);
    }
  });

  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  app.on("before-quit", () => { unregisterHotkeys(); authServer?.close(); });
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow(); });

  // macOS deep link
  app.on("open-url", (event, url) => {
    event.preventDefault();
    if (url.startsWith("ghostly://")) handleDeepLink(url);
  });
}
