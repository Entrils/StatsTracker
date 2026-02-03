import React, { useCallback, useEffect, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { db } from "@/firebase";
import styles from "@/pages/UploadTab/UploadTab.module.css";
import { useLang } from "@/i18n/LanguageContext";
import { useAuth } from "@/auth/AuthContext";
import { buildAchievements } from "@/utils/achievements";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

function extractMatchId(text) {
  if (!text) return null;

  const raw = text.toLowerCase();
  const lines = raw.split("\n").map((l) => l.trim());
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (
      /(match\s*id|matchid|код\s*матча|code\s*de\s*correspondance|match-?nummer)/.test(
        line
      )
    ) {
      const candidateLine =
        line + " " + (lines[i + 1] || "") + " " + (lines[i + 2] || "");
      const token = candidateLine.match(/[a-z0-9]{6,32}/i);
      if (token) return token[0];
      const compact = candidateLine.replace(/[^a-f0-9]/gi, "");
      if (compact.length >= 6) return compact;
    }
  }
  const labelHit = raw.match(
    /(?:match\s*id|matchid|код\s*матча|code\s*de\s*correspondance|match-?nummer)\s*[:#-]?\s*([a-f0-9]{6,32})/
  );
  if (labelHit) return labelHit[1];

  const hex = raw.match(/\b[a-f0-9]{12,32}\b/);
  if (hex) return hex[0];

  const normalized = raw
    .replace(/[\s:]/g, "")
    .replace(/[li]/g, "1")
    .replace(/o/g, "0")
    .replace(/[а]/g, "a")
    .replace(/[в]/g, "b")
    .replace(/[с]/g, "c")
    .replace(/[е]/g, "e")
    .replace(/[ф]/g, "f");

  const labelNormalized = normalized.match(
    /(matchid|кодматча|codedecorrespondance|matchnummer)([a-f0-9]{6,32})/
  );
  if (labelNormalized) return labelNormalized[2];

  const numeric = normalized.match(/\d{7,16}/);
  return numeric ? numeric[0] : null;
}

function parseMatchResult(text) {
  if (!text) return null;
  const t = String(text).toUpperCase();
  const normalized = t.normalize("NFD").replace(/\p{M}/gu, "");
  const latin = t.replace(/[^A-Z]/g, "");
  const latinConfusable = latin
    .replace(/M/g, "P")
    .replace(/N/g, "O")
    .replace(/O/g, "O")
    .replace(/B/g, "B")
    .replace(/E/g, "E")
    .replace(/A/g, "A")
    .replace(/D/g, "D")
    .replace(/P/g, "P")
    .replace(/R/g, "R")
    .replace(/T/g, "T")
    .replace(/Y/g, "Y")
    .replace(/K/g, "K")
    .replace(/X/g, "X");
  const cyrA = t
    .replace(/[A]/g, "А")
    .replace(/[B]/g, "В")
    .replace(/[C]/g, "С")
    .replace(/[E]/g, "Е")
    .replace(/[H]/g, "Н")
    .replace(/[K]/g, "К")
    .replace(/[M]/g, "М")
    .replace(/[O]/g, "О")
    .replace(/[P]/g, "Р")
    .replace(/[T]/g, "Т")
    .replace(/[X]/g, "Х")
    .replace(/[Y]/g, "У")
    .replace(/[N]/g, "И")
    .replace(/[V]/g, "В")
    .replace(/[^А-Я]/g, "");
  const cyrB = t
    .replace(/[A]/g, "А")
    .replace(/[B]/g, "В")
    .replace(/[C]/g, "С")
    .replace(/[E]/g, "Е")
    .replace(/[H]/g, "Н")
    .replace(/[K]/g, "К")
    .replace(/[M]/g, "П")
    .replace(/[O]/g, "О")
    .replace(/[P]/g, "Р")
    .replace(/[T]/g, "Т")
    .replace(/[X]/g, "Х")
    .replace(/[Y]/g, "У")
    .replace(/[N]/g, "О")
    .replace(/[V]/g, "В")
    .replace(/[^А-Я]/g, "");
if (
    latin.includes("VICTORY") || latinConfusable.includes("POBE") || latinConfusable.includes("POBED") || latinConfusable.includes("POB") ||
    normalized.includes("VICTOIRE") ||
    t.includes("SIEG") ||
    cyrA.includes("ПОБЕД") ||
    cyrA.includes("ПОБЕ") ||
    cyrB.includes("ПОБЕД") ||
    cyrB.includes("ПОБЕ") ||
    t.includes("ПОБЕДА")
  )
    return "victory";
  if (
    latin.includes("DEFEAT") || latinConfusable.includes("PORA") || latinConfusable.includes("PORAZH") || latinConfusable.includes("PORAZ") ||
    normalized.includes("DEFAITE") ||
    t.includes("VERLUST") ||
    cyrA.includes("ПОРАЖ") ||
    cyrA.includes("ПОРА") ||
    cyrB.includes("ПОРАЖ") ||
    cyrB.includes("ПОРА") ||
    t.includes("ПОРАЖЕНИЕ")
  )
    return "defeat";

  return null;
}

function preprocessForOCR(srcCanvas) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.floor(srcCanvas.width * 2));
  c.height = Math.max(1, Math.floor(srcCanvas.height * 2));

  const ctx = c.getContext("2d");
  ctx.drawImage(srcCanvas, 0, 0, c.width, c.height);

  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    const gray = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    const v = gray > 135 ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }

  ctx.putImageData(img, 0, 0);
  return c;
}

function preprocessForMatchId(srcCanvas) {
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

async function loadBitmapSafe(fileLike) {
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

export default function UploadTab() {
  const { t, lang } = useLang();
  const { user, claims } = useAuth();

  const [imageUrl, setImageUrl] = useState(null);
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState("");
  const [lastMatch, setLastMatch] = useState(null);
  const [ocrRemaining, setOcrRemaining] = useState(null);
  const [loading, setLoading] = useState(false);
  const [batchResults, setBatchResults] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [toasts, setToasts] = useState([]);

  const tesseractRef = useRef(null);
  const tesseractInitRef = useRef(null);
  const ensureTesseract = useCallback(async () => {
    if (tesseractRef.current) return tesseractRef.current;
    if (!tesseractInitRef.current) {
      tesseractInitRef.current = (async () => {
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("eng+rus+fra+deu");
        await worker.setParameters({
          tessedit_char_whitelist: "0123456789abcdef",
          preserve_interword_spaces: "1",
        });
        tesseractRef.current = worker;
        return worker;
      })();
    }
    return tesseractInitRef.current;
  }, []);

  const playUnlockSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const gain = ctx.createGain();
      gain.gain.value = 0.04;
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      const notes = [
        { freq: 440, dur: 0.08 },
        { freq: 554.37, dur: 0.08 },
        { freq: 659.25, dur: 0.08 },
        { freq: 880, dur: 0.14 },
      ];

      let t = now;
      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = note.freq;
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + note.dur);
        t += note.dur;
      });

      setTimeout(() => ctx.close(), 600);
    } catch {
      // ignore audio errors
    }
  }, []);

  const pushToast = useCallback(
    (message, tone = "good", icon = null) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, message, tone, icon }]);
      if (tone === "good") {
        playUnlockSound();
      }
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    [playUnlockSound]
  );

  const handleFile = useCallback(
    (input) => {
      const files = Array.isArray(input)
        ? input.filter(Boolean)
        : input
        ? [input]
        : [];
      const limited = files.slice(0, 10);
      const primary = limited[0] || null;

      setSelectedFiles(limited);
      setSelectedFile(primary);
      setImageUrl(primary ? URL.createObjectURL(primary) : null);
      if (limited.length > 1) {
        const label =
          (t.upload?.filesSelected || "Selected files") + `: ${limited.length}`;
        setFileName(label);
      } else {
        setFileName(primary ? primary.name : "");
      }

      if (files.length > 10) {
        setStatus(
          t.upload?.batchLimit || "Only first 10 files will be processed"
        );
        setStatusTone("bad");
      }

      if (primary) {
        ensureTesseract().catch(() => {
          // handled on analyze
        });
      }
    },
    [ensureTesseract, t]
  );

    const handlePaste = useCallback(
    (event) => {
      const items = event.clipboardData?.items;
      if (!items?.length) return;
      const imageItem = Array.from(items).find((item) =>
        item.type.startsWith("image/")
      );
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      event.preventDefault();
      const ext = file.type.split("/")[1] || "png";
      const namedFile = file.name
        ? file
        : new File([file], `clipboard.${ext}`, { type: file.type });
      handleFile(namedFile);
      setStatus(t.upload.pasteReady || "Pasted from clipboard");
      setStatusTone("good");
    },
    [handleFile, t]
  );

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  useEffect(() => {
    const urls = (selectedFiles || []).map((file) =>
      file ? URL.createObjectURL(file) : null
    );
    setPreviewUrls(urls.filter(Boolean));
    return () => {
      urls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [selectedFiles]);

  if (!user) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>{t.upload.title}</h1>
        <p>{t.upload.loginRequired}</p>
      </div>
    );
  }

  const parseFragpunkText = (text) => {
    const lines = String(text || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    let score, kda, dmg, share;

    for (const line of lines) {
      if (!score && /^\d{3,6}$/.test(line)) score = line;
      else if (!kda && /^\d+\s*\/\s*\d+\s*\/\s*\d+$/.test(line))
        kda = line.replace(/\s/g, "");
      else if (!dmg && /^\d{2,6}$/.test(line)) dmg = line;
      else if (
        !share &&
        /^\d{1,3}([.,]\d)?\s*%$/.test(line)
      )
        share = line.replace(/\s+/g, "");
    }

    if (!score || !kda || !dmg || !share) {
      return null;
    }

    const [kills, deaths, assists] = kda.split("/").map(Number);
    const parsedScore = Number(score);
    const parsedDamage = Number(dmg);
    const parsedShareRaw = parseFloat(share.replace("%", "").replace(",", "."));

    if (
      !Number.isFinite(parsedScore) ||
      !Number.isFinite(parsedDamage) ||
      !Number.isFinite(kills) ||
      !Number.isFinite(deaths) ||
      !Number.isFinite(assists)
    ) {
      return null;
    }

    let parsedShare = parsedShareRaw;
    // OCR can return 441 instead of 44.1; normalize into [0..100] for Firestore rules.
    while (
      Number.isFinite(parsedShare) &&
      parsedShare > 100 &&
      parsedShare <= 1000
    ) {
      parsedShare /= 10;
    }
    if (!Number.isFinite(parsedShare) || parsedShare < 0 || parsedShare > 100) {
      return null;
    }

    return {
      ownerUid: user.uid,
      name: claims?.username || user.displayName || user.email || user.uid,
      score: parsedScore,
      kills,
      deaths,
      assists,
      damage: parsedDamage,
      damageShare: Math.round(parsedShare * 10) / 10,
      createdAt: Date.now(),
    };
  };

  const handleAnalyze = async () => {
    const queue = selectedFiles.length ? selectedFiles : selectedFile ? [selectedFile] : [];
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
      const matchesSnap = await getDocs(
        query(
          collection(db, "users", uid, "matches"),
          orderBy("createdAt", "asc"),
          limit(2000)
        )
      );
      let matchesList = matchesSnap.docs.map((doc) => doc.data());
      const idToken = user ? await user.getIdToken() : null;
      let friendDates = [];
      let friendCount = 0;
      try {
        const friendsRes = await fetch(`${BACKEND_URL}/friends/list`, {
          headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
        });
        const friendsJson = await friendsRes.json().catch(() => null);
        const friendRows = Array.isArray(friendsJson?.rows) ? friendsJson.rows : [];
        friendCount = friendRows.length;
        friendDates = friendRows.map((f) => f?.createdAt).filter(Boolean);
      } catch {
        // keep achievements logic working even if friends endpoint is unavailable
      }
      let baseAchievements = buildAchievements({
        matches: matchesList,
        friendDates,
        friendCount,
      });

      const getUnlockedIds = (ach) => {
        const ids = new Set();
        Object.entries(ach || {}).forEach(([key, list]) => {
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
        if (key === "matches") return t.achievements?.matchesTitle || "Uploaded matches";
        if (key === "friends") return t.achievements?.friendsTitle || "Friends";
        if (key === "kills") return t.achievements?.killsTitle || "Max kills";
        return t.achievements?.streakTitle || "Win streak";
      };

      let unlockedIds = getUnlockedIds(baseAchievements);
      for (let index = 0; index < queue.length; index += 1) {
        const file = queue[index];
        const suffix = total > 1 ? ` (${index + 1}/${total})` : "";
        const displayName = file?.name || `${t.upload.fileLabel || "File"} ${index + 1}`;
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

        const resultCanvas = document.createElement("canvas");
        resultCanvas.width = Math.max(1, Math.floor(bitmap.width * 0.5));
        resultCanvas.height = Math.max(1, Math.floor(bitmap.height * 0.18));

        const rctx = resultCanvas.getContext("2d");

        const sx = Math.floor(bitmap.width * 0.25);
        const sy = 0;
        const sw = Math.floor(bitmap.width * 0.5);
        const sh = resultCanvas.height;

        rctx.drawImage(
          bitmap,
          sx,
          sy,
          sw,
          sh,
          0,
          0,
          resultCanvas.width,
          resultCanvas.height
        );

        const resultProcessed = preprocessForOCR(resultCanvas);
        const resultBlob = await new Promise((r) =>
          resultProcessed.toBlob(r, "image/png")
        );

        await worker.setParameters({
          // Latin + Cyrillic uppercase for result text (VICTORY/DEFEAT, ПОБЕДА/ПОРАЖЕНИЕ)
          tessedit_char_whitelist:
            "ABCDEFGHIJKLMNOPQRSTUVWXYZÉÈÊËÀÂÎÏÔÛÙÜÇÄÖÜßАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЫЬЭЮЯ",
          preserve_interword_spaces: "1",
        });

        const resultOCR = await worker.recognize(resultBlob);
        const resultText = resultOCR?.data?.text || "";

        const matchResult = parseMatchResult(resultText);

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
        const matchBlob = await new Promise((r) =>
          processed.toBlob(r, "image/png")
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
            { name: displayName, status: "error", message: t.upload.statusMatchIdFailed || "Match ID not found" },
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

        opencvWorker = new Worker(
          new URL("../../workers/opencvWorker.js", import.meta.url),
          { type: "classic" }
        );

        const opencvResult = await new Promise((res, rej) => {
          opencvWorker.onerror = rej;
          opencvWorker.onmessage = (e) => res(e.data);
          opencvWorker.postMessage({ imageData });
        });

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

        const headers = {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        };
        let r;
        try {
          r = await fetch(
          `${BACKEND_URL}/ocr`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                base64Image,
                lang:
                  lang === "ru"
                    ? "rus"
                    : lang === "fr"
                    ? "fre"
                    : lang === "de"
                    ? "ger"
                    : "eng",
              }),
            }
          );
        } catch (fetchError) {
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
                t.upload.backendUnavailable ||
                "Backend unavailable / network error",
            },
          ]);
          continue;
        }

        if (!r.ok) {
          if (r.status === 403) {
            const err = await r.json().catch(() => null);
            if (err?.error === "Banned") {
              setStatus(`${t.upload.statusBanned || "Not successful (Banned)"}${suffix}`);
              setStatusTone("bad");
              setBatchResults((prev) => [
                ...prev,
                { name: displayName, status: "error", message: t.upload.statusBanned || "Banned" },
              ]);
              continue;
            }
          }
          if (r.status === 413) {
            setStatus(
              `${t.upload.statusTooLarge || "File is too large (max 2MB)"}${suffix}`
            );
            setStatusTone("bad");
            setBatchResults((prev) => [
              ...prev,
              { name: displayName, status: "error", message: t.upload.statusTooLarge || "File too large" },
            ]);
            continue;
          }
          const err = await r.json().catch(() => null);
          if (err?.remaining !== undefined) {
            setOcrRemaining(err.remaining);
          }
          setStatus(`${t.upload.statusOcrFailed || "Not successful (OCR failed)"}${suffix}`);
          setStatusTone("bad");
          setBatchResults((prev) => [
            ...prev,
            { name: displayName, status: "error", message: t.upload.statusOcrFailed || "OCR failed" },
          ]);
          continue;
        }

        const ocrJson = await r.json();
        if (ocrJson?.remaining !== undefined) {
          setOcrRemaining(ocrJson.remaining);
        }
        if (ocrJson?.IsErroredOnProcessing) {
          setStatus(`${t.upload.statusOcrFailed || "Not successful (OCR failed)"}${suffix}`);
          setStatusTone("bad");
          setBatchResults((prev) => [
            ...prev,
            { name: displayName, status: "error", message: t.upload.statusOcrFailed || "OCR failed" },
          ]);
          continue;
        }
        const pt = ocrJson.ParsedResults?.[0]?.ParsedText || "";

        const parsed = parseFragpunkText(pt);
        if (!parsed) {
          setStatus(
            `${t.upload.statusPlayerFailed || "Not successful (Player row not recognized)"}${suffix}`
          );
          setStatusTone("bad");
          setBatchResults((prev) => [
            ...prev,
            { name: displayName, status: "error", message: t.upload.statusPlayerFailed || "Player row not recognized" },
          ]);
          continue;
        }

        const userMatchRef = doc(db, "users", user.uid, "matches", matchId);
        if ((await getDoc(userMatchRef)).exists()) {
          setStatus(`${t.upload.statusAlready || "Match already uploaded earlier"}${suffix}`);
          setStatusTone("bad");
          setBatchResults((prev) => [
            ...prev,
            { name: displayName, status: "skip", message: t.upload.statusAlready || "Already uploaded" },
          ]);
          continue;
        }

        const matchRef = doc(db, "matches", matchId);
        if (!(await getDoc(matchRef)).exists()) {
          await setDoc(matchRef, {
            createdAt: Date.now(),
            result: matchResult ?? null,
          });
        }

        const playerRef = doc(db, "matches", matchId, "players", user.uid);
        if (!(await getDoc(playerRef)).exists()) {
          await setDoc(playerRef, parsed);
        }

        const finalMatch = {
          matchId,
          result: matchResult ?? null,
          ...parsed,
        };
        await setDoc(userMatchRef, finalMatch);

        try {
          const headers = {
            "Content-Type": "application/json",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          };
          await fetch(
            `${BACKEND_URL}/leaderboard/update`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({ matchId }),
            }
          );
        } catch {
          // best-effort; leaderboard will update on next successful call
        }

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
                "Achievement unlocked: {title} — {value}";
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
  };

  return (
    <div className={styles.container}>
      {toasts.length > 0 && (
        <div className={styles.toastStack}>
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`${styles.toast} ${
                toast.tone === "bad" ? styles.toastBad : styles.toastGood
              }`}
            >
              {toast.icon && (
                <span className={styles.toastIcon}>
                  <img src={toast.icon} alt="" />
                </span>
              )}
              <span className={styles.toastText}>{toast.message}</span>
            </div>
          ))}
        </div>
      )}
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{t.upload.title}</h1>
        <a href="/help" className={styles.helpIcon} title={t.upload?.helpLink}>
          ?
        </a>
      </div>

      <div className={styles.card}>
        <input
          id="upload-file"
          type="file"
          accept="image/*"
          className={styles.fileInput}
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            handleFile(files);
          }}
        />

        <label
          htmlFor="upload-file"
          className={`${styles.uploadArea} ${
            isDragging ? styles.uploadAreaDrag : ""
          }`}
          tabIndex={0}
          onPaste={handlePaste}
          onDragEnter={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const files = Array.from(e.dataTransfer.files || []);
            if (files.length) handleFile(files);
          }}
        >
          <div className={styles.uploadIcon}>UP</div>
          <div className={styles.uploadText}>
            {t.upload.selectFile || "Choose screenshot"}
          </div>
          <div className={styles.uploadHint}>
            {(t.upload.selectHint || "PNG/JPG, preferably full screen") +
              " | " +
              (t.upload.pasteHint || "Paste: Ctrl+V")}
          </div>
          <div className={styles.uploadHintSecondary}>
            {t.upload.batchHint || "You can upload up to 10 screenshots at once"}
          </div>
          {fileName && <div className={styles.fileName}>{fileName}</div>}
        </label>

        <div
          className={`${styles.fileStatus} ${
            selectedFile ? styles.fileStatusReady : styles.fileStatusEmpty
          }`}
        >
          <span className={styles.fileStatusIcon}>
            {selectedFile ? "OK" : "!"}
          </span>
          <span className={styles.fileStatusText}>
            {selectedFile
              ? t.upload.fileReady || "File loaded - ready to analyze"
              : t.upload.fileMissing || "No file selected yet"}
          </span>
        </div>

        {imageUrl && <img src={imageUrl} alt="preview" className={styles.preview} />}
        {previewUrls.length > 1 && (
          <div className={styles.previewGrid}>
            {previewUrls.map((url, idx) => (
              <div
                key={`${url}-${idx}`}
                className={`${styles.previewThumb} ${
                  idx === 0 ? styles.previewThumbActive : ""
                }`}
                title={`${t.upload.fileLabel || "File"} ${idx + 1}`}
              >
                <img src={url} alt={`preview-${idx + 1}`} />
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleAnalyze}
          disabled={loading || !selectedFile}
          className={`${styles.button} ${selectedFile ? styles.buttonReady : ""}`}
        >
          {loading ? t.upload.processing : t.upload.analyze}
        </button>
        {previewUrls.length > 1 && (
          <p className={styles.batchNote}>
            {t.upload.batchNote ||
              "Batch upload is processed sequentially, so it may take longer."}
          </p>
        )}

        <p
          className={`${styles.status} ${
            statusTone === "good"
              ? styles.statusOk
              : statusTone === "bad"
              ? styles.statusError
              : ""
          }`}
        >
          {status}
        </p>
        {batchResults.length > 0 && (
          <div className={styles.batchPanel}>
            <div className={styles.batchTitle}>
              {t.upload.batchTitle || "Batch results"}
            </div>
            <div className={styles.batchSummary}>
              {(t.upload.batchSummary || "OK: {ok} • Errors: {err} • Skipped: {skip}")
                .replace(
                  "{ok}",
                  String(batchResults.filter((r) => r.status === "ok").length)
                )
                .replace(
                  "{err}",
                  String(batchResults.filter((r) => r.status === "error").length)
                )
                .replace(
                  "{skip}",
                  String(batchResults.filter((r) => r.status === "skip").length)
                )}
            </div>
            <ul className={styles.batchList}>
              {batchResults.map((item, idx) => (
                <li
                  key={`${item.name}-${idx}`}
                  className={`${styles.batchItem} ${
                    item.status === "ok"
                      ? styles.batchItemOk
                      : item.status === "skip"
                      ? styles.batchItemSkip
                      : styles.batchItemErr
                  }`}
                >
                  <span className={styles.batchItemName}>{item.name}</span>
                  <span className={styles.batchItemMsg}>{item.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {typeof ocrRemaining === "number" && (
          <p
            className={`${styles.ocrRemaining} ${
              ocrRemaining < 3 ? styles.ocrRemainingLow : ""
            }`}
          >
            {(t.upload.ocrRemaining || "OCR left today: {count}").replace(
              "{count}",
              String(ocrRemaining)
            )}
          </p>
        )}
        {lastMatch && (
          <div className={styles.matchCard}>
            <div className={styles.matchCardHeader}>
              <span className={styles.matchCardTitle}>
                {t.upload.matchCardTitle || "Last match"}
              </span>
              <span
                className={`${styles.matchCardResult} ${
                  lastMatch.result === "victory"
                    ? styles.matchCardWin
                    : lastMatch.result === "defeat"
                    ? styles.matchCardLoss
                    : ""
                }`}
              >
                {lastMatch.result === "victory"
                  ? t.upload.resultVictory || "Victory"
                  : lastMatch.result === "defeat"
                  ? t.upload.resultDefeat || "Defeat"
                  : t.upload.resultUnknown || "Result"}
              </span>
            </div>
            <div className={styles.matchCardGrid}>
              <div className={styles.matchCardItem}>
                <span className={styles.matchCardLabel}>{t.upload.score || "Score"}</span>
                <span className={styles.matchCardValue}>{lastMatch.score}</span>
              </div>
              <div className={styles.matchCardItem}>
                <span className={styles.matchCardLabel}>{t.upload.kills || "K"}</span>
                <span className={styles.matchCardValue}>{lastMatch.kills}</span>
              </div>
              <div className={styles.matchCardItem}>
                <span className={styles.matchCardLabel}>{t.upload.deaths || "D"}</span>
                <span className={styles.matchCardValue}>{lastMatch.deaths}</span>
              </div>
              <div className={styles.matchCardItem}>
                <span className={styles.matchCardLabel}>{t.upload.assists || "A"}</span>
                <span className={styles.matchCardValue}>{lastMatch.assists}</span>
              </div>
              <div className={styles.matchCardItem}>
                <span className={styles.matchCardLabel}>{t.upload.damage || "Damage"}</span>
                <span className={styles.matchCardValue}>{lastMatch.damage}</span>
              </div>
              <div className={styles.matchCardItem}>
                <span className={styles.matchCardLabel}>{t.upload.damageShare || "Dmg %"}</span>
                <span className={styles.matchCardValue}>
                  {typeof lastMatch.damageShare === "number"
                    ? `${lastMatch.damageShare}%`
                    : lastMatch.damageShare}
                </span>
              </div>
            </div>
            <div className={styles.matchCardMeta}>
              {t.upload.matchIdLabel || "Match ID"}: {lastMatch.matchId}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
































