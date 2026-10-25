import { globalShortcut, BrowserWindow } from "electron";
import { isValidAccelerator } from "./accelerator";
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

// Non-remappable accelerators (move keys, legacy aliases) that failed to register;
// reported separately so the HotkeyResult shape main.ts/ipc.ts handle stays unchanged.
export type FixedShortcut = "moveWindow" | "legacyAlias";

export type HotkeyResult = {
  ok: boolean;
  failed: ShortcutAction[];
  failedFixed: FixedShortcut[];
};

// Deliberately Ctrl+Alt+<digit>: Ctrl+E/B/G/N/0/2/8 are claimed by Chrome and IDEs
// (address bar, bookmarks, new window, tab switching), so those combos silently did nothing.
export const DEFAULT_SHORTCUTS: ShortcutBindings = {
  captureAndSolve: "CommandOrControl+Alt+1",
  solve: "CommandOrControl+Alt+2",
  toggleVisibility: "CommandOrControl+Alt+3",
  manualSend: "CommandOrControl+Alt+4",
  nextQuestion: "CommandOrControl+Alt+5",
  startOver: "CommandOrControl+Alt+6",
  prevQuestion: "CommandOrControl+Alt+7",
  nextQuestionPage: "CommandOrControl+Alt+8",
};

const ACTIONS = Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[];

// Ctrl+Arrow is caret movement in every JetBrains IDE and line-move in VS Code,
// but the window must stay movable while hidden. See registerMoveKeys.

// Always registered, never remappable or shown in Settings, so muscle memory keeps
// working whatever the primary combo is set to.
const LEGACY_ALIASES: { accelerator: string; action: ShortcutAction }[] = [
  { accelerator: "CommandOrControl+Shift+S", action: "captureAndSolve" },
  { accelerator: "CommandOrControl+Shift+Return", action: "captureAndSolve" },
  { accelerator: "CommandOrControl+Shift+H", action: "toggleVisibility" },
  { accelerator: "CommandOrControl+E", action: "captureAndSolve" },
  { accelerator: "CommandOrControl+Return", action: "solve" },
  { accelerator: "CommandOrControl+B", action: "toggleVisibility" },
  { accelerator: "CommandOrControl+N", action: "nextQuestion" },
  { accelerator: "CommandOrControl+G", action: "startOver" },
  { accelerator: "CommandOrControl+0", action: "manualSend" },
  { accelerator: "CommandOrControl+8", action: "prevQuestion" },
  { accelerator: "CommandOrControl+2", action: "nextQuestionPage" },
];

let currentWin: BrowserWindow | null = null;
let currentBindings: ShortcutBindings = { ...DEFAULT_SHORTCUTS };

// Registered via globalShortcut, so they fire regardless of OS focus (Zoom, browser,
// IDE) — renderer keydown listeners only worked while the invisible overlay had focus.
function buildActionHandlers(win: BrowserWindow): Record<ShortcutAction, () => void> {
  const captureAndSolve = async () => {
    // Declared outside the try so the catch can tell whether this call hid the window.
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
        // No win.focus(): stealing OS focus from a fullscreen tab mid-capture trips
        // proctoring platforms' (e.g. HackerEarth) "tab switched" detection.
        safeguardVisibility(win);
      }
      win.webContents.send("ghostly:screenshot", base64);
      setTimeout(() => win.webContents.send("ghostly:solve"), 100);
    } catch (err) {
      console.error("[Ghostly] Capture+Solve failed:", err);
      // Restore only if this call hid the window: re-reading live opacity forces a
      // deliberately hidden overlay (Ctrl+B) back onto a shared screen on failure.
      if (wasVisible) {
        win.setOpacity(1);
        win.setIgnoreMouseEvents(true, { forward: true });
        safeguardVisibility(win);
      }
      // Also surface to the renderer — a packaged app has no terminal, so a failure
      // would look like the hotkey silently doing nothing.
      const message = err instanceof Error ? err.message : "Screenshot capture failed";
      win.webContents.send("ghostly:capture-error", message);
    }
  };

  const toggleVisibility = () => {
    const isCurrentlyHidden = win.getOpacity() === 0 || !win.isVisible();
    if (isCurrentlyHidden) {
      win.setOpacity(1);
      // showInactive(), not show() + focus(): stealing focus from a fullscreen interview
      // tab trips proctoring "tab switched" detection; clicks still focus normally.
      win.showInactive();
      if (win.isMinimized()) win.restore();
      win.setAlwaysOnTop(true, "screen-saver");
      win.setIgnoreMouseEvents(false);
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
    // No win.focus() — see toggleVisibility above.
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

// register() returns false when another running app owns the combo, but THROWS when
// Electron can't parse the string ("CommandOrControl+ ", "Dead"), so every call is guarded.
function tryRegister(accelerator: string, handler: () => void): boolean {
  try {
    return globalShortcut.register(accelerator, handler);
  } catch (err) {
    console.error(`[Ghostly] "${accelerator}" is not a valid accelerator:`, err);
    return false;
  }
}

function registerMoveKeys(win: BrowserWindow): boolean {
  // Bare arrows are deliberately NOT registered — that would hijack Left/Right/Up/
  // Down system-wide; not exposed in the remap UI either (one action = one combo).
  const move: Record<string, (x: number, y: number) => void> = {
    Up: (x, y) => win.setPosition(x, y - MOVE_STEP),
    Down: (x, y) => win.setPosition(x, y + MOVE_STEP),
    Left: (x, y) => win.setPosition(x - MOVE_STEP, y),
    Right: (x, y) => win.setPosition(x + MOVE_STEP, y),
  };
  let ok = true;
  for (const [key, apply] of Object.entries(move)) {
    const accelerator = `CommandOrControl+${key}`;
    if (tryRegister(accelerator, () => { const [x, y] = win.getPosition(); apply(x, y); })) continue;
    // Ctrl+Arrow is claimed by IDEs and Office — say so instead of moving the window mysteriously.
    console.warn(`[Ghostly] Move key ${accelerator} is owned by another app — window can't be moved with it.`);
    ok = false;
  }
  return ok;
}

function registerLegacyAliases(handlers: Record<ShortcutAction, () => void>): boolean {
  let ok = true;
  for (const { accelerator, action } of LEGACY_ALIASES) {
    if (tryRegister(accelerator, handlers[action])) continue;
    console.warn(`[Ghostly] Legacy shortcut ${accelerator} is owned by another app — it won't fire.`);
    ok = false;
  }
  return ok;
}

// Bindings come from electron-store (hand-edited, corrupted, or stale), so an
// invalid one must degrade to the default instead of throwing at startup.
function sanitizeBindings(bindings?: Partial<ShortcutBindings> | null): { bindings: ShortcutBindings; invalid: ShortcutAction[] } {
  const safe: ShortcutBindings = { ...DEFAULT_SHORTCUTS };
  const invalid: ShortcutAction[] = [];
  for (const action of ACTIONS) {
    const accelerator = bindings?.[action];
    if (accelerator === undefined) continue; // not set — keep the default
    if (isValidAccelerator(accelerator)) {
      safe[action] = accelerator;
    } else {
      invalid.push(action);
      console.warn(`[Ghostly] Stored shortcut for "${action}" is not usable ("${String(accelerator)}") — falling back to ${safe[action]}.`);
    }
  }
  return { bindings: safe, invalid };
}

const emptyResult = (): HotkeyResult => ({ ok: false, failed: [], failedFixed: [] });

// Called at startup and again from app.on("activate"): every registration closes
// over its BrowserWindow, so the set must be rebuilt when the window is recreated.
export function registerHotkeys(win: BrowserWindow, bindings: ShortcutBindings = DEFAULT_SHORTCUTS): HotkeyResult {
  currentWin = win;
  const { bindings: safe, invalid } = sanitizeBindings(bindings);
  currentBindings = safe;
  const handlers = buildActionHandlers(win);
  // An unusable stored binding is reported as failed even though the default
  // gets registered for it, so the user is told their setting was ignored.
  const failed: ShortcutAction[] = [...invalid];

  // Everything below is known-good (validated + individually guarded), so this
  // teardown can't leave the app with no shortcuts at all.
  globalShortcut.unregisterAll();

  for (const action of ACTIONS) {
    const accelerator = safe[action];
    const ok = tryRegister(accelerator, handlers[action]);
    console.log(`[Ghostly] ${accelerator} (${action}) registered:`, ok);
    if (!ok) failed.push(action);
  }

  const failedFixed: FixedShortcut[] = [];
  if (!registerLegacyAliases(handlers)) failedFixed.push("legacyAlias");
  if (!registerMoveKeys(win)) failedFixed.push("moveWindow");

  console.log(`[Ghostly] Hotkeys registered (${failed.length} failed, ${failedFixed.length} fixed failed)`);
  return { ok: failed.length === 0, failed, failedFixed };
}

// Registers the new accelerators before dropping the ones they replace, so one bad
// combo can't leave the user with no shortcuts; unchanged ones are skipped as duplicates.
export function updateHotkeys(newBindings: ShortcutBindings): HotkeyResult {
  if (!currentWin) return emptyResult();
  const { bindings: safe, invalid } = sanitizeBindings(newBindings);
  if (invalid.length > 0) return { ok: false, failed: invalid, failedFixed: [] };

  const changed = ACTIONS.filter((action) => safe[action] !== currentBindings[action]);
  if (changed.length === 0) return { ok: true, failed: [], failedFixed: [] };

  const handlers = buildActionHandlers(currentWin);
  const staged: ShortcutAction[] = [];
  const failed: ShortcutAction[] = [];
  for (const action of changed) {
    if (tryRegister(safe[action], handlers[action])) staged.push(action);
    else failed.push(action);
  }

  if (failed.length > 0) {
    // Undo only what this call just added; everything already working stays registered.
    for (const action of staged) globalShortcut.unregister(safe[action]);
    return { ok: false, failed, failedFixed: [] };
  }

  for (const action of changed) globalShortcut.unregister(currentBindings[action]);
  currentBindings = safe;
  return { ok: true, failed: [], failedFixed: [] };
}

export function getCurrentBindings(): ShortcutBindings {
  return currentBindings;
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll();
}
