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

// Non-remappable accelerators (the move keys, the legacy aliases) that also
// failed to register. Reported next to `failed` instead of inside it so the
// shape main.ts/ipc.ts already handle stays unchanged.
export type FixedShortcut = "moveWindow" | "legacyAlias";

export type HotkeyResult = {
  ok: boolean;
  failed: ShortcutAction[];
  failedFixed: FixedShortcut[];
};

// Deliberately Ctrl+Alt+<digit>: the previous defaults (Ctrl+E/B/G/N/0/2/8) are
// all claimed by the browser or IDE the user is almost certainly focused on
// during a screen-share interview — Chrome takes Ctrl+E (address bar), Ctrl+B
// (bookmarks sidebar) and Ctrl+N (new window), Ctrl+G is find-next, and
// Ctrl+0/2/8 switch browser tabs — so those hotkeys silently did nothing at the
// exact moment they were needed. Ctrl+Alt+digit is unclaimed there. The old
// combos still work, as legacy aliases (see LEGACY_ALIASES below).
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
// Ctrl+Left/Right is "jump to edge of data region" in Excel/Word. Kept (the
// window genuinely has to be movable while hidden) but no longer registered
// silently — see registerMoveKeys.
const MOVE_ACCELERATORS = ["Up", "Down", "Left", "Right"];

// Kept working unconditionally (not remappable, not shown in Settings) so
// anyone already used to them keeps working, whatever the primary combo is set
// to. The first three predate the default change; the rest are the previous
// defaults, kept for muscle memory.
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
        // No win.focus() here — see toggleVisibility below for why. Stealing OS
        // focus from a fullscreen browser tab mid-capture is exactly what makes
        // assessment platforms like HackerEarth flag a "tab switched" violation.
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
      // showInactive(), not show() + focus(): every shortcut here is a global
      // one that works regardless of OS focus (see the comment at the top of
      // this file) specifically so the user never has to click into — or give
      // OS focus to — this window during a real interview. show() + focus()
      // stole focus from whatever WAS focused (often a fullscreen browser tab
      // running the actual interview/assessment), which several proctoring
      // platforms (e.g. HackerEarth) detect as a "tab switched" violation and
      // forcibly exit fullscreen over — happening even when, on top of that,
      // this window failed to actually render above an exclusive-fullscreen
      // app, so the user saw a violation warning for a window they couldn't
      // even see. Mouse clicks on the window still focus it normally; nothing
      // here needs keyboard focus to work.
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

// register() has two completely different failure modes and they used to be
// treated as one:
//   - returns FALSE when another already-running app owns that exact combo;
//   - THROWS (gin conversion failure) when Electron cannot parse the string at
//     all, e.g. "CommandOrControl+ " or "Dead".
// The second one is why every register() call in this file is individually
// guarded: a throw used to escape registerHotkeys into main.ts's
// whenReady().then(), rejecting it, and being swallowed by its blanket
// unhandledRejection handler — leaving a live window and tray with zero
// ipcMain handlers registered (login hangs, Quit does nothing, nothing logged).
function tryRegister(accelerator: string, handler: () => void): boolean {
  try {
    return globalShortcut.register(accelerator, handler);
  } catch (err) {
    console.error(`[Ghostly] "${accelerator}" is not a valid accelerator:`, err);
    return false;
  }
}

function registerMoveKeys(win: BrowserWindow): boolean {
  // Bare arrow keys (no modifier) are deliberately NOT registered here: doing so
  // would hijack Left/Right/Up/Down system-wide in every other app. Not exposed
  // in the remapping UI either — a directional group doesn't fit the "one
  // action -> one combo" remap flow.
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
    // Ctrl+Arrow is claimed by IDEs and by Excel/Word, so this genuinely fails
    // on some machines — say so instead of moving the window mysteriously.
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

// Last line of defence before anything reaches globalShortcut. Bindings come
// from electron-store (hand-edited config, corrupted write, or a value from an
// older version), so an invalid one must degrade to the default for that action
// instead of throwing — here it would abort startup entirely (see tryRegister).
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

// Called once at startup and again from app.on("activate") when the window has
// been recreated — every registration closes over the BrowserWindow it was made
// with, so the whole set is rebuilt against the new one.
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

// Called when the user remaps a shortcut in Settings. The old teardown-first
// shape (unregisterAll(), then register the new map) meant one bad accelerator
// left the user with NO shortcuts until restart, so this registers the new
// accelerators first and only drops the ones they replace once the whole new
// set is known to be good. Only accelerators that actually changed are
// registered: an unchanged one is already registered by this process, so
// re-registering it would just fail as a duplicate.
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
    // Undo only what this call just added — every shortcut that was working
    // before the user pressed the key is still registered.
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
