import { desktopCapturer, screen, type BrowserWindow } from "electron";

export async function captureFullScreen(win?: BrowserWindow | null): Promise<string> {
  // Match on the window's own display, not the cursor's: the mouse drifts to
  // another monitor and captures a screen the user isn't looking at.
  const activeDisplay = win && !win.isDestroyed()
    ? screen.getDisplayMatching(win.getBounds())
    : screen.getPrimaryDisplay();
  const { width, height } = activeDisplay.size;

  // 1600px matches imageCompressor's default, so capture at that size directly —
  // grabbing 2560px and downscaling in the renderer only adds capture/IPC latency.
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

  // display_id is the only property tying a capture source to an electron `screen`
  // display; fall back to the first source if it's unset or unmatched.
  const match = sources.find((s) => s.display_id && String(activeDisplay.id) === s.display_id);
  const source = match ?? sources[0];

  // 85% JPEG keeps code/text crisp for vision models at a smaller payload; an empty
  // thumbnail means Windows returned no pixels (locked, DRM-protected, desktop switched).
  if (source.thumbnail.isEmpty()) {
    throw new Error(
      "Screen capture came back empty — the screen is locked or protected. Unlock it and try again.",
    );
  }
  const jpegBuffer = source.thumbnail.toJPEG(85);
  return `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`;
}
