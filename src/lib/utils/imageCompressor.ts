/**
 * Image compressor utility for Ghostly AI.
 * Downscales full-res screenshots and re-encodes them as JPEG so the AI Vision
 * call isn't sending a multi-megabyte PNG.
 *
 * The old 800px / 70% setting was a big win for payload size but made small
 * on-screen text (code, constraints, MCQ options) blurry enough that the model
 * misread or guessed at it — on a 1920px-wide screen that's a 0.42x scale, so
 * 12px code lands at ~5px. 1600px keeps typical code/text crisp (about 2x the
 * linear resolution) while still cutting a ~4MB PNG to a few hundred KB.
 */
export const SCREENSHOT_MAX_WIDTH = 1600;
export const SCREENSHOT_QUALITY = 0.82;

export async function compressScreenshot(
  base64Data: string,
  maxWidth = SCREENSHOT_MAX_WIDTH,
  quality = SCREENSHOT_QUALITY
): Promise<string> {
  return new Promise((resolve) => {
    if (!base64Data) return resolve(base64Data);

    const img = new Image();
    const src = base64Data.startsWith("data:")
      ? base64Data
      : `data:image/png;base64,${base64Data}`;

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(base64Data);

      // Smooth rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      // Encode as JPEG at target quality
      const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve(compressedDataUrl);
    };

    img.onerror = () => {
      resolve(base64Data);
    };

    img.src = src;
  });
}
