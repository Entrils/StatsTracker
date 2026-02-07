import { parseMatchResult } from "@/utils/upload/parsers";

export function preprocessForOCR(srcCanvas, threshold = 135) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.floor(srcCanvas.width * 2));
  c.height = Math.max(1, Math.floor(srcCanvas.height * 2));

  const ctx = c.getContext("2d");
  ctx.drawImage(srcCanvas, 0, 0, c.width, c.height);

  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    const gray = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    const v = gray > threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }

  ctx.putImageData(img, 0, 0);
  return c;
}

export function preprocessForMatchId(srcCanvas) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.floor(srcCanvas.width * 2.4));
  c.height = Math.max(1, Math.floor(srcCanvas.height * 2.4));

  const ctx = c.getContext("2d");
  ctx.drawImage(srcCanvas, 0, 0, c.width, c.height);

  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    const gray = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    const v = gray > 140 ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }

  ctx.putImageData(img, 0, 0);
  return c;
}

export async function loadBitmapSafe(fileLike) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(fileLike);
    } catch {
      // fallback below
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fileLike);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image decode failed"));
    };
    img.src = url;
  });
}

export async function detectMatchResult(worker, bitmap) {
  const cropVariants = [
    { x: 0.25, y: 0.0, w: 0.5, h: 0.18 },
    { x: 0.2, y: 0.0, w: 0.6, h: 0.22 },
    { x: 0.15, y: 0.0, w: 0.7, h: 0.25 },
    { x: 0.0, y: 0.0, w: 1.0, h: 0.2 },
  ];
  const thresholds = [120, 135, 150];

  await worker.setParameters({
    tessedit_char_whitelist:
      "ABCDEFGHIJKLMNOPQRSTUVWXYZÉÈÊËÀÂÎÏÔÛÙÜÇÄÖÜßАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЫЬЭЮЯ",
    preserve_interword_spaces: "1",
  });

  for (const crop of cropVariants) {
    const resultCanvas = document.createElement("canvas");
    resultCanvas.width = Math.max(1, Math.floor(bitmap.width * crop.w));
    resultCanvas.height = Math.max(1, Math.floor(bitmap.height * crop.h));
    const rctx = resultCanvas.getContext("2d");
    rctx.drawImage(
      bitmap,
      Math.floor(bitmap.width * crop.x),
      Math.floor(bitmap.height * crop.y),
      Math.floor(bitmap.width * crop.w),
      Math.floor(bitmap.height * crop.h),
      0,
      0,
      resultCanvas.width,
      resultCanvas.height
    );

    for (const threshold of thresholds) {
      const processed = preprocessForOCR(resultCanvas, threshold);
      const blob = await new Promise((r) => processed.toBlob(r, "image/png"));
      const ocr = await worker.recognize(blob);
      const text = ocr?.data?.text || "";
      const parsed = parseMatchResult(text);
      if (parsed) return parsed;
    }
  }

  return null;
}


