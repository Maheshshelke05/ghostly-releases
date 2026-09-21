// Shared between SettingsPanel.tsx (interview overlay settings) and
// HomeSettingsPanel.tsx (HomePage settings) so both remap UIs stay backed by
// the exact same action list and accelerator-formatting logic instead of two
// copies that could silently drift apart.

// action must match a key in electron/hotkeys.ts's ShortcutBindings — these are
// the ones remappable from Settings. "Move Window" stays fixed (4-key group
// doesn't fit a single-combo remap UI) and is shown for reference only.
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

// Builds an accelerator string from a keydown event, or null while the user is
// still only holding modifier keys (caller should keep listening).
export function keyEventToAccelerator(e: KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push("CommandOrControl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");

  const key = e.key;
  if (["Control", "Meta", "Alt", "Shift"].includes(key)) return null;
  if (mods.length === 0) return null; // require at least one modifier — avoids hijacking bare keys system-wide

  const mainKey = key === "Enter" ? "Return" : key.length === 1 ? key.toUpperCase() : key;
  return [...mods, mainKey].join("+");
}
