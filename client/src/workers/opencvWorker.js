importScripts("/opencv.js");

const cvReady = new Promise((resolve, reject) => {
  const start = Date.now();
  const tick = () => {
    try {
      if (self.cv && typeof self.cv.Mat === "function") return resolve();
    } catch {}
    if (Date.now() - start > 15000)
      return reject(new Error("OpenCV init timeout"));
    setTimeout(tick, 50);
  };
  tick();
});

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function matToImageDataRGBA(mat) {
  if (mat.type() !== cv.CV_8UC4) {
    const tmp = new cv.Mat();
    if (mat.channels() === 3) {
      cv.cvtColor(mat, tmp, cv.COLOR_RGB2RGBA);
    } else if (mat.channels() === 1) {
      cv.cvtColor(mat, tmp, cv.COLOR_GRAY2RGBA);
    } else {
      mat.copyTo(tmp);
    }
    mat = tmp;
  }

  return new ImageData(
    new Uint8ClampedArray(mat.data),
    mat.cols,
    mat.rows
  );
}

self.onmessage = async (e) => {
  const { imageData } = e.data;

  try {
    await cvReady;

    const src = cv.matFromImageData(imageData); // RGBA
    const W = src.cols;
    const H = src.rows;

    const hsv = new cv.Mat();
    cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

    const lower = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [
      40, 60, 60, 0,
    ]);
    const upper = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [
      85, 255, 255, 255,
    ]);

    const mask = new cv.Mat();
    cv.inRange(hsv, lower, upper, mask);

    const kernel = cv.getStructuringElement(
      cv.MORPH_RECT,
      new cv.Size(3, 3)
    );
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
    cv.morphologyEx(mask, mask, cv.MORPH_DILATE, kernel);

    const labels = new cv.Mat();
    const stats = new cv.Mat();
    const centroids = new cv.Mat();
    const n = cv.connectedComponentsWithStats(
      mask,
      labels,
      stats,
      centroids,
      8,
      cv.CV_32S
    );

    const yMin = Math.floor(H * 0.22);
    const yMax = Math.floor(H * 0.80);

    let best = null;
    let bestScore = -1;

    for (let i = 1; i < n; i++) {
      const x = stats.intAt(i, 0);
      const y = stats.intAt(i, 1);
      const w = stats.intAt(i, 2);
      const h = stats.intAt(i, 3);
      const area = stats.intAt(i, 4);

      if (y < yMin || y > yMax) continue;
      if (x > W * 0.55) continue;
      if (area < 120) continue;
      if (h < 8 || h > 40) continue;

      const ar = w / h;
      if (ar < 1.2 || ar > 12) continue;

      const score =
        area + w * 2 - Math.abs(y - H * 0.4) * 0.1;

      if (score > bestScore) {
        bestScore = score;
        best = { x, y, w, h };
      }
    }

    if (!best) {
      cleanup();
      self.postMessage({ error: "Green player row not found" });
      return;
    }

    const rowH = clamp(Math.round(best.h * 3), 32, 90);
    const rowY = clamp(
      Math.round(best.y - rowH * 0.45),
      0,
      H - rowH
    );

    const rowRect = new cv.Rect(0, rowY, W, rowH);
    const crop = src.roi(rowRect);

    const canvas = new OffscreenCanvas(crop.cols, crop.rows);
    const ctx = canvas.getContext("2d");
    ctx.putImageData(matToImageDataRGBA(crop), 0, 0);

    const playerBlob = await canvas.convertToBlob({
      type: "image/png",
    });

    crop.delete();
    cleanup();

    self.postMessage({
      blob: playerBlob,
      debug: { rowY, rowH, W, H },
    });

    function cleanup() {
      src.delete();
      hsv.delete();
      lower.delete();
      upper.delete();
      mask.delete();
      labels.delete();
      stats.delete();
      centroids.delete();
      kernel.delete();
    }
  } catch (err) {
    self.postMessage({
      error: err?.message || String(err),
    });
  }
};
