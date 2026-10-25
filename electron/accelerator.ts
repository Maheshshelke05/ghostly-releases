// Electron-free accelerator validation (unit-tested in accelerator.test.ts).
// Rules mirror Electron's parser; a malformed string makes register() THROW, not return false.

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

// Printable ASCII 0x20-0x7E plus the control chars it accepts for backspace/tab/
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

/** True when Electron's parser accepts this string. Deliberately stricter in two
 *  safe directions: unknown tokens fail ("X+Dead+E" parses as Ctrl+E) and a modifier is required. */
export function isValidAccelerator(accelerator: unknown): accelerator is string {
  if (typeof accelerator !== "string" || accelerator.length === 0) return false;
  // StringToAccelerator() rejects any non-ASCII string outright.
  if (!ASCII.test(accelerator)) return false;

  // Same splitting Electron does: on "+", trimmed, empties dropped. This turns
  // "CommandOrControl+ " into "CommandOrControl" (no key → conversion failure).
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