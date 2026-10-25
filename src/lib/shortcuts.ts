// Builds accelerator strings for electron/hotkeys.ts (validated by electron/accelerator.ts).
// "Move Window" stays fixed because its 4-key group doesn't fit a single-combo remap UI.
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

// Formats "CommandOrControl+Shift+E" into the short display form used in this panel.
export function formatAccelerator(accelerator: string): string {
  return accelerator
    .split("+")
    .map((part) => (part === "CommandOrControl" ? "Ctrl" : part === "Return" ? "↵" : part))
    .join(" + ");
}

// Keys whose accelerator spelling differs. Anything else that is not printable, F1-F24 or a
// named key is rejected: " " and "+" would produce strings Electron's converter throws on.
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

// Builds an accelerator from a keydown event, or null when unusable (modifier-only, no
// modifier, or a key Electron can't express); callers keep listening on null, never saving it.
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

// True when the key itself cannot be expressed (not merely modifier-only); the settings
// panel uses this to tell the user why nothing happened.
export function isUnsupportedKey(e: KeyboardEvent): boolean {
  if (["Control", "Meta", "Alt", "Shift"].includes(e.key)) return false;
  return mainKeyOf(e.key) === null;
}
