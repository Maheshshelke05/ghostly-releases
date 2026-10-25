import { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, desktopCapturer, shell, protocol, dialog, powerMonitor, net } from "electron";
import { TRAY_ICON_16, TRAY_ICON_32 } from "./trayIcon";
import path from "path";
import http from "http";
import { randomBytes } from "crypto";
import { pathToFileURL } from "url";
import { autoUpdater } from "electron-updater";
import log from "electron-log";
import { registerHotkeys, unregisterHotkeys, type ShortcutAction } from "./hotkeys";
import { registerIpcHandlers, getStoredShortcuts, assertTrustedSender } from "./ipc";
import { applyStealthMode, removeStealthMode, safeguardVisibility } from "./stealth";
import { captureFullScreen } from "./capture";

// Last-resort backstop: an unhandled error in the main process is fatal by default.
// Routed through electron-log because a packaged Windows launch has no console.
process.on("uncaughtException", (err) => {
  log.error("[Ghostly] Uncaught exception (recovered):", err);
});
process.on("unhandledRejection", (reason) => {
  log.error("[Ghostly] Unhandled rejection (recovered):", reason);
});

// Reachable from any frame: the support ad is a same-origin srcDoc iframe with this
// preload bridge, so it could invoke ghostly:get-pending-auth-token or ghostly:quit.
function trustedHandle(
  channel: string,
  listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any,
): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event);
    return listener(event, ...args);
  });
}

function trustedOn(
  channel: string,
  listener: (event: Electron.IpcMainEvent, ...args: any[]) => void,
): void {
  ipcMain.on(channel, (event, ...args) => {
    try {
      assertTrustedSender(event);
    } catch {
      // Untrusted frame (the ad) — drop it; nothing to reply with on a fire-and-forget channel.
      return;
    }
    listener(event, ...args);
  });
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let authServer: http.Server | null = null;

// The OAuth callback lands in a system-browser tab, and webContents.send() is
// fire-and-forget — buffer it in case the renderer hasn't mounted onAuthToken() yet.
let pendingAuthToken: { token: string; user: any } | null = null;

// Same mount race as pendingAuthToken: registerHotkeys() runs before the renderer
// has a listener, so a live send here can be lost.
let pendingHotkeyConflict: ShortcutAction[] | null = null;

// EADDRINUSE/EACCES on port 7842 is an unhandled 'error' event that kills the process
// and leaves login dead, so surface it; buffered for the same mount race as above.
let pendingAuthServerError: string | null = null;

// Pre-warmed by warmScreenSource() so the display-media handler hits the cache instead
// of running the remove-stealth -> enumerate -> reapply dance mid screen-share.
let cachedScreenSource: Electron.DesktopCapturerSource | null = null;
let screenSourceWarmupPromise: Promise<void> | null = null;
// Distinguishes "never attempted" from "attempted, came back empty" — without it every
// later getDisplayMedia() would re-run the risky stealth dance on a zero-source result.
let screenSourceWarmupAttempted = false;

// A cached source pins one display at one moment; docking, unplugging a monitor,
// scaling changes or lock/unlock invalidate its id and kill system audio.
function invalidateScreenSource(): void {
  cachedScreenSource = null;
  screenSourceWarmupPromise = null;
  screenSourceWarmupAttempted = false;
}

function warmScreenSource(): Promise<void> {
  if (cachedScreenSource) return Promise.resolve();
  if (screenSourceWarmupPromise) return screenSourceWarmupPromise;

  if (screenSourceWarmupAttempted) {
    // Already tried the stealth dance and it came back empty — retry the enumeration
    // without touching stealth rather than risking a live capture window mid share.
    desktopCapturer.getSources({ types: ["screen"] })
      .then((sources) => { if (sources[0]) cachedScreenSource = sources[0]; })
      .catch(() => {});
    return Promise.resolve();
  }

  // getSources() runs a Windows duplication session; with our window WDA_EXCLUDEFROMCAPTURE
  // DWM can stop compositing it to the real screen, so drop the exclusion and restore after.
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
      screenSourceWarmupAttempted = true;
      // Reapplying immediately can retrigger the same glitch — give the capture
      // session's teardown a moment to finish first.
      setTimeout(() => { if (mainWindow) applyStealthMode(mainWindow); }, 800);
      screenSourceWarmupPromise = null;
    });
  return screenSourceWarmupPromise;
}

// CORS answers only the product's own site, the body is capped, a second login can't
// race an unconsumed token, and a sent state nonce must match (see authStateNonce).
const ALLOWED_AUTH_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*ghotlyai\.in$/;
const AUTH_BODY_LIMIT = 64 * 1024;
const AUTH_LOGIN_URL = /^https:\/\/(www\.)?ghotlyai\.in\/electron-login/;
// Fresh per login URL open, appended as ?state=. A POST without one is still accepted
// (the website doesn't echo it yet); any POST that sends one must match and burns it.
let authStateNonce: string | null = null;

function handleAuthRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  const cors: Record<string, string> = ALLOWED_AUTH_ORIGIN.test(origin)
    ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
    : {};

  if (req.method === "OPTIONS") {
    if (Object.keys(cors).length === 0) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.writeHead(204, {
      ...cors,
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
    });
    res.end();
    return;
  }

  // CORS only hides the response, not the request: a simple cross-origin POST skips
  // preflight and would still set pendingAuthToken, so reject foreign Origins.
  if (origin && !ALLOWED_AUTH_ORIGIN.test(origin)) {
    res.writeHead(403);
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/auth") {
    res.writeHead(404, cors);
    res.end();
    return;
  }

  // A second POST while one is pending is a retry race or an attempt to overwrite it.
  if (pendingAuthToken) {
    res.writeHead(409, cors);
    res.end();
    return;
  }

  let body = "";
  let tooLarge = false;
  req.on("data", (chunk: Buffer) => {
    if (tooLarge) return;
    body += chunk;
    if (body.length > AUTH_BODY_LIMIT) {
      tooLarge = true;
      res.writeHead(413, cors);
      res.end();
      req.destroy();
    }
  });
  req.on("end", () => {
    if (tooLarge) return;
    try {
      const { token, user, state } = JSON.parse(body);
      if (typeof token !== "string" || !token) {
        res.writeHead(400, cors);
        res.end("Bad Request");
        return;
      }
      if (typeof state === "string") {
        if (!authStateNonce || state !== authStateNonce) {
          res.writeHead(403, cors);
          res.end("Forbidden");
          return;
        }
        authStateNonce = null; // single use
      }
      pendingAuthToken = { token, user };
      mainWindow?.webContents.send("ghostly:auth-token", { token, user });
      res.writeHead(200, { "Content-Type": "application/json", ...cors });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400, cors);
      res.end("Bad Request");
    }
  });
}

function clearPendingAuthToken(): void {
  pendingAuthToken = null;
}

function startAuthServer() {
  authStateNonce = null;
  authServer = http.createServer(handleAuthRequest);
  authServer.on("error", (err: NodeJS.ErrnoException) => {
    const message = err.code === "EADDRINUSE"
      ? "Login server couldn't start — port 7842 is already in use by another program (maybe another copy of Ghotly AI?). Close it and restart the app."
      : `Login server failed to start: ${err.message}`;
    log.error("[Ghostly] Auth server error:", err);
    pendingAuthServerError = message;
    mainWindow?.webContents.send("ghostly:auth-server-error", message);
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
      // The preload only bridges contextBridge + ipcRenderer, so it runs sandboxed —
      // no full Node process behind one XSS, and no reachable require/process.
      sandbox: true,
      // Without this, dropping a link on the overlay navigates the whole app to that page.
      navigateOnDragDrop: false,
      // Shipping the DevTools UI in a packaged build is a free console into a
      // window whose preload can read every API key.
      devTools: !app.isPackaged,
    },
  });

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setIgnoreMouseEvents(false);

  enforceStealthOnWindow(win);

  // Null the module-level reference: deferred timers (warmScreenSource's 800ms
  // reapply, the 2s kickoff) could otherwise fire against a destroyed window.
  win.on("closed", () => { if (mainWindow === win) mainWindow = null; });

  // Surface renderer failures: a transparent frameless window that fails to paint looks
  // identical to one that's simply hidden.
  win.webContents.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL) => {
    console.error(
      `[Ghostly] Renderer failed to load (${errorCode} ${errorDescription}): ${validatedURL}`,
    );
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("[Ghostly] Renderer process gone:", JSON.stringify(details));
  });
  win.webContents.on("unresponsive", () => {
    console.error("[Ghostly] Renderer became unresponsive");
  });
  win.webContents.on("preload-error", (_e, preloadPath, error) => {
    console.error(`[Ghostly] Preload script error in ${preloadPath}:`, error);
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
    // showInactive(), not show() + focus(): stealing focus from a fullscreen interview
    // tab trips proctoring "tab switched" detection (see hotkeys.ts).
    mainWindow.showInactive();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.setAlwaysOnTop(true, "screen-saver");
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.webContents.send("ghostly:show");
    // The 0 -> 1 opacity jump can leave DWM holding a stale blank frame (same glitch as
    // stealth mode), so nudge a repaint instead of coming back up invisible.
    safeguardVisibility(mainWindow);
  } else {
    mainWindow.setOpacity(0);
    mainWindow.blur();
  }
}

function createTray(): Tray {
  const icon = nativeImage.createFromDataURL(TRAY_ICON_16);
  icon.addRepresentation({ scaleFactor: 2, dataURL: TRAY_ICON_32 });
  const t = new Tray(icon);
  // Same reasoning as index.html's <title> — not something capture-exclusion hides, and a
  // tooltip someone sees on hover shouldn't announce what the app is for.
  t.setToolTip("Ghotly AI");
  t.setContextMenu(Menu.buildFromTemplate([
    { label: "Show/Hide Ghotly AI", click: toggleWindowVisibility },
    {
      label: "Capture Screen",
      click: async () => {
        // Send a real payload or an error: Home.tsx's listener always expects base64, and
        // a bare event made the AI answer with no visual context.
        try {
          const base64 = await captureFullScreen(mainWindow);
          mainWindow?.webContents.send("ghostly:screenshot", base64);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Screenshot capture failed";
          mainWindow?.webContents.send("ghostly:capture-error", message);
        }
      },
    },
    { type: "separator" },
    { label: "Quit Ghotly AI", click: () => app.quit() },
  ]));
  t.on("click", toggleWindowVisibility);
  return t;
}

// Must be before app.whenReady.
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

  // remark-gfm renders model output full of links, and navigation would replace the
  // document with a remote page under the privileged preload; only our own URLs load.
  const isAllowedNavigation = (target: string): boolean => {
    try {
      const { protocol, hostname } = new URL(target);
      if (protocol === "file:" || protocol === "app:") return true;
      return (
        !app.isPackaged &&
        protocol === "http:" &&
        (hostname === "localhost" || hostname === "127.0.0.1")
      );
    } catch {
      return false;
    }
  };

  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-navigate", (event, url) => {
      if (!isAllowedNavigation(url)) event.preventDefault();
    });
    contents.on("will-redirect", (event, url) => {
      if (!isAllowedNavigation(url)) event.preventDefault();
    });
    contents.setWindowOpenHandler(({ url }) => {
      try {
        if (new URL(url).protocol === "https:") void shell.openExternal(url);
      } catch {
        // Unparseable popup URL — deny below, nothing to open.
      }
      return { action: "deny" };
    });
  });

  // Must run before app.whenReady(): privileges are read once at process start.
  // standard = http-like parsing, secure = not an insecure origin, supportFetchAPI = net.fetch.
  protocol.registerSchemesAsPrivileged([
    { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);

  app.whenReady().then(() => {
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("ghostly", process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient("ghostly");
    }

    // Serves local images (Home.tsx builds app://mahesh.png when loaded from file://).
    // The path is resolved against the renderer root and refused if it escapes.
    const rendererRoot = app.isPackaged
      ? path.join(process.resourcesPath, "app.asar", "out", "renderer")
      : path.join(__dirname, "../../out/renderer");
    protocol.handle("app", (request) => {
      let relative: string;
      try {
        const url = new URL(request.url);
        relative = decodeURIComponent(url.hostname + url.pathname).replace(/\/+$/, "");
      } catch {
        return new Response("Bad Request", { status: 400 });
      }
      const target = path.join(rendererRoot, relative);
      const contained = path.relative(rendererRoot, target);
      if (!contained || contained.startsWith("..") || path.isAbsolute(contained)) {
        return new Response("Forbidden", { status: 403 });
      }
      return net.fetch(pathToFileURL(target).toString());
    });

    startAuthServer();
    registerIpcHandlers(clearPendingAuthToken);
    mainWindow = createMainWindow();
    tray = createTray();
    const hotkeyResult = registerHotkeys(mainWindow, getStoredShortcuts());
    if (!hotkeyResult.ok) {
      pendingHotkeyConflict = hotkeyResult.failed;
      mainWindow.webContents.send("ghostly:hotkey-conflict", hotkeyResult.failed);
    }

    // A cached source is only valid for the display/desktop state it was enumerated in.
    screen.on("display-added", invalidateScreenSource);
    screen.on("display-removed", invalidateScreenSource);
    screen.on("display-metrics-changed", invalidateScreenSource);
    powerMonitor.on("lock-screen", invalidateScreenSource);
    powerMonitor.on("unlock-screen", invalidateScreenSource);

    // Main frame only: display-capture/audioCapture for loopback audio and audio-only
    // getUserMedia for the mic check; camera is denied outright.
    const permissionAllowed = (
      permission: string,
      details: { isMainFrame?: boolean; mediaTypes?: Array<"video" | "audio"> },
    ): boolean => {
      if (details.isMainFrame !== true) return false;
      if (permission === "display-capture" || permission === "audioCapture") return true;
      if (permission !== "media") return false;
      const types = details.mediaTypes;
      return Array.isArray(types) && types.includes("audio") && !types.includes("video");
    };
    mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, cb, details) => {
      cb(permissionAllowed(permission, details));
    });
    mainWindow.webContents.session.setPermissionCheckHandler((_wc, permission, _origin, details) => {
      const d = details as { mediaType?: "video" | "audio" | "unknown"; embeddingOrigin?: string };
      // embeddingOrigin is only populated for a sub frame embedding the frame
      // that asked, i.e. never the window's own top-level document.
      return permissionAllowed(permission, {
        isMainFrame: !d.embeddingOrigin,
        mediaTypes: d.mediaType === "video" || d.mediaType === "audio" ? [d.mediaType] : undefined,
      });
    });
    // startInterview() calls getDisplayMedia() on every audio re-enable, including mid
    // share; warmScreenSource() pre-warms so this is almost always a cache read.
    mainWindow.webContents.session.setDisplayMediaRequestHandler((_req, cb) => {
      warmScreenSource().then(() => {
        // audio: "loopback" captures all system audio (Zoom, Meet, Teams) on Windows.
        cb(cachedScreenSource ? { video: cachedScreenSource, audio: "loopback" } : {});
      });
    });

    // Pre-warm now (app just launched, so no share is likely active); the delay lets the
    // initial show + applyStealthMode() finish so the two stealth toggles don't race.
    setTimeout(() => warmScreenSource(), 2000);

    trustedHandle("ghostly:get-pending-auth-token", () => {
      const pending = pendingAuthToken;
      pendingAuthToken = null;
      return pending;
    });
    trustedHandle("ghostly:get-pending-hotkey-conflict", () => {
      const pending = pendingHotkeyConflict;
      pendingHotkeyConflict = null;
      return pending;
    });
    trustedHandle("ghostly:get-pending-auth-server-error", () => {
      const pending = pendingAuthServerError;
      pendingAuthServerError = null;
      return pending;
    });
    // https: and mailto: only (http: would be an "open any plaintext URL" primitive);
    // credentials and CR/LF are refused before reaching the OS handler.
    const SAFE_EXTERNAL_URL =
      /^(?:https:\/\/[a-z0-9.-]+(?::\d{1,5})?(?:[/?#][^\s]*)?|mailto:[^\s@]+@[^\s@]+\.[^\s@]+(?:\?[^\s]*)?)$/i;
    trustedOn("ghostly:open-external", (_event, url: string) => {
      if (typeof url !== "string" || url.length > 2048) return;
      if (/[\u0000-\u001f\u007f]/.test(url)) return;
      if (!SAFE_EXTERNAL_URL.test(url)) return;
      if (AUTH_LOGIN_URL.test(url)) {
        // Fresh nonce per login attempt, forwarded as ?state= to tie the local auth
        // POST back to a login the user actually started (see authStateNonce).
        authStateNonce = randomBytes(16).toString("hex");
        url = `${url}${url.includes("?") ? "&" : "?"}state=${authStateNonce}`;
      }
      void shell.openExternal(url);
    });
    trustedOn("ghostly:enable-mouse", () => mainWindow?.setIgnoreMouseEvents(false));
    // Must restore click-through: hotkey captures put the window in
    // setIgnoreMouseEvents(true, { forward: true }) mode, and (false) here broke it.
    trustedOn("ghostly:disable-mouse", () => mainWindow?.setIgnoreMouseEvents(true, { forward: true }));
    trustedOn("ghostly:set-opacity", (_event, value: number) => {
      if (mainWindow && typeof value === "number" && Number.isFinite(value)) {
        mainWindow.setOpacity(Math.min(1, Math.max(0.1, value)));
      }
    });
    trustedOn("ghostly:hide", () => {
      if (mainWindow) { mainWindow.setOpacity(0); mainWindow.blur(); mainWindow.setIgnoreMouseEvents(true, { forward: false }); }
    });
    trustedOn("ghostly:show", () => {
      if (mainWindow) {
        mainWindow.setOpacity(1);
        // showInactive(), not show() + focus() — see hotkeys.ts's toggleVisibility.
        mainWindow.showInactive();
        mainWindow.setAlwaysOnTop(true, "screen-saver");
        mainWindow.setIgnoreMouseEvents(false);
        safeguardVisibility(mainWindow);
        setTimeout(() => {
          if (mainWindow) {
            mainWindow.setAlwaysOnTop(true, "screen-saver");
            mainWindow.setIgnoreMouseEvents(false);
          }
        }, 150);
      }
    });
    trustedOn("ghostly:quit", () => app.quit());
    trustedOn("ghostly:get-version", (event) => { event.returnValue = app.getVersion(); });
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

    trustedOn("ghostly:download-update", () => autoUpdater.downloadUpdate());
    // isSilent=true is what makes isForceRunAfter honored: without it electron-updater
    // ignores the flag and the app may not relaunch after installing.
    trustedOn("ghostly:install-update", () => autoUpdater.quitAndInstall(true, true));
    trustedOn("ghostly:check-update", () => {
      if (app.isPackaged) {
        autoUpdater.checkForUpdates();
      } else {
        mainWindow?.webContents.send("ghostly:update-error", "Auto-update only works in packaged app.");
      }
    });

    if (app.isPackaged) {
      setTimeout(() => autoUpdater.checkForUpdates(), 3000);
    }
  }).catch((err) => {
    // Without this the app keeps running with zero ipcMain handlers: every renderer
    // invoke hangs forever and the top-level handler swallows the cause.
    log.error("[Ghostly] Fatal startup error:", err);
    dialog.showErrorBox(
      "Ghotly AI couldn't start",
      `Startup failed before the app was ready.\n\n${err instanceof Error ? err.message : String(err)}`,
    );
    app.quit();
  });

  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  app.on("before-quit", () => {
    unregisterHotkeys();
    tray?.destroy();
    // close() only stops new connections; a browser tab holding the OAuth callback's
    // keep-alive socket keeps the process alive, so drop those too.
    authServer?.closeAllConnections();
    authServer?.close();
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length > 0) return;
    // Shortcuts are bound to a specific BrowserWindow, so on macOS (where closing the
    // window doesn't quit) the recreated window needs them re-registered against it.
    const win = createMainWindow();
    mainWindow = win;
    unregisterHotkeys();
    const result = registerHotkeys(win, getStoredShortcuts());
    if (!result.ok) pendingHotkeyConflict = result.failed;
  });

  // macOS deep link
  app.on("open-url", (event, url) => {
    event.preventDefault();
    if (url.startsWith("ghostly://")) handleDeepLink(url);
  });
}
