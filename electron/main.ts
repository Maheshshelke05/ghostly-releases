import { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, desktopCapturer, shell, protocol } from "electron";
import path from "path";
import http from "http";
import { autoUpdater } from "electron-updater";
import { registerHotkeys, unregisterHotkeys } from "./hotkeys";
import { registerIpcHandlers } from "./ipc";
import { applyStealthMode } from "./stealth";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let authServer: http.Server | null = null;

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
  win.on("show", () => applyStealthMode(win));
  win.on("focus", () => applyStealthMode(win));
  win.on("restore", () => applyStealthMode(win));
}

function createMainWindow(): BrowserWindow {
  const primary = screen.getPrimaryDisplay().workAreaSize;

  const isDev = !app.isPackaged;
  const win = new BrowserWindow({
    width: 700,
    height: 600,
    minWidth: 400,
    minHeight: 300,
    x: Math.floor((primary.width - 700) / 2),
    y: isDev ? 100 : 0,
    transparent: !isDev,
    frame: isDev,
    alwaysOnTop: !isDev,
    skipTaskbar: false,
    hasShadow: isDev,
    resizable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (!isDev) {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, "screen-saver");
  }
  win.setIgnoreMouseEvents(false);

  enforceStealthOnWindow(win);

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  win.once("ready-to-show", () => {
    win.setOpacity(1);
    win.show();
    win.focus();
    if (app.isPackaged) applyStealthMode(win);
  });

  return win;
}

function toggleWindowVisibility() {
  if (!mainWindow) return;
  if (mainWindow.getOpacity() === 0) {
    mainWindow.setOpacity(1);
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.focus();
  } else {
    mainWindow.setOpacity(0);
    mainWindow.blur();
    mainWindow.setIgnoreMouseEvents(true, { forward: false });
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
    mainWindow.webContents.session.setDisplayMediaRequestHandler((_req, cb) => {
      desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
        // audio: "loopback" — captures ALL system audio including Zoom, Meet, Teams
        // This is the key flag that makes cross-app audio capture work on Windows
        cb(sources[0] ? { video: sources[0], audio: "loopback" } : { video: sources[0] });
      }).catch(() => cb({}));
    }, { useSystemPicker: false });

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
    ipcMain.on("ghostly:disable-mouse", () => mainWindow?.setIgnoreMouseEvents(true, { forward: true }));
    ipcMain.on("ghostly:set-opacity", (_event, value: number) => {
      if (mainWindow) mainWindow.setOpacity(Math.min(1, Math.max(0.1, value)));
    });
    ipcMain.on("ghostly:hide", () => {
      if (mainWindow) { mainWindow.setOpacity(0); mainWindow.blur(); mainWindow.setIgnoreMouseEvents(true, { forward: false }); }
    });
    ipcMain.on("ghostly:show", () => {
      if (mainWindow) {
        mainWindow.setOpacity(1);
        mainWindow.setIgnoreMouseEvents(false);
        mainWindow.focus();
        // Re-apply after short delay to override any pending interview-mode disable
        setTimeout(() => mainWindow?.setIgnoreMouseEvents(false), 150);
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
