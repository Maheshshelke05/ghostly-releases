// Pure accelerator-string validation. Deliberately has NO Electron import so it
// can be unit-tested without booting the app (electron/accelerator.test.ts).
//
// Why this module exists: Electron 28 converts the string in a gin converter
// (shell/common/gin_converters/accelerator_converter.cc) before
// globalShortcut.register() ever runs. When that conversion fails, gin raises a
// TypeError — register() THROWS. It only ever *returns false* when another
// already-running app owns the same combo. The rest of the hotkey code was
// written on the assumption that false was the only failure mode, so one
// malformed string could take out every registered shortcut (updateHotkeys) or
// abort app startup outright (registerHotkeys).
//
// The rules below mirror shell/common/keyboard_util.cc + the
// accelerator_util::StringToAccelerator loop, so "valid here" means "Electron
// will accept it".

// Tokens that resolve to a modifier (KeyboardCodeFromKeyIdentifier).
const MODIFIER_TOKENS = new Set([
  "alt", "altgr", "cmd", "cmdorctrl", "command", "commandorcontrol",
  "control", "ctrl", "meta", "option", "shift", "super",
]);

// Tokens that resolve to a key code. F1-F24 are generated rather than listed.
const NAMED_KEY_TOKENS = new Set([
  "backspace", "capslock", "delete", "down", "end", "enter", "esc", "escape",
  "home", "insert", "left",
  "medianexttrack", "mediaplaypause", "mediaprevioustrack", "mediastop",
  "num0", "num1", "num2", "num3", "num4", "num5", "num6", "num7", "num8", "num9",
  "numadd", "numdec", "numdiv", "numlock", "nummult", "numsub",
  "pagedown", "pageup", "plus", "printscreen", "return", "right",
  "scrolllock", "space", "tab", "up",
  "volumedown", "volumemute", "volumeup",
]);

// Every printable ASCII character maps to a key code (KeyboardCodeFromCharCode
// covers 0x20-0x7E), plus the control chars it accepts for backspace/tab/
// return/escape/delete.
const SINGLE_CHAR_KEY = /^[ -~\x08\x09\x0d\x1b\x7f]$/;
const FUNCTION_KEY = /^f([1-9]|1[0-9]|2[0-4])$/;
const ASCII = /^[\x00-\x7f]+$/;

/** "modifier" | "key" for a token Electron understands, null for one it doesn't. */
function tokenRole(token: string): "modifier" | "key" | null {
  const t = token.toLowerCase(); // KeyboardCodeFromStr lowercases before lookup
  if (MODIFIER_TOKENS.has(t)) return "modifier";
  if (NAMED_KEY_TOKENS.has(t) || FUNCTION_KEY.test(t) || SINGLE_CHAR_KEY.test(t)) return "key";
  return null;
}

/**
 * True when Electron's accelerator parser would accept this string instead of
 * throwing out of globalShortcut.register().
 *
 * Deliberately stricter than Electron in two places, both in the safe
 * direction: every token must be one it knows (Electron only fails when the
 * *last* non-modifier token is unknown, so `"CommandOrControl+Dead+E"` would
 * silently register as just Ctrl+E), and at least one modifier is required (a
 * bare `"E"` parses fine and would then hijack that key in every other app).
 */
export function isValidAccelerator(accelerator: unknown): accelerator is string {
  if (typeof accelerator !== "string" || accelerator.length === 0) return false;
  // StringToAccelerator() rejects any non-ASCII string outright.
  if (!ASCII.test(accelerator)) return false;

  // Same splitting Electron does: split on "+", trim each token, drop empties.
  // This is what turns "CommandOrControl+ " into "CommandOrControl" (no key →
  // conversion failure) and "CommandOrControl+Shift++" into two modifiers.
  const tokens = accelerator.split("+").map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return false;

  let hasModifier = false;
  let hasKey = false;
  for (const token of tokens) {
    const role = tokenRole(token);
    if (role === null) return false;
    if (role === "modifier") hasModifier = true;
    else hasKey = true;
  }
  return hasModifier && hasKey;
}