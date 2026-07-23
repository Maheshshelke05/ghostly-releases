/**
 * Image compressor utility for Ghostly AI.
 * Downscales full-res screenshots to max 800px width @ 70% JPEG quality,
 * reducing payload sizes from ~4MB to ~40KB for 3x-5x faster AI Vision API calls.
 */

export async function compressScreenshot(
  base64Data: string,
  maxWidth = 800,
  quality = 0.7
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
