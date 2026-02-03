import React, { useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import styles from "./UploadTab.module.css";
import { useLang } from "../../i18n/LanguageContext";
import { useAuth } from "../../auth/AuthContext";

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
  const normalized = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const latin = t.replace(/[^A-Z]/g, "");
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
    latin.includes("VICTORY") ||
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
    latin.includes("DEFEAT") ||
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

export default function UploadTab() {
  const { t, lang } = useLang();
  const { user, claims } = useAuth();

  const [imageUrl, setImageUrl] = useState(null);
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState("");
  const [ocrRemaining, setOcrRemaining] = useState(null);
  const [loading, setLoading] = useState(false);

  const tesseractRef = useRef(null);
  const tesseractInitRef = useRef(null);

  const ensureTesseract = async () => {
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
  };

  const handleFile = (file) => {
    setSelectedFile(file || null);
    setImageUrl(file ? URL.createObjectURL(file) : null);
    setFileName(file ? file.name : "");
    if (file) {
      ensureTesseract().catch(() => {
        // handled on analyze
      });
    }
  };

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

    return {
      ownerUid: user.uid,
      name: claims?.username || user.displayName || user.email || user.uid,
      score: Number(score),
      kills,
      deaths,
      assists,
      damage: Number(dmg),
      damageShare: parseFloat(share.replace("%", "").replace(",", ".")),
      createdAt: Date.now(),
    };
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;

    setLoading(true);
    setStatus(t.upload.processing || "Processing...");
    setStatusTone("neutral");
    setOcrRemaining(null);

    let opencvWorker = null;

    try {
      const worker = await ensureTesseract();
      setStatus(t.upload.compressing);
      const compressed = await imageCompression(selectedFile, {
        maxSizeMB: 0.9,
        maxWidthOrHeight: 1280,
        useWebWorker: true,
      });

      const bitmap = await createImageBitmap(compressed);

      setStatus(t.upload.ocr || "OCR...");
      setStatusTone("neutral");

      const resultCanvas = document.createElement("canvas");
      resultCanvas.width = Math.max(1, Math.floor(bitmap.width * 0.5));
      resultCanvas.height = Math.max(1, Math.floor(bitmap.height * 0.18));

      const rctx = resultCanvas.getContext("2d");

      const sx = Math.floor(bitmap.width * 0.25);
      const sy = 0;
      const sw = Math.floor(bitmap.width * 0.5);
      const sh = resultCanvas.height;

      rctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, resultCanvas.width, resultCanvas.height);

      const resultProcessed = preprocessForOCR(resultCanvas);
      const resultBlob = await new Promise((r) => resultProcessed.toBlob(r, "image/png"));

      await worker.setParameters({
        // Latin + Cyrillic uppercase for result text (VICTORY/DEFEAT, ПОБЕДА/ПОРАЖЕНИЕ)
        tessedit_char_whitelist:
          "ABCDEFGHIJKLMNOPQRSTUVWXYZÉÈÊËÀÂÎÏÔÛÙÜÇÄÖÜßАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЫЬЭЮЯ",
        preserve_interword_spaces: "1",
      });

      const resultOCR = await worker.recognize(resultBlob);
      const resultText = resultOCR?.data?.text || "";
      console.log("[DEBUG] OCR RESULT AREA:", resultText);

      const matchResult = parseMatchResult(resultText);

      await worker.setParameters({
        tessedit_char_whitelist: "0123456789abcdef",
        preserve_interword_spaces: "1",
      });

      setStatus(t.upload.ocr || "OCR...");
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
      const matchBlob = await new Promise((r) => processed.toBlob(r, "image/png"));

      await worker.setParameters({
        tessedit_char_whitelist: "0123456789abcdef",
        preserve_interword_spaces: "1",
      });

      const { data } = await worker.recognize(matchBlob);
      console.log("[DEBUG] OCR MATCH AREA:", data?.text || "");

      const matchId = extractMatchId(data.text);

      if (!matchId) {
        setStatus(
          t.upload.statusMatchIdFailed ||
            "Not successful (Match ID not found)"
        );
        setStatusTone("bad");
        return;
      }

      setStatus(t.upload.processing || "Processing...");
      setStatusTone("neutral");

      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      opencvWorker = new Worker(new URL("../../workers/opencvWorker.js", import.meta.url), {
        type: "classic",
      });

      const opencvResult = await new Promise((res, rej) => {
        opencvWorker.onerror = rej;
        opencvWorker.onmessage = (e) => res(e.data);
        opencvWorker.postMessage({ imageData });
      });

      const { blob, error } = opencvResult || {};
      if (error || !blob) {
        throw new Error(error || "OpenCV failed to crop player row");
      }

      setStatus(t.upload.ocr || "OCR...");
      setStatusTone("neutral");

      const reader = new FileReader();
      const base64Image = await new Promise((resolve, reject) => {
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });

      const idToken = user ? await user.getIdToken() : null;
      const headers = {
        "Content-Type": "application/json",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      };
      const r = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || "http://localhost:4000"}/ocr`,
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

      if (!r.ok) {
        if (r.status === 413) {
          setStatus(t.upload.statusTooLarge || "File is too large (max 2MB)");
          setStatusTone("bad");
          return;
        }
        const err = await r.json().catch(() => null);
        if (err?.remaining !== undefined) {
          setOcrRemaining(err.remaining);
        }
        setStatus(t.upload.statusOcrFailed || "Not successful (OCR failed)");
        setStatusTone("bad");
        return;
      }

      const ocrJson = await r.json();
      if (ocrJson?.remaining !== undefined) {
        setOcrRemaining(ocrJson.remaining);
      }
      if (ocrJson?.IsErroredOnProcessing) {
        setStatus(t.upload.statusOcrFailed || "Not successful (OCR failed)");
        setStatusTone("bad");
        return;
      }
      const pt = ocrJson.ParsedResults?.[0]?.ParsedText || "";

      const parsed = parseFragpunkText(pt);
      if (!parsed) {
        setStatus(
          t.upload.statusPlayerFailed ||
            "Not successful (Player row not recognized)"
        );
        setStatusTone("bad");
        return;
      }

      const userMatchRef = doc(db, "users", user.uid, "matches", matchId);
      if ((await getDoc(userMatchRef)).exists()) {
        setStatus(t.upload.statusAlready || "Match already uploaded earlier");
        setStatusTone("bad");
        return;
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

      await setDoc(userMatchRef, {
        matchId,
        result: matchResult ?? null,
        ...parsed,
      });

      try {
        const idToken = user ? await user.getIdToken() : null;
        const headers = {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        };
        await fetch(
          `${import.meta.env.VITE_BACKEND_URL || "http://localhost:4000"}/leaderboard/update`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ matchId }),
          }
        );
      } catch {
        // best-effort; leaderboard will update on next successful call
      }

      setStatus(t.upload.statusOk || "OK (Uploaded)");
      setStatusTone("good");
    } catch (e) {
      setStatus(t.upload.statusOtherFailed || "Not successful (Other error)");
      setStatusTone("bad");
    } finally {
      setLoading(false);
      if (opencvWorker) opencvWorker.terminate();
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{t.upload.title}</h1>

      <div className={styles.card}>
        <input
          id="upload-file"
          type="file"
          accept="image/*"
          className={styles.fileInput}
          onChange={(e) => {
            const file = e.target.files[0];
            handleFile(file);
          }}
        />

        <label
          htmlFor="upload-file"
          className={`${styles.uploadArea} ${
            isDragging ? styles.uploadAreaDrag : ""
          }`}
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
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
        >
          <div className={styles.uploadIcon}>UP</div>
          <div className={styles.uploadText}>
            {t.upload.selectFile || "Choose screenshot"}
          </div>
          <div className={styles.uploadHint}>
            {t.upload.selectHint || "PNG/JPG, preferably full screen"}
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

        <button
          onClick={handleAnalyze}
          disabled={loading || !selectedFile}
          className={`${styles.button} ${selectedFile ? styles.buttonReady : ""}`}
        >
          {loading ? t.upload.processing : t.upload.analyze}
        </button>

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
      </div>
    </div>
  );
}





