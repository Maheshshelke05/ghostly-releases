// Builds the accelerator strings passed to electron/hotkeys.ts, which validates
// them with electron/accelerator.ts before globalShortcut ever sees them.
// "Move Window" stays fixed (its 4-key group doesn't fit a single-combo remap
// UI) and is shown for reference only.
export const REMAPPABLE_SHORTCUTS: { label: string; action: string }[] = [
  { label: "Ask AI",        action: "solve" },
  { label: "Screenshot",    action: "captureAndSolve" },
  { label: "Send to AI",    action: "manualSend" },
  { label: "Next Question", action: "nextQuestion" },
  { label: "Show / Hide",   action: "toggleVisibility" },
  { label: "Start Over",    action: "startOver" },
  { label: "Scroll Up",     action: "prevQuestion" },
  { label: "Scroll Down",   action: "nextQuestionPage" },
];

// Formats an Electron accelerator string ("CommandOrControl+Shift+E") into the
// short display form used elsewhere in this panel ("Ctrl+Shift+E").
export function formatAccelerator(accelerator: string): string {
  return accelerator
    .split("+")
    .map((part) => (part === "CommandOrControl" ? "Ctrl" : part === "Return" ? "↵" : part))
    .join(" + ");
}

// e.key values whose accelerator spelling differs. Anything absent from here
// that is not a single printable character, F1-F24 or a named key is rejected
// rather than passed through: " " and "+" used to produce
// "CommandOrControl+ " and "CommandOrControl+Shift++", both of which Electron's
// converter throws on (see electron/accelerator.ts).
const KEY_ALIASES: Record<string, string> = {
  " ": "Space",
  "+": "Plus",
  Enter: "Return",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Esc",
};

const NAMED_KEYS = new Set([
  "Backspace", "CapsLock", "Delete", "End", "Home", "Insert",
  "PageDown", "PageUp", "PrintScreen", "ScrollLock", "Tab",
  "VolumeDown", "VolumeMute", "VolumeUp",
]);

function mainKeyOf(key: string): string | null {
  if (KEY_ALIASES[key]) return KEY_ALIASES[key];
  if (key.length === 1 && /^[ -~]$/.test(key)) return key.toUpperCase();
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return key;
  if (NAMED_KEYS.has(key)) return key;
  // Dead, Unidentified, AltGraph, Fn, Compose, MediaTrackNext, ...
  return null;
}

// Builds an accelerator string from a keydown event, or null when the combo is
// unusable (modifier-only, no modifier, or a key Electron cannot express).
// Callers keep listening on null rather than saving a shortcut that would
// silently fail to register.
export function keyEventToAccelerator(e: KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push("CommandOrControl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");

  if (["Control", "Meta", "Alt", "Shift"].includes(e.key)) return null;
  if (mods.length === 0) return null; // require at least one modifier — avoids hijacking bare keys system-wide

  const mainKey = mainKeyOf(e.key);
  if (!mainKey) return null;
  return [...mods, mainKey].join("+");
}

// True when the keydown event produced no usable combo because the key itself
// cannot be expressed (as opposed to the user still holding only modifiers).
// The settings panel uses this to tell the user why nothing happened.
export function isUnsupportedKey(e: KeyboardEvent): boolean {
  if (["Control", "Meta", "Alt", "Shift"].includes(e.key)) return false;
  return mainKeyOf(e.key) === null;
}
