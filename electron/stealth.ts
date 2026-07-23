/**
 * Native Win32 stealth utilities for Ghostly.
 *
 * Uses SetWindowDisplayAffinity (user32.dll) to apply the strongest
 * capture-exclusion flag available on the current Windows version.
 *
 * Flag hierarchy:
 *   WDA_EXCLUDEFROMCAPTURE (0x11) — Win10 2004+ — completely invisible in any capture
 *   WDA_MONITOR            (0x01) — Win10 older  — hidden from most capture APIs
 *   WDA_NONE               (0x00) — normal window
 *
 * Uses `koffi` for FFI (no gyp compilation needed, works on all Node versions).
 */
import { BrowserWindow } from "electron";

// Win32 affinity constants
const WDA_NONE = 0x00000000;
const WDA_MONITOR = 0x00000001;
const WDA_EXCLUDEFROMCAPTURE = 0x00000011;

// Cache the koffi function so we don't reload the DLL every call
let cachedSetWindowDisplayAffinity:
  | ((hwnd: number, affinity: number) => number)
  | null = null;
let koffiAvailable: boolean | null = null;

function getSetWindowDisplayAffinity():
  | ((hwnd: number, affinity: number) => number)
  | null {
  if (koffiAvailable === false) return null;
  if (cachedSetWindowDisplayAffinity) return cachedSetWindowDisplayAffinity;

  try {
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");

    // HWND is a pointer-sized integer — use intptr for the handle value
    cachedSetWindowDisplayAffinity = user32.func(
      "int __stdcall SetWindowDisplayAffinity(intptr hwnd, uint32 dwAffinity)",
    );
    koffiAvailable = true;
    return cachedSetWindowDisplayAffinity;
  } catch (err) {
    console.warn("[Ghostly Stealth] koffi not available:", err);
    koffiAvailable = false;
    return null;
  }
}

/**
 * Extract the HWND integer value from Electron's getNativeWindowHandle() Buffer.
 * On x64 Windows, HWND is 8 bytes; on x86 it's 4 bytes.
 */
function readHWND(hwndBuffer: Buffer): number {
  if (process.arch === "x64" || process.arch === "arm64") {
    // 8-byte handle — read as BigInt, convert to Number
    // Window handles are small values, safe to convert
    return Number(hwndBuffer.readBigUInt64LE(0));
  }
  return hwndBuffer.readUInt32LE(0);
}

// HWNDs for which SetWindowDisplayAffinity has already succeeded.
// The affinity flag persists for the entire life of the HWND — Windows does NOT
// reset it on show/hide/focus/blur/minimize/restore. Re-issuing the native call on
// every one of those events (as this used to do, guarded only by a 3s time debounce)
// still made repeated calls during normal navigation and glitched the DWM compositor
// badly enough that the window would drop out of its own screen's rendering too.
// Calling it once per HWND for real removes the repeat calls entirely instead of just
// throttling them.
const appliedHWnds = new Set<number>();

/**
 * Force Windows' DWM to recomposite this window right after its display-affinity flag
 * changes. SetWindowDisplayAffinity can leave the compositor holding a stale frame for
 * the HWND it was just applied to, which is what makes the window vanish from the
 * user's own screen. An imperceptible opacity nudge (1 -> 0.999 -> 1) forces a fresh
 * composite pass without any visible flicker, and reliably brings the window back.
 */
function nudgeRepaint(win: BrowserWindow): void {
  try {
    if (win.isDestroyed()) return;
    const opacity = win.getOpacity();
    win.setOpacity(Math.max(0, opacity - 0.001));
    setTimeout(() => {
      try {
        if (!win.isDestroyed()) win.setOpacity(opacity);
      } catch {
        // Best-effort
      }
    }, 30);
  } catch {
    // Best-effort
  }
}

/**
 * Apply the strongest available capture exclusion to a BrowserWindow.
 * Only ever issues the native SetWindowDisplayAffinity call once per HWND — safe to
 * call from show/focus/restore handlers as a no-op safety net without risking the
 * compositor glitch that repeated calls caused. Every successful call is followed by a
 * repaint nudge so the window can never get stuck invisible on the real screen.
 */
export function applyStealthMode(win: BrowserWindow): void {
  // Always set Electron's built-in protection as baseline (uses WDA_MONITOR internally)
  win.setContentProtection(true);

  if (process.platform !== "win32") {
    // macOS: setContentProtection(true) already calls NSWindowSharingType.none
    return;
  }

  const SetWindowDisplayAffinity = getSetWindowDisplayAffinity();
  if (!SetWindowDisplayAffinity) return;

  try {
    const hwndBuffer = win.getNativeWindowHandle();
    const hwnd = readHWND(hwndBuffer);

    // Already applied successfully for this window handle — nothing to do.
    if (appliedHWnds.has(hwnd)) return;

    // Try strongest flag first — WDA_EXCLUDEFROMCAPTURE (Win10 2004+)
    let success = SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
    if (success) {
      appliedHWnds.add(hwnd);
      console.log(
        "[Ghostly Stealth] ✅ WDA_EXCLUDEFROMCAPTURE applied — fully invisible to capture",
      );
      setTimeout(() => nudgeRepaint(win), 50);
      return;
    }

    // Fall back to WDA_MONITOR for older Windows builds
    success = SetWindowDisplayAffinity(hwnd, WDA_MONITOR);
    if (success) {
      appliedHWnds.add(hwnd);
      console.log(
        "[Ghostly Stealth] ⚠️ WDA_MONITOR applied — standard stealth",
      );
      setTimeout(() => nudgeRepaint(win), 50);
      return;
    }

    console.warn(
      "[Ghostly Stealth] ❌ SetWindowDisplayAffinity failed, relying on Electron fallback",
    );
  } catch (err) {
    console.warn("[Ghostly Stealth] FFI call error:", err);
  }
}

const lastNudgeAt = new Map<number, number>();

/**
 * Cheap, throttled safety net — call freely from show/focus/restore handlers. Unlike
 * applyStealthMode (which touches the native API at most once per HWND), this only
 * ever calls Electron's own setOpacity, so it's safe to run on every such event; it's
 * throttled purely to avoid pointless work, not to dodge a compositor risk.
 */
export function safeguardVisibility(win: BrowserWindow): void {
  if (process.platform !== "win32") return;
  try {
    if (win.isDestroyed()) return;
    const hwndBuffer = win.getNativeWindowHandle();
    const hwnd = readHWND(hwndBuffer);
    const now = Date.now();
    if (now - (lastNudgeAt.get(hwnd) || 0) < 2000) return;
    lastNudgeAt.set(hwnd, now);
    nudgeRepaint(win);
  } catch {
    // Best-effort
  }
}

/**
 * Remove capture exclusion (restore normal window behavior).
 */
export function removeStealthMode(win: BrowserWindow): void {
  win.setContentProtection(false);

  if (process.platform !== "win32") return;

  const SetWindowDisplayAffinity = getSetWindowDisplayAffinity();
  if (!SetWindowDisplayAffinity) return;

  try {
    const hwnd = readHWND(win.getNativeWindowHandle());
    SetWindowDisplayAffinity(hwnd, WDA_NONE);
    appliedHWnds.delete(hwnd);
  } catch {
    // Best-effort
  }
}
