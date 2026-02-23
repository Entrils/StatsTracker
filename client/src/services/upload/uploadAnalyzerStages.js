import imageCompression from "browser-image-compression";
import { extractMatchId, parseFragpunkText } from "@/utils/upload/parsers";
import { detectMatchResult, loadBitmapSafe, preprocessForMatchId } from "@/utils/upload/ocr";
import {
  ensureMatchDocument,
  ensurePlayerDocument,
  requestOcr,
  saveUserMatch,
  triggerLeaderboardUpdate,
  userMatchExists,
} from "@/services/upload/uploadService";

export const mapLangToOcr = (lang) =>
  lang === "ru" ? "rus" : lang === "fr" ? "fre" : lang === "de" ? "ger" : "eng";

export const throwIfAborted = (signal) => {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
};

export const createOpenCvCropRunner = (opencvWorker) => (imageData, signal) =>
  new Promise((resolve, reject) => {
    const cleanup = () => {
      opencvWorker.onmessage = null;
      opencvWorker.onerror = null;
    };

    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    if (signal) signal.addEventListener("abort", onAbort, { once: true });

    opencvWorker.onerror = (event) => {
      cleanup();
      if (signal) signal.removeEventListener("abort", onAbort);
      reject(event?.error || new Error("OpenCV worker failed"));
    };

    opencvWorker.onmessage = (event) => {
      cleanup();
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve(event.data);
    };

    opencvWorker.postMessage({ imageData });
  });

export const readBlobAsDataUrl = (blob, signal) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    const onAbort = () => {
      try {
        reader.abort();
      } catch {
        // ignore
      }
      reject(new DOMException("Aborted", "AbortError"));
    };

    if (signal) signal.addEventListener("abort", onAbort, { once: true });

    reader.onerror = () => {
      if (signal) signal.removeEventListener("abort", onAbort);
      reject(reader.error);
    };
    reader.onload = () => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });

export async function runSingleUploadStage({
  file,
  index,
  total,
  t,
  lang,
  user,
  claims,
  idToken,
  worker,
  runOpenCvCrop,
  requestManualResult,
  signal,
  setStatus,
  setStatusTone,
  setOcrRemaining,
}) {
  throwIfAborted(signal);

  const suffix = total > 1 ? ` (${index + 1}/${total})` : "";
  const displayName = file?.name || `${t.upload.fileLabel || "File"} ${index + 1}`;

  setStatus(`${t.upload.compressing}${suffix}`);
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.9,
    maxWidthOrHeight: 1280,
    useWebWorker: true,
  });
  throwIfAborted(signal);

  const bitmap = await loadBitmapSafe(compressed);
  throwIfAborted(signal);

  setStatus(`${t.upload.ocr || "OCR..."}${suffix}`);
  setStatusTone("neutral");

  let matchResult = await detectMatchResult(worker, bitmap);
  if (!matchResult) {
    setStatus(`${t.upload.manualResultPrompt || "Select match result manually"}${suffix}`);
    const manualChoice = await requestManualResult(displayName);
    if (!manualChoice) {
      return {
        name: displayName,
        status: "skip",
        code: "manual_skipped",
        message: t.upload.statusManualSkipped || "Result not selected",
      };
    }
    matchResult = manualChoice;
  }
  throwIfAborted(signal);

  await worker.setParameters({
    tessedit_char_whitelist: "0123456789abcdef",
    preserve_interword_spaces: "1",
  });

  const matchCanvas = document.createElement("canvas");
  matchCanvas.width = bitmap.width;
  matchCanvas.height = Math.floor(bitmap.height * 0.45);
  const mctx = matchCanvas.getContext("2d");
  mctx.drawImage(
    bitmap,
    0,
    0,
    bitmap.width,
    matchCanvas.height,
    0,
    0,
    matchCanvas.width,
    matchCanvas.height
  );
  const processed = preprocessForMatchId(matchCanvas);
  const matchBlob = await new Promise((resolve) => processed.toBlob(resolve, "image/png"));
  throwIfAborted(signal);

  const { data } = await worker.recognize(matchBlob);
  const matchId = extractMatchId(data.text);
  if (!matchId) {
    return {
      name: displayName,
      status: "error",
      code: "match_id_missing",
      message: t.upload.statusMatchIdFailed || "Match ID not found",
    };
  }

  setStatus(`${t.upload.processing || "Processing..."}${suffix}`);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const opencvResult = await runOpenCvCrop(imageData, signal);
  const { blob, error } = opencvResult || {};
  if (error || !blob) {
    throw new Error(error || "OpenCV failed to crop player row");
  }
  throwIfAborted(signal);

  const base64Image = await readBlobAsDataUrl(blob, signal);

  let ocrResponse;
  try {
    ocrResponse = await requestOcr(base64Image, mapLangToOcr(lang), idToken, signal);
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    return {
      name: displayName,
      status: "error",
      code: "backend_unavailable",
      message: t.upload.backendUnavailable || "Backend unavailable / network error",
    };
  }

  if (!ocrResponse.ok) {
    if (ocrResponse.status === 403) {
      const err = await ocrResponse.json().catch(() => null);
      if (err?.error === "Banned") {
        return {
          name: displayName,
          status: "error",
          code: "banned",
          message: t.upload.statusBanned || "Banned",
        };
      }
    }
    if (ocrResponse.status === 413) {
      return {
        name: displayName,
        status: "error",
        code: "too_large",
        message: t.upload.statusTooLarge || "File too large",
      };
    }
    const err = await ocrResponse.json().catch(() => null);
    if (err?.remaining !== undefined) setOcrRemaining(err.remaining);
    return {
      name: displayName,
      status: "error",
      code: "ocr_failed",
      message: t.upload.statusOcrFailed || "OCR failed",
    };
  }

  const ocrJson = await ocrResponse.json();
  if (ocrJson?.remaining !== undefined) setOcrRemaining(ocrJson.remaining);
  if (ocrJson?.IsErroredOnProcessing) {
    return {
      name: displayName,
      status: "error",
      code: "ocr_failed",
      message: t.upload.statusOcrFailed || "OCR failed",
    };
  }
  throwIfAborted(signal);

  const parsed = parseFragpunkText(
    ocrJson.ParsedResults?.[0]?.ParsedText || "",
    user.uid,
    claims?.username || user.displayName || user.email || user.uid
  );

  if (!parsed) {
    return {
      name: displayName,
      status: "error",
      code: "player_not_recognized",
      message: t.upload.statusPlayerFailed || "Player row not recognized",
    };
  }

  if (matchResult !== "victory" && matchResult !== "defeat") {
    const manualChoice = await requestManualResult(displayName);
    if (manualChoice !== "victory" && manualChoice !== "defeat") {
      return {
        name: displayName,
        status: "skip",
        code: "manual_skipped",
        message: t.upload.statusManualSkipped || "Result not selected",
      };
    }
    matchResult = manualChoice;
  }

  if (await userMatchExists(user.uid, matchId)) {
    return {
      name: displayName,
      status: "skip",
      code: "already_uploaded",
      message: t.upload.statusAlready || "Already uploaded",
    };
  }

  await ensureMatchDocument(matchId, matchResult);
  await ensurePlayerDocument(matchId, user.uid, parsed);

  const finalMatch = { matchId, result: matchResult ?? null, ...parsed };
  await saveUserMatch(user.uid, matchId, finalMatch);
  await triggerLeaderboardUpdate(matchId, idToken);

  return {
    name: displayName,
    status: "ok",
    code: "ok",
    message: t.upload.statusOk || "Uploaded",
    finalMatch,
  };
}
