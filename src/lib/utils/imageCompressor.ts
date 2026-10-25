// Downscales screenshots and re-encodes JPEG for the vision call. 1600px keeps small text readable;
// at 800px code and MCQ options blurred enough that the model misread them.
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

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve(compressedDataUrl);
    };

    img.onerror = () => {
      resolve(base64Data);
    };

    img.src = src;
  });
}
