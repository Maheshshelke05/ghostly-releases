import { desktopCapturer, screen } from "electron";

export async function captureFullScreen(): Promise<string> {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;

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

  // 85% JPEG keeps code/text crisp for vision models at a much smaller payload.
  const jpegBuffer = sources[0].thumbnail.toJPEG(85);
  return `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`;
}
