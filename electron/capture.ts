import { desktopCapturer, screen } from "electron";

export async function captureFullScreen(): Promise<string> {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;

  // Max 2560px width for better text readability by vision models
  // Higher resolution = AI reads code/text more accurately
  const MAX_WIDTH = 2560;
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

  // 90% JPEG quality — better text readability for AI vision models
  // Trade-off: slightly larger payload but significantly better code/text recognition
  const jpegBuffer = sources[0].thumbnail.toJPEG(90);
  return `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`;
}
