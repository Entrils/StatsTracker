function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

export async function fileToOptimizedDataUrl(file, options = {}) {
  const {
    maxLength = 850_000,
    maxSide = 768,
    minSide = 256,
    startQuality = 0.85,
    minQuality = 0.55,
    maxAttempts = 6,
    tooLargeMessage = "Image is too large. Use a smaller image.",
  } = options;

  const originalDataUrl = await readFileAsDataUrl(file);
  if (originalDataUrl.length <= maxLength) {
    return originalDataUrl;
  }

  const img = await loadImage(originalDataUrl);
  let side = maxSide;
  let quality = startQuality;
  let attempt = 0;

  while (attempt < maxAttempts) {
    const ratio = Math.min(1, side / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * ratio));
    const height = Math.max(1, Math.round(img.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    ctx.drawImage(img, 0, 0, width, height);

    const optimized = canvas.toDataURL("image/jpeg", quality);
    if (optimized.length <= maxLength) {
      return optimized;
    }

    quality = Math.max(minQuality, quality - 0.1);
    side = Math.max(minSide, Math.round(side * 0.82));
    attempt += 1;
  }

  throw new Error(tooLargeMessage);
}
