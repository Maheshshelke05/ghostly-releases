import { globalShortcut, BrowserWindow } from "electron";
import { captureFullScreen } from "./capture";
import { safeguardVisibility } from "./stealth";

const MOVE_STEP = 25;

export type ShortcutAction =
  | "captureAndSolve"
  | "solve"
  | "toggleVisibility"
  | "startOver"
  | "nextQuestion"
  | "manualSend"
  | "prevQuestion"
  | "nextQuestionPage";

export type ShortcutBindings = Record<ShortcutAction, string>;

export const DEFAULT_SHORTCUTS: ShortcutBindings = {
  captureAndSolve: "CommandOrControl+E",
  solve: "CommandOrControl+Return",
  toggleVisibility: "CommandOrControl+B",
  startOver: "CommandOrControl+G",
  nextQuestion: "CommandOrControl+N",
  manualSend: "CommandOrControl+0",
  prevQuestion: "CommandOrControl+8",
  nextQuestionPage: "CommandOrControl+2",
};

let currentWin: BrowserWindow | null = null;
let currentBindings: ShortcutBindings = { ...DEFAULT_SHORTCUTS };

// Every hotkey below is registered via Electron's globalShortcut, so it fires
// regardless of which window has OS focus (Zoom, the browser, your IDE) — that's
// the whole point of a stealth overlay. Renderer-side `window.addEventListener
// ('keydown', ...)` handlers were previously used for some of these (Ctrl+N,
// Ctrl+0, Ctrl+8, Ctrl+2) and only fired while the invisible overlay window
// itself happened to have keyboard focus, which is rarely true during a real
// interview. They've been removed from Home.tsx in favor of the IPC events sent
// here, so every documented shortcut now genuinely works from anywhere.
function buildActionHandlers(win: BrowserWindow): Record<ShortcutAction, () => void> {
  const captureAndSolve = async () => {
    // Declared outside the try so the catch block can also read it — it used
    // to be try-scoped, so the catch fell back to re-reading live opacity
    // instead (see the comment down there for why that was wrong).
    const wasVisible = win.getOpacity() > 0;
    try {
      if (wasVisible) {
        win.setOpacity(0);
        win.blur();
        win.setIgnoreMouseEvents(true, { forward: false });
      }
      await new Promise((r) => setTimeout(r, 150));
      const base64 = await captureFullScreen();
      if (wasVisible) {
        win.setOpacity(1);
        win.setIgnoreMouseEvents(true, { forward: true });
        win.focus();
        safeguardVisibility(win);
      }
      win.webContents.send("ghostly:screenshot", base64);
      setTimeout(() => win.webContents.send("ghostly:solve"), 100);
    } catch (err) {
      console.error("[Ghostly] Capture+Solve failed:", err);
      // Restore visibility only if THIS call was the one that hid the window
      // (wasVisible) — re-reading live opacity here instead used to force a
      // deliberately-hidden overlay (Ctrl+B) back to fully visible/focused
      // whenever a capture failed, popping it up in front of a shared screen.
      if (wasVisible) {
        win.setOpacity(1);
        win.setIgnoreMouseEvents(true, { forward: true });
        win.focus();
        safeguardVisibility(win);
      }
      // This used to only log to the terminal — a packaged app's user never
      // sees that, so a failed capture (e.g. desktopCapturer erroring) looked
      // exactly like the Ctrl+E hotkey silently doing nothing at all.
      const message = err instanceof Error ? err.message : "Screenshot capture failed";
      win.webContents.send("ghostly:capture-error", message);
    }
  };

  const toggleVisibility = () => {
    const isCurrentlyHidden = win.getOpacity() === 0 || !win.isVisible();
    if (isCurrentlyHidden) {
      win.setOpacity(1);
      win.show();
      if (win.isMinimized()) win.restore();
      win.setAlwaysOnTop(true, "screen-saver");
      win.setIgnoreMouseEvents(false);
      win.focus();
      win.webContents.send("ghostly:show");
      safeguardVisibility(win);
    } else {
      win.setOpacity(0);
      win.blur();
    }
  };

  const solve = () => {
    if (win.getOpacity() === 0) {
      win.setOpacity(1);
      win.setIgnoreMouseEvents(true, { forward: true });
      safeguardVisibility(win);
    }
    win.focus();
    win.webContents.send("ghostly:solve");
  };

  const startOver = () => {
    win.webContents.send("ghostly:start-over");
    setTimeout(() => {
      win.setIgnoreMouseEvents(false);
      win.webContents.send("ghostly:show");
    }, 200);
  };

  return {
    captureAndSolve,
    solve,
    toggleVisibility,
    startOver,
    nextQuestion: () => win.webContents.send("ghostly:next-question"),
    manualSend: () => win.webContents.send("ghostly:manual-send"),
    prevQuestion: () => win.webContents.send("ghostly:prev-question"),
    nextQuestionPage: () => win.webContents.send("ghostly:next-question-page"),
  };
}

function registerMoveKeys(win: BrowserWindow): void {
  // Bare arrow keys (no modifier) are deliberately NOT registered here: doing so
  // would hijack Left/Right/Up/Down system-wide in every other app. Not exposed
  // in the remapping UI either — a directional group doesn't fit the "one
  // action -> one combo" remap flow.
  globalShortcut.register("CommandOrControl+Up", () => {
    const [x, y] = win.getPosition();
    win.setPosition(x, y - MOVE_STEP);
  });
  globalShortcut.register("CommandOrControl+Down", () => {
    const [x, y] = win.getPosition();
    win.setPosition(x, y + MOVE_STEP);
  });
  globalShortcut.register("CommandOrControl+Left", () => {
    const [x, y] = win.getPosition();
    win.setPosition(x - MOVE_STEP, y);
  });
  globalShortcut.register("CommandOrControl+Right", () => {
    const [x, y] = win.getPosition();
    win.setPosition(x + MOVE_STEP, y);
  });
}

function registerLegacyAliases(handlers: Record<ShortcutAction, () => void>): void {
  // Kept working unconditionally (not remappable, not shown in Settings) for
  // anyone already used to them, regardless of how the primary combo above is
  // remapped.
  globalShortcut.register("CommandOrControl+Shift+S", handlers.captureAndSolve);
  globalShortcut.register("CommandOrControl+Shift+Return", handlers.captureAndSolve);
  globalShortcut.register("CommandOrControl+Shift+H", handlers.toggleVisibility);
}

// globalShortcut.register() returns false — with no exception and no OS-level
// dialog — when another already-running app holds the exact same accelerator
// (Ctrl+E is a common one: browsers, Discord, various IDEs/utilities). That
// used to fail completely silently: the shortcut just never fired and nothing
// told the user why. Callers now get back which actions failed so the
// renderer can tell the user instead of leaving them guessing.
export function registerHotkeys(win: BrowserWindow, bindings: ShortcutBindings = DEFAULT_SHORTCUTS): { ok: boolean; failed: ShortcutAction[] } {
  currentWin = win;
  currentBindings = bindings;
  const handlers = buildActionHandlers(win);
  const failed: ShortcutAction[] = [];

  for (const [action, accelerator] of Object.entries(bindings) as [ShortcutAction, string][]) {
    const ok = globalShortcut.register(accelerator, handlers[action]);
    console.log(`[Ghostly] ${accelerator} (${action}) registered:`, ok);
    if (!ok) failed.push(action);
  }

  registerLegacyAliases(handlers);
  registerMoveKeys(win);

  console.log("[Ghostly] All hotkeys registered");
  return { ok: failed.length === 0, failed };
}

// Called when the user remaps a shortcut in Settings — unregisters everything
// and re-registers from the new bindings map so the change takes effect
// immediately, without restarting the app.
export function updateHotkeys(newBindings: ShortcutBindings): { ok: boolean; failed: ShortcutAction[] } {
  if (!currentWin) return { ok: false, failed: [] };
  globalShortcut.unregisterAll();
  const handlers = buildActionHandlers(currentWin);
  const failed: ShortcutAction[] = [];

  for (const [action, accelerator] of Object.entries(newBindings) as [ShortcutAction, string][]) {
    const ok = globalShortcut.register(accelerator, handlers[action]);
    if (!ok) failed.push(action);
  }

  registerLegacyAliases(handlers);
  registerMoveKeys(currentWin);
  currentBindings = newBindings;
  return { ok: failed.length === 0, failed };
}

export function getCurrentBindings(): ShortcutBindings {
  return currentBindings;
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll();
}
