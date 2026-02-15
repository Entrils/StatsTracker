import { useCallback } from "react";
import imageCompression from "browser-image-compression";
import { buildAchievements } from "@/utils/achievements";
import {
  extractMatchId,
  parseFragpunkText,
} from "@/utils/upload/parsers";
import {
  detectMatchResult,
  loadBitmapSafe,
  preprocessForMatchId,
} from "@/utils/upload/ocr";
import {
  ensureMatchDocument,
  ensurePlayerDocument,
  fetchFriendsMeta,
  fetchUserMatches,
  requestOcr,
  saveUserMatch,
  triggerLeaderboardUpdate,
  userMatchExists,
} from "@/services/upload/uploadService";

export default function useUploadAnalyzer({
  t,
  lang,
  user,
  claims,
  selectedFiles,
  selectedFile,
  ensureTesseract,
  requestManualResult,
  pushToast,
  setLoading,
  setStatus,
  setStatusTone,
  setOcrRemaining,
  setBatchResults,
  setSelectedFile,
  setImageUrl,
  setLastMatch,
}) {
  return useCallback(async () => {
    const queue = selectedFiles.length
      ? selectedFiles
      : selectedFile
      ? [selectedFile]
      : [];
    if (!queue.length) return;

    setLoading(true);
    setStatus(t.upload.processing || "Processing...");
    setStatusTone("neutral");
    setOcrRemaining(null);
    setBatchResults([]);

    let opencvWorker = null;

    try {
      const total = queue.length;
      const worker = await ensureTesseract();
      const uid = user.uid;
      opencvWorker = new Worker(
        new URL("../../workers/opencvWorker.js", import.meta.url),
        { type: "classic" }
      );

      const runOpenCvCrop = (imageData) =>
        new Promise((resolve, reject) => {
          const cleanup = () => {
            opencvWorker.onmessage = null;
            opencvWorker.onerror = null;
          };

          opencvWorker.onerror = (event) => {
            cleanup();
            reject(event?.error || new Error("OpenCV worker failed"));
          };

          opencvWorker.onmessage = (event) => {
            cleanup();
            resolve(event.data);
          };

          opencvWorker.postMessage({ imageData });
        });

      let matchesList = await fetchUserMatches(uid);
      const idToken = user ? await user.getIdToken() : null;
      const { friendCount, friendDates } = await fetchFriendsMeta(idToken);
      const baseAchievements = buildAchievements({
        matches: matchesList,
        friendDates,
        friendCount,
      });

      const getUnlockedIds = (achievementsData) => {
        const ids = new Set();
        Object.entries(achievementsData || {}).forEach(([key, list]) => {
          (list || []).forEach((item) => {
            if (item.unlocked) ids.add(`${key}:${item.value}`);
          });
        });
        return ids;
      };

      const formatAchievementValue = (key, value) => {
        if (key === "matches") {
          return `${value} ${t.achievements?.matchesLabel || "matches"}`;
        }
        if (key === "friends") {
          return `${value} ${t.achievements?.friendsLabel || "friends"}`;
        }
        if (key === "kills") {
          return `${value} ${t.achievements?.killsLabel || "kills"}`;
        }
        return `${value} ${t.achievements?.streakLabel || "wins"}`;
      };

      const categoryTitle = (key) => {
        if (key === "matches") {
          return t.achievements?.matchesTitle || "Uploaded matches";
        }
        if (key === "friends") return t.achievements?.friendsTitle || "Friends";
        if (key === "kills") return t.achievements?.killsTitle || "Max kills";
        return t.achievements?.streakTitle || "Win streak";
      };

      let unlockedIds = getUnlockedIds(baseAchievements);
      for (let index = 0; index < queue.length; index += 1) {
        const file = queue[index];
        const suffix = total > 1 ? ` (${index + 1}/${total})` : "";
        const displayName =
          file?.name || `${t.upload.fileLabel || "File"} ${index + 1}`;
        setSelectedFile(file);
        setImageUrl(file ? URL.createObjectURL(file) : null);

        setStatus(`${t.upload.compressing}${suffix}`);
        const compressed = await imageCompression(file, {
          maxSizeMB: 0.9,
          maxWidthOrHeight: 1280,
          useWebWorker: true,
        });

        const bitmap = await loadBitmapSafe(compressed);

        setStatus(`${t.upload.ocr || "OCR..."}${suffix}`);
        setStatusTone("neutral");

        let matchResult = await detectMatchResult(worker, bitmap);
        if (!matchResult) {
          setStatus(
            `${t.upload.manualResultPrompt || "Select match result manually"}${suffix}`
          );
          setStatusTone("neutral");
          const manualChoice = await requestManualResult(displayName);
          if (!manualChoice) {
            setStatus(
              `${t.upload.statusManualSkipped || "Not successful (Result not selected)"}${suffix}`
            );
            setStatusTone("bad");
            setBatchResults((prev) => [
              ...prev,
              {
                name: displayName,
                status: "skip",
                message: t.upload.statusManualSkipped || "Result not selected",
              },
            ]);
            continue;
          }
          matchResult = manualChoice;
        }

        await worker.setParameters({
          tessedit_char_whitelist: "0123456789abcdef",
          preserve_interword_spaces: "1",
        });

        setStatus(`${t.upload.ocr || "OCR..."}${suffix}`);
        setStatusTone("neutral");

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
        const matchBlob = await new Promise((resolve) =>
          processed.toBlob(resolve, "image/png")
        );

        await worker.setParameters({
          tessedit_char_whitelist: "0123456789abcdef",
          preserve_interword_spaces: "1",
        });

        const { data } = await worker.recognize(matchBlob);
        const matchId = extractMatchId(data.text);

        if (!matchId) {
          setStatus(
            `${t.upload.statusMatchIdFailed || "Not successful (Match ID not found)"}${suffix}`
          );
          setStatusTone("bad");
          setBatchResults((prev) => [
            ...prev,
            {
              name: displayName,
              status: "error",
              message: t.upload.statusMatchIdFailed || "Match ID not found",
            },
          ]);
          continue;
        }

        setStatus(`${t.upload.processing || "Processing..."}${suffix}`);
        setStatusTone("neutral");

        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const opencvResult = await runOpenCvCrop(imageData);

        const { blob, error } = opencvResult || {};
        if (error || !blob) {
          throw new Error(error || "OpenCV failed to crop player row");
        }

        setStatus(`${t.upload.ocr || "OCR..."}${suffix}`);
        setStatusTone("neutral");

        const reader = new FileReader();
        const base64Image = await new Promise((resolve, reject) => {
          reader.onerror = () => reject(reader.error);
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });

        let ocrResponse;
        try {
          ocrResponse = await requestOcr(
            base64Image,
            lang === "ru"
              ? "rus"
              : lang === "fr"
              ? "fre"
              : lang === "de"
              ? "ger"
              : "eng",
            idToken
          );
        } catch {
          setStatus(
            `${t.upload.statusOtherFailed || "Not successful (Other error)"}${suffix}`
          );
          setStatusTone("bad");
          setBatchResults((prev) => [
            ...prev,
            {
              name: displayName,
              status: "error",
              message:
                t.upload.backendUnavailable || "Backend unavailable / network error",
            },
          ]);
          continue;
        }

        if (!ocrResponse.ok) {
          if (ocrResponse.status === 403) {
            const err = await ocrResponse.json().catch(() => null);
            if (err?.error === "Banned") {
              setStatus(`${t.upload.statusBanned || "Not successful (Banned)"}${suffix}`);
              setStatusTone("bad");
              setBatchResults((prev) => [
                ...prev,
                {
                  name: displayName,
                  status: "error",
                  message: t.upload.statusBanned || "Banned",
                },
              ]);
              continue;
            }
          }
          if (ocrResponse.status === 413) {
            setStatus(
              `${t.upload.statusTooLarge || "File is too large (max 2MB)"}${suffix}`
            );
            setStatusTone("bad");
            setBatchResults((prev) => [
              ...prev,
              {
                name: displayName,
                status: "error",
                message: t.upload.statusTooLarge || "File too large",
              },
            ]);
            continue;
          }
          const err = await ocrResponse.json().catch(() => null);
          if (err?.remaining !== undefined) setOcrRemaining(err.remaining);
          setStatus(`${t.upload.statusOcrFailed || "Not successful (OCR failed)"}${suffix}`);
          setStatusTone("bad");
          setBatchResults((prev) => [
            ...prev,
            {
              name: displayName,
              status: "error",
              message: t.upload.statusOcrFailed || "OCR failed",
            },
          ]);
          continue;
        }

        const ocrJson = await ocrResponse.json();
        if (ocrJson?.remaining !== undefined) {
          setOcrRemaining(ocrJson.remaining);
        }
        if (ocrJson?.IsErroredOnProcessing) {
          setStatus(`${t.upload.statusOcrFailed || "Not successful (OCR failed)"}${suffix}`);
          setStatusTone("bad");
          setBatchResults((prev) => [
            ...prev,
            {
              name: displayName,
              status: "error",
              message: t.upload.statusOcrFailed || "OCR failed",
            },
          ]);
          continue;
        }

        const pt = ocrJson.ParsedResults?.[0]?.ParsedText || "";
        const parsed = parseFragpunkText(
          pt,
          user.uid,
          claims?.username || user.displayName || user.email || user.uid
        );
        if (!parsed) {
          setStatus(
            `${t.upload.statusPlayerFailed || "Not successful (Player row not recognized)"}${suffix}`
          );
          setStatusTone("bad");
          setBatchResults((prev) => [
            ...prev,
            {
              name: displayName,
              status: "error",
              message:
                t.upload.statusPlayerFailed || "Player row not recognized",
            },
          ]);
          continue;
        }

        if (matchResult !== "victory" && matchResult !== "defeat") {
          setStatus(
            `${t.upload.manualResultPrompt || "Select match result manually"}${suffix}`
          );
          setStatusTone("neutral");
          const manualChoice = await requestManualResult(displayName);
          if (manualChoice !== "victory" && manualChoice !== "defeat") {
            setStatus(
              `${t.upload.statusManualSkipped || "Not successful (Result not selected)"}${suffix}`
            );
            setStatusTone("bad");
            setBatchResults((prev) => [
              ...prev,
              {
                name: displayName,
                status: "skip",
                message: t.upload.statusManualSkipped || "Result not selected",
              },
            ]);
            continue;
          }
          matchResult = manualChoice;
        }

        if (await userMatchExists(user.uid, matchId)) {
          setStatus(
            `${t.upload.statusAlready || "Match already uploaded earlier"}${suffix}`
          );
          setStatusTone("bad");
          setBatchResults((prev) => [
            ...prev,
            {
              name: displayName,
              status: "skip",
              message: t.upload.statusAlready || "Already uploaded",
            },
          ]);
          continue;
        }

        await ensureMatchDocument(matchId, matchResult);
        await ensurePlayerDocument(matchId, user.uid, parsed);

        const finalMatch = {
          matchId,
          result: matchResult ?? null,
          ...parsed,
        };
        await saveUserMatch(user.uid, matchId, finalMatch);
        await triggerLeaderboardUpdate(matchId, idToken);

        setStatus(`${t.upload.statusOk || "OK (Uploaded)"}${suffix}`);
        setStatusTone("good");
        setLastMatch(finalMatch);
        setBatchResults((prev) => [
          ...prev,
          { name: displayName, status: "ok", message: t.upload.statusOk || "Uploaded" },
        ]);

        matchesList = [...matchesList, finalMatch];
        const newAchievements = buildAchievements({
          matches: matchesList,
          friendDates,
          friendCount,
        });
        const nextUnlocked = getUnlockedIds(newAchievements);
        Object.entries(newAchievements).forEach(([key, list]) => {
          (list || []).forEach((item) => {
            const id = `${key}:${item.value}`;
            if (item.unlocked && !unlockedIds.has(id)) {
              const title = categoryTitle(key);
              const valueText = formatAchievementValue(key, item.value);
              const tpl =
                t.upload?.achievementToast ||
                "Achievement unlocked: {title} - {value}";
              const message = tpl
                .replace("{title}", title)
                .replace("{value}", valueText);
              pushToast(message, "good", item.image);
            }
          });
        });
        unlockedIds = nextUnlocked;
      }
    } catch (e) {
      console.error("UploadTab analyze failed:", e);
      if (e?.code === "permission-denied") {
        setStatus(
          t.upload.statusPermissionDenied ||
            "Not successful (Data rejected by server rules)"
        );
        setStatusTone("bad");
        setBatchResults((prev) => [
          ...prev,
          {
            name: t.upload.fileLabel || "File",
            status: "error",
            message:
              t.upload.statusPermissionDenied ||
              "Data rejected by server rules",
          },
        ]);
        return;
      }
      const reason = e?.message ? ` (${e.message})` : "";
      setStatus(
        `${t.upload.statusOtherFailed || "Not successful (Other error)"}${reason}`
      );
      setStatusTone("bad");
      setBatchResults((prev) => [
        ...prev,
        {
          name: t.upload.fileLabel || "File",
          status: "error",
          message: t.upload.statusOtherFailed || "Other error",
        },
      ]);
    } finally {
      setLoading(false);
      if (opencvWorker) opencvWorker.terminate();
    }
  }, [
    claims,
    ensureTesseract,
    lang,
    pushToast,
    requestManualResult,
    selectedFile,
    selectedFiles,
    setBatchResults,
    setImageUrl,
    setLastMatch,
    setLoading,
    setOcrRemaining,
    setSelectedFile,
    setStatus,
    setStatusTone,
    t,
    user,
  ]);
}

