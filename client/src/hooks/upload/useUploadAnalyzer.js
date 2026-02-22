import { useCallback, useEffect, useRef } from "react";
import { buildAchievements } from "@/utils/achievements";
import { fetchFriendsMeta, fetchUserMatches } from "@/services/upload/uploadService";
import { trackUxEvent } from "@/utils/analytics/trackUxEvent";
import {
  createOpenCvCropRunner,
  runSingleUploadStage,
  throwIfAborted,
} from "@/services/upload/uploadAnalyzerStages";

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
  const activeRunRef = useRef(null);
  const activePreviewUrlRef = useRef(null);

  useEffect(
    () => () => {
      if (activeRunRef.current) {
        activeRunRef.current.abort();
      }
      if (activePreviewUrlRef.current) {
        URL.revokeObjectURL(activePreviewUrlRef.current);
        activePreviewUrlRef.current = null;
      }
    },
    []
  );

  return useCallback(async () => {
    const queue = selectedFiles.length
      ? selectedFiles
      : selectedFile
      ? [selectedFile]
      : [];
    if (!queue.length) return;

    if (activeRunRef.current) {
      activeRunRef.current.abort();
    }
    const controller = new AbortController();
    const { signal } = controller;
    activeRunRef.current = controller;

    setLoading(true);
    setStatus(t.upload.processing || "Processing...");
    setStatusTone("neutral");
    setOcrRemaining(null);
    setBatchResults([]);

    let opencvWorker = null;

    try {
      const worker = await ensureTesseract();
      throwIfAborted(signal);

      opencvWorker = new Worker(
        new URL("../../workers/opencvWorker.js", import.meta.url),
        { type: "classic" }
      );
      const runOpenCvCrop = createOpenCvCropRunner(opencvWorker);

      const uid = user.uid;
      let matchesList = await fetchUserMatches(uid);
      throwIfAborted(signal);
      const idToken = user ? await user.getIdToken() : null;
      const { friendCount, friendDates, friendMilestones } = await fetchFriendsMeta(idToken);
      throwIfAborted(signal);

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

      const baseAchievements = buildAchievements({
        matches: matchesList,
        friendDates,
        friendCount,
        friendMilestones,
      });
      let unlockedIds = getUnlockedIds(baseAchievements);

      for (let index = 0; index < queue.length; index += 1) {
        throwIfAborted(signal);

        const file = queue[index];
        setSelectedFile(file);

        const objectUrl = URL.createObjectURL(file);
        activePreviewUrlRef.current = objectUrl;
        setImageUrl(objectUrl);

        let outcome;
        try {
          outcome = await runSingleUploadStage({
            file,
            index,
            total: queue.length,
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
          });
        } finally {
          URL.revokeObjectURL(objectUrl);
          if (activePreviewUrlRef.current === objectUrl) {
            activePreviewUrlRef.current = null;
          }
          setImageUrl(null);
        }

        if (!outcome) continue;

        const tone = outcome.status === "ok" ? "good" : "bad";
        setStatusTone(tone);
        setStatus(
          `${outcome.message}${
            queue.length > 1 ? ` (${index + 1}/${queue.length})` : ""
          }`
        );
        setBatchResults((prev) => [...prev, outcome]);

        if (outcome.status === "ok" && outcome.finalMatch) {
          setLastMatch(outcome.finalMatch);
          matchesList = [...matchesList, outcome.finalMatch];
          trackUxEvent("upload_completion", {
            meta: {
              source: "upload_tab",
              batchSize: queue.length,
              fileIndex: index + 1,
            },
          });

          const newAchievements = buildAchievements({
            matches: matchesList,
            friendDates,
            friendCount,
            friendMilestones,
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
                pushToast(
                  tpl.replace("{title}", title).replace("{value}", valueText),
                  "good",
                  item.image
                );
              }
            });
          });
          unlockedIds = nextUnlocked;
        }
      }
    } catch (e) {
      if (e?.name === "AbortError") {
        setStatus(t.upload.statusCancelled || "Upload canceled");
        setStatusTone("neutral");
      } else {
        console.error("UploadTab analyze failed:", e);
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
      }
    } finally {
      if (activeRunRef.current === controller) {
        activeRunRef.current = null;
      }
      setLoading(false);
      setSelectedFile(null);
      setImageUrl(null);
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
