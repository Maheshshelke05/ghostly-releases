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

// No such safety net existed anywhere in the main process before — any
// unhandled error (a stray EADDRINUSE, a destroyed-window call, a rejected
// promise) was fatal to the whole app by default with zero log/diagnostic.
// This doesn't fix the underlying bugs (each specific one is handled at its
// source elsewhere), it's a last-resort backstop so a future unforeseen one
// logs and survives instead of silently killing the app. Routed through
// electron-log, not console: a packaged Windows launch has no attached console,
// so console-only output was invisible exactly where it was needed most.
process.on("uncaughtException", (err) => {
  log.error("[Ghostly] Uncaught exception (recovered):", err);
});
process.on("unhandledRejection", (reason) => {
  log.error("[Ghostly] Unhandled rejection (recovered):", reason);
});

// ── IPC sender gate ───────────────────────────────────────────────────────────
// Every channel registered in this file is reachable from any frame in the
// window. The support ad is a srcDoc iframe with allow-scripts +
// allow-same-origin, so it shares this document's origin, this preload bridge
// and — before this — `ghostly:get-pending-auth-token`, i.e. a live session
// token, `ghostly:quit`, `ghostly:open-external` and the rest. ipc.ts applies
// the same gate to its own handlers.
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
      // An untrusted frame (the ad) sent this — drop it. There is nothing
      // useful to reply with on a fire-and-forget channel.
      return;
    }
    listener(event, ...args);
  });
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let authServer: http.Server | null = null;

// The website's AuthCallback page posts here after Google OAuth completes, in a
// system-browser tab entirely separate from this window. webContents.send() is
// fire-and-forget — if this fires before the renderer has mounted and called
// onAuthToken() (a real possibility: this HTTP server is listening as soon as
// app.whenReady() resolves, well before the React bundle finishes loading), the
// message is just lost and login looks "stuck" even though the website says it
// succeeded. Buffering it here lets the renderer pick it up on mount too.
let pendingAuthToken: { token: string; user: any } | null = null;

// Same race as pendingAuthToken above, for a different event: registerHotkeys()
// runs right after createMainWindow(), well before the renderer's React app has
// mounted a listener — so a live webContents.send() here can be lost too.
let pendingHotkeyConflict: ShortcutAction[] | null = null;

// startAuthServer() previously had zero error handling — an EADDRINUSE/EACCES
// on port 7842 (a second app instance, a leftover process) was an unhandled
// Node 'error' event with no top-level uncaughtException handler anywhere in
// this file, which is fatal to the whole process by default. If it somehow
// didn't crash the app, login was silently, undiagnosably dead forever (the
// website's POST to 127.0.0.1:7842/auth just gets ECONNREFUSED). Buffered the
// same way as pendingAuthToken/pendingHotkeyConflict for the same mount race.
let pendingAuthServerError: string | null = null;

// Populated by warmScreenSource() well before the user ever enables audio, so the
// live setDisplayMediaRequestHandler below almost always hits the cache instead of
// running the remove-stealth -> enumerate -> reapply-after-800ms dance while the
// user may already be mid screen-share (that live dance was the "overlay briefly
// visible in Google Meet" leak). Kept at module scope so both the pre-warm call and
// the request handler share the same cache.
let cachedScreenSource: Electron.DesktopCapturerSource | null = null;
let screenSourceWarmupPromise: Promise<void> | null = null;
// Distinguishes "never attempted" from "attempted, genuinely came back empty"
// — cachedScreenSource alone can't tell those apart (a resolved-but-empty
// getSources() call sets it to null via .then, identical to the .catch path).
// Without this, every later live getDisplayMedia() call (i.e. every audio
// enable/re-enable, possibly mid screen-share) would re-run the risky
// remove-stealth -> enumerate -> reapply-after-800ms dance forever whenever
// the very first attempt happened to return zero sources — a real, observed
// possibility right after launch before display/GPU state has settled.
let screenSourceWarmupAttempted = false;

// A cached source describes ONE display at ONE moment: its `id` encodes the
// display, and `getDisplayMedia` resolves against that id. Plugging in a
// monitor, unplugging one or changing scaling (the common one: docking a
// laptop) invalidates it, and the desktop-capture API then refuses the stale
// id — so the video track never comes back and system audio stays dead for the
// rest of the session, with no way to fix it short of a restart. Same after a
// lock/unlock: the capture session is torn down with the desktop switch. Drop
// the cache on all of those and let the next request re-warm it.
function invalidateScreenSource(): void {
  cachedScreenSource = null;
  screenSourceWarmupPromise = null;
  screenSourceWarmupAttempted = false;
}

function warmScreenSource(): Promise<void> {
  if (cachedScreenSource) return Promise.resolve();
  if (screenSourceWarmupPromise) return screenSourceWarmupPromise;

  if (screenSourceWarmupAttempted) {
    // Already tried the stealth-removing dance once this session and it came
    // back empty. Don't repeat it live — that's the leak. Best-effort retry
    // the enumeration alone (no stealth touched) so a transient failure can
    // still self-heal by the next call, without ever risking a live capture
    // window during an actual screen share.
    desktopCapturer.getSources({ types: ["screen"] })
      .then((sources) => { if (sources[0]) cachedScreenSource = sources[0]; })
      .catch(() => {});
    return Promise.resolve();
  }

  // desktopCapturer.getSources() runs a Windows desktop-duplication capture session.
  // If our own window is WDA_EXCLUDEFROMCAPTURE at that exact moment, Windows' DWM
  // can stop compositing that window to the real screen too (not just to capture
  // streams) — the whole app, TopBar included, goes invisible on the user's own
  // monitor. Drop the exclusion for the duration of the enumeration, then restore
  // it once the capture session has actually torn down. This whole dance runs at
  // most ONCE per app session — see screenSourceWarmupAttempted above.
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

// ── Local OAuth callback server ────────────────────────────────────────────────
// This used to answer every request with `Access-Control-Allow-Origin: *` and a
// blanket 200 on OPTIONS, i.e. any page the user had open in their browser could
// POST a token here and silently swap the logged-in account. CORS is now answered
// only for the product's own site, the body is capped, a second login can't race
// an unconsumed token, and a state nonce is validated whenever the caller sends
// one (see the note on `authStateNonce`).
const ALLOWED_AUTH_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*ghotlyai\.in$/;
const AUTH_BODY_LIMIT = 64 * 1024;
const AUTH_LOGIN_URL = /^https:\/\/(www\.)?ghotlyai\.in\/electron-login/;
// Generated fresh every time the login URL is opened and appended to it as
// ?state=. The website's AuthCallback page doesn't echo it yet, so a POST
// without a state field is still accepted (requiring it today would break every
// login); any POST that does carry one must match, and the nonce is burned on
// first use. That way the CSRF protection is already in place and takes effect
// the moment the website forwards the parameter.
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

  // CORS only hides the response; it does not stop the request from running.
  // A cross-origin POST with a simple content type skips the preflight above and
  // would still set pendingAuthToken, so reject any browser-sent Origin that is
  // not the product's own site. Requests with no Origin (the website's
  // server-side callback) are unaffected.
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

  // A token the renderer hasn't consumed yet is still pending; a second POST
  // can only mean a retry race, or something that learned the port trying to
  // overwrite a real login with its own.
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
      // The preload only bridges contextBridge + ipcRenderer, so it runs
      // unchanged in the sandbox — no need to leave the renderer with a full
      // Node process behind one XSS. This is what stops the ad iframe (or any
      // model-authored HTML) from reaching require/process directly.
      sandbox: true,
      // Dragging a URL onto the window used to navigate it (dropping a link on
      // the overlay replaced the whole app with that page, preload and all).
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

  // mainWindow was never nulled on destroy — deferred timers (warmScreenSource's
  // 800ms reapply, the 2s startup kickoff) could still fire against a stale,
  // destroyed reference. applyStealthMode/removeStealthMode now guard on
  // isDestroyed() too, but this closes the gap at the source.
  win.on("closed", () => { if (mainWindow === win) mainWindow = null; });

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
    // showInactive(), not show() + focus() — see hotkeys.ts's toggleVisibility
    // for why: this window never needs OS focus to work, and stealing it from
    // a fullscreen interview/assessment tab is what trips proctoring platforms'
    // "tab switched" detection.
    mainWindow.showInactive();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.setAlwaysOnTop(true, "screen-saver");
    mainWindow.setIgnoreMouseEvents(false);
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
        // Used to send the screenshot IPC event with no payload at all —
        // Home.tsx's listener assumed it always gets a real base64 image, so
        // the AI silently answered with no visual context and no error shown.
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

  // ── Navigation / new-window guard ───────────────────────────────────────────
  // Nothing in the renderer ever navigates anywhere: it's one file:// (or dev
  // http://localhost) document. Without this, any link or window.open() — and
  // remark-gfm renders model output full of links — could replace that document
  // with a remote page while the privileged preload stayed attached, or pop a
  // real Electron window around one. Anything that isn't ours is blocked, and
  // external https: links go to the system browser instead.
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

  // Must run before app.whenReady() — Electron reads scheme privileges once, at
  // process start. `standard` makes app:// URLs parse like http(s):// (host +
  // path instead of one opaque string), `secure` keeps them out of the insecure
  // origin bucket, and supportFetchAPI lets the protocol.handle() below serve
  // them through net.fetch.
  protocol.registerSchemesAsPrivileged([
    { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);

  // ── App ready ───────────────────────────────────────────────────────────────
  app.whenReady().then(() => {
    // Register deep link protocol
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("ghostly", process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient("ghostly");
    }

    // Local images for the renderer (Home.tsx builds `app://mahesh.png` when the
    // page itself was loaded from file://). This replaced
    // protocol.registerFileProtocol, which called callback({ path }) with a path
    // joined straight from the URL — `app://../../../../Users/…` escaped the
    // renderer folder and served any file on disk to the page. The path is
    // resolved against the renderer root and refused if it leaves that root.
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

    // A cached desktopCapturer source is only valid for the display/desktop
    // state it was enumerated in — see invalidateScreenSource.
    screen.on("display-added", invalidateScreenSource);
    screen.on("display-removed", invalidateScreenSource);
    screen.on("display-metrics-changed", invalidateScreenSource);
    powerMonitor.on("lock-screen", invalidateScreenSource);
    powerMonitor.on("unlock-screen", invalidateScreenSource);

    // Permissions
    // The overlay needs exactly two things: getDisplayMedia for the loopback
    // audio track ("display-capture") and, on the Audio Setup screen,
    // getUserMedia for a microphone check ("media", audio only —
    // src/pages/AudioSetupPage.tsx:47). Camera is denied outright, and only the
    // top-level document of this window is considered at all: the support ad
    // runs in a sandboxed iframe with the same preload attached and used to be
    // able to request camera/microphone through this same blanket allowlist.
    // ("audioCapture" is kept because Electron has used that name for the
    // loopback device on some platforms/versions; it never matched the old
    // sweeper list on this one.)
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
    });

    // Pre-warm the screen source now, while the user is very unlikely to already be
    // mid screen-share (app just launched) — by the time they actually join a call and
    // enable audio, the handler above should already have a cache hit. The delay lets
    // the window finish its initial show + first applyStealthMode() from
    // "ready-to-show" so the two stealth toggles don't race each other.
    setTimeout(() => warmScreenSource(), 2000);

    // IPC handlers
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
    // https: and mailto: only — http: used to be in this list, which made the
    // channel an "open any plaintext URL" primitive for whatever frame called
    // it. Addresses with embedded credentials (https://user:pass@host) or
    // whitespace/control characters (a CR/LF here is a protocol-handler
    // injection) are refused before they reach the OS.
    const SAFE_EXTERNAL_URL =
      /^(?:https:\/\/[a-z0-9.-]+(?::\d{1,5})?(?:[/?#][^\s]*)?|mailto:[^\s@]+@[^\s@]+\.[^\s@]+(?:\?[^\s]*)?)$/i;
    trustedOn("ghostly:open-external", (_event, url: string) => {
      if (typeof url !== "string" || url.length > 2048) return;
      if (/[\u0000-\u001f\u007f]/.test(url)) return;
      if (!SAFE_EXTERNAL_URL.test(url)) return;
      if (AUTH_LOGIN_URL.test(url)) {
        // Fresh nonce per login attempt, forwarded as ?state= so a POST to the
        // local auth server can be tied back to a login the user actually
        // started (see authStateNonce). Ignored by the website today.
        authStateNonce = randomBytes(16).toString("hex");
        url = `${url}${url.includes("?") ? "&" : "?"}state=${authStateNonce}`;
      }
      void shell.openExternal(url);
    });
    trustedOn("ghostly:enable-mouse", () => mainWindow?.setIgnoreMouseEvents(false));
    // Used to be byte-identical to enable-mouse above (also just (false)) instead
    // of restoring click-through — after any hotkey capture puts the window into
    // click-through mode (setIgnoreMouseEvents(true, {forward:true})) so the
    // meeting app underneath stays clickable, the moment the pointer entered ANY
    // button (every onMouseEnter across the renderer calls enableMouse()) this
    // never correctly went back, permanently breaking click-through for the rest
    // of that visible session.
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
    // Removed dead "ghostly:move" handler — preload.ts never exposed a sender
    // for it (unreachable from the renderer), and window repositioning is
    // already fully covered by hotkeys.ts's registerMoveKeys()
    // (Ctrl+Up/Down/Left/Right global shortcuts).

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

    trustedOn("ghostly:download-update", () => autoUpdater.downloadUpdate());
    // quitAndInstall() with no args runs with isSilent=false — electron-updater's own
    // docs say isForceRunAfter is IGNORED in that mode, so whether the app relaunches
    // after installing was left entirely to the NSIS installer's own default UI flow
    // (not guaranteed, and a second native installer window popping up after the app's
    // own "Installing Update" animation above was confusing either way). A user who
    // updates then immediately tries the browser login hits "desktop app not detected"
    // with no way to recover short of noticing the app never reopened and launching it
    // by hand. isSilent=true actually honors isForceRunAfter, guaranteeing a relaunch.
    trustedOn("ghostly:install-update", () => autoUpdater.quitAndInstall(true, true));
    trustedOn("ghostly:check-update", () => {
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
  }).catch((err) => {
    // Anything thrown above (a bad protocol registration, a store that can't be
    // read, a port/session failure) used to leave the app running with zero
    // ipcMain handlers registered — every button in the renderer then hangs on
    // an invoke that never resolves, with no window/error to explain it, and
    // the blanket unhandledRejection handler at the top swallowed the cause.
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
    // close() alone only stops new connections — a browser tab holding the
    // OAuth callback's keep-alive socket keeps the process alive and the app
    // visibly fails to quit.
    authServer?.closeAllConnections();
    authServer?.close();
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length > 0) return;
    // Every global shortcut is bound to a specific BrowserWindow from
    // registerHotkeys(). On macOS (the only platform where closing the window
    // doesn't quit) the recreated window used to come back with all of them
    // still pointing at the destroyed one, so no hotkey worked until restart.
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
