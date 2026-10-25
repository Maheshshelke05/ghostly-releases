/** Win32 capture exclusion via SetWindowDisplayAffinity (koffi FFI, no gyp build):
 * WDA_EXCLUDEFROMCAPTURE on Win10 2004+, WDA_MONITOR on older builds. */
import { app, BrowserWindow } from "electron";
import log from "electron-log";

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

/** HWND from getNativeWindowHandle(): 8 bytes on x64/arm64, 4 on x86. */
function readHWND(hwndBuffer: Buffer): number {
  if (process.arch === "x64" || process.arch === "arm64") {
    // 8-byte handle; values are small, so Number conversion is safe.
    return Number(hwndBuffer.readBigUInt64LE(0));
  }
  return hwndBuffer.readUInt32LE(0);
}

// HWNDs already stealthed. The flag persists for the HWND's whole life (show/hide/
// focus never reset it), and repeated calls glitch DWM into dropping the window entirely.
const appliedHWnds = new Set<number>();

/** Forget the HWND when its window closes: Windows recycles handles, and a stale
 * entry would make applyStealthMode() skip an unrelated new window. */
function rememberHWnd(win: BrowserWindow, hwnd: number): void {
  appliedHWnds.add(hwnd);
  win.once("closed", () => {
    appliedHWnds.delete(hwnd);
    lastNudgeAt.delete(hwnd);
  });
}

/** DWM can hold a stale frame after SetWindowDisplayAffinity, making the window vanish
 * from the user's own screen; an opacity nudge (1 -> 0.999 -> 1) forces a recomposite. */
function nudgeRepaint(win: BrowserWindow): void {
  try {
    if (win.isDestroyed()) return;
    const opacity = win.getOpacity();
    win.setOpacity(Math.max(0, opacity - 0.001));
    setTimeout(() => {
      try {
        if (win.isDestroyed()) return;
        // Re-read instead: hiding the overlay (Ctrl+B) during the 30ms set opacity to 0,
        // and restoring the stale value popped it back onto a shared screen.
        const current = win.getOpacity();
        if (current <= 0.001) return;
        win.setOpacity(Math.min(1, current));
      } catch {
      }
    }, 30);
  } catch {
  }
}

/** Applies the strongest available capture exclusion; only calls the native API once
 * per HWND, then nudges a repaint so the window can't stick invisible. */
export function applyStealthMode(win: BrowserWindow): void {
  // Dev-only escape hatch: WDA_EXCLUDEFROMCAPTURE blocks every capture API, so UI
  // verification needs this. Requires the env var AND a non-packaged build.
  if (!app.isPackaged && process.env.GHOSTLY_DISABLE_STEALTH === "1") return;
  // Deferred timers can call this on a window destroyed in the meantime; throwing
  // on a destroyed BrowserWindow would crash the process.
  if (win.isDestroyed()) return;
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

    if (appliedHWnds.has(hwnd)) return;

    let success = SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
    if (success) {
      rememberHWnd(win, hwnd);
      log.info("[Ghostly Stealth] Applied WDA_EXCLUDEFROMCAPTURE - fully invisible to capture");
      setTimeout(() => nudgeRepaint(win), 50);
      return;
    }

    success = SetWindowDisplayAffinity(hwnd, WDA_MONITOR);
    if (success) {
      rememberHWnd(win, hwnd);
      log.info("[Ghostly Stealth] Warning: WDA_MONITOR applied - standard stealth");
      setTimeout(() => nudgeRepaint(win), 50);
      return;
    }

    console.warn(
      "[Ghostly Stealth] Warning: SetWindowDisplayAffinity failed, relying on Electron fallback",
    );
  } catch (err) {
    console.warn("[Ghostly Stealth] FFI call error:", err);
  }
}

const lastNudgeAt = new Map<number, number>();

/** Cheap throttled safety net for show/focus/restore handlers: only calls setOpacity,
 * so the 2s throttle avoids pointless work rather than a compositor risk. */
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
  }
}

/** Remove capture exclusion (restore normal window behavior). */
export function removeStealthMode(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  win.setContentProtection(false);

  if (process.platform !== "win32") return;

  const SetWindowDisplayAffinity = getSetWindowDisplayAffinity();
  if (!SetWindowDisplayAffinity) return;

  try {
    const hwnd = readHWND(win.getNativeWindowHandle());
    SetWindowDisplayAffinity(hwnd, WDA_NONE);
    appliedHWnds.delete(hwnd);
  } catch {
  }
}
