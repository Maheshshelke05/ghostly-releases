import { desktopCapturer, screen, type BrowserWindow } from "electron";

export async function captureFullScreen(win?: BrowserWindow | null): Promise<string> {
  // The screen the overlay is actually on. This used to use
  // getDisplayNearestPoint(getCursorScreenPoint()) — the cursor, not the window:
  // drifting the mouse to another monitor (or the user starting the interview
  // with the cursor parked elsewhere) captured a screen the user isn't looking
  // at. The window is the authoritative "which display is this answer about"
  // signal, so match on its bounds. Callers that have no window fall back to the
  // primary display.
  const activeDisplay = win && !win.isDestroyed()
    ? screen.getDisplayMatching(win.getBounds())
    : screen.getPrimaryDisplay();
  const { width, height } = activeDisplay.size;

  // 1600px is what the renderer sends to the AI (imageCompressor's default), so
  // capture at that size directly instead of grabbing 2560px, JPEG-encoding it,
  // shipping ~1MB over IPC, and then downscaling it again in the renderer — the
  // extra capture/encode/transfer work only added latency to every screenshot.
  const MAX_WIDTH = 1600;
  const targetWidth = Math.min(width, MAX_WIDTH);
  const targetHeight = Math.round((targetWidth / width) * height);

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: targetWidth,
      height: targetHeight,
    },
  });

  if (sources.length === 0) {
    throw new Error("No screen source found");
  }

  // Match the source to the active display by its display_id (desktopCapturer's one
  // property that ties a capture source back to a specific electron `screen` display).
  // Falls back to the first source if a single-screen setup leaves it unset/unmatched.
  const match = sources.find((s) => s.display_id && String(activeDisplay.id) === s.display_id);
  const source = match ?? sources[0];

  // 85% JPEG keeps code/text crisp for vision models at a much smaller payload.
  // An empty thumbnail means Windows handed back no pixels — a locked screen, a
  // protected/DRM display, or a session that switched desktops. That used to be
  // encoded to a 0-byte "data:image/jpeg;base64," and shipped to the vision
  // model anyway, which then confidently answered "Nothing actionable" about an
  // image that was never captured.
  if (source.thumbnail.isEmpty()) {
    throw new Error(
      "Screen capture came back empty — the screen is locked or protected. Unlock it and try again.",
    );
  }
  const jpegBuffer = source.thumbnail.toJPEG(85);
  return `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`;
}
