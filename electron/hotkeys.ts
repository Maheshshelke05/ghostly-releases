import { globalShortcut, BrowserWindow } from "electron";
import { captureFullScreen } from "./capture";

const MOVE_STEP = 25;

export function registerHotkeys(win: BrowserWindow): void {
  // Capture + Solve combined — Ctrl+Shift+Enter
  globalShortcut.register("CommandOrControl+Shift+Return", async () => {
    try {
      const wasVisible = win.getOpacity() > 0;
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
      }
      win.webContents.send("ghostly:screenshot", base64);
      setTimeout(() => win.webContents.send("ghostly:solve"), 100);
    } catch (err) {
      console.error("[Ghostly] Capture+Solve failed:", err);
      if (win.getOpacity() === 0) {
        win.setOpacity(1);
        win.setIgnoreMouseEvents(true, { forward: true });
        win.focus();
      }
    }
  });

  // Screenshot — Ctrl+E
  const regE = globalShortcut.register("CommandOrControl+E", async () => {
    try {
      const wasVisible = win.getOpacity() > 0;
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
      }
      win.webContents.send("ghostly:screenshot", base64);
      console.log("[Ghostly] Screenshot captured and sent to renderer");
    } catch (err) {
      console.error("[Ghostly] Failed to capture screen:", err);
      if (win.getOpacity() === 0) {
        win.setOpacity(1);
        win.setIgnoreMouseEvents(true, { forward: true });
        win.focus();
      }
    }
  });
  console.log("[Ghostly] Ctrl+E registered:", regE);

  // Solve / Ask AI — Ctrl+Enter
  const regEnter = globalShortcut.register("CommandOrControl+Return", () => {
    if (win.getOpacity() === 0) {
      win.setOpacity(1);
      win.setIgnoreMouseEvents(true, { forward: true });
    }
    win.focus();
    win.webContents.send("ghostly:solve");
  });
  console.log("[Ghostly] Ctrl+Enter registered:", regEnter);

  // Show / Hide — Ctrl+B
  const regB = globalShortcut.register("CommandOrControl+B", () => {
    if (win.getOpacity() > 0) {
      // Hide — click-through completely
      win.setOpacity(0);
      win.blur();
      win.setIgnoreMouseEvents(true, { forward: false });
    } else {
      // Show — enable mouse fully so all pages work
      win.setOpacity(1);
      win.setIgnoreMouseEvents(false); // Full mouse enable
      win.focus();
      // Renderer ko bhi signal bhejo
      win.webContents.send("ghostly:show");
    }
  });
  console.log("[Ghostly] Ctrl+B registered:", regB);

  // Start Over — Ctrl+G
  const regG = globalShortcut.register("CommandOrControl+G", () => {
    win.webContents.send("ghostly:start-over");
    // Ensure mouse is re-enabled after returning from interview screen
    setTimeout(() => {
      win.setIgnoreMouseEvents(false);
      win.webContents.send("ghostly:show");
    }, 200);
  });
  console.log("[Ghostly] Ctrl+G registered:", regG);

  // Move Up/Down/Left/Right (Ctrl + arrow keys)
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

  console.log("[Ghostly] All hotkeys registered");
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll();
}
