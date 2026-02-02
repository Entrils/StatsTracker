import React, { useEffect, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import styles from "./UploadTab.module.css";
import { useLang } from "../../i18n/LanguageContext";
import { useAuth } from "../../auth/AuthContext";
import { createWorker } from "tesseract.js";

function extractMatchId(text) {
  if (!text) return null;

  const raw = text.toLowerCase();

  const hex = raw.match(/\b[a-f0-9]{16,32}\b/);
  if (hex) return hex[0];

  const normalized = raw
    .replace(/[\s:]/g, "")
    .replace(/[li]/g, "1")
    .replace(/o/g, "0");

  const numeric = normalized.match(/\d{7,14}/);
  return numeric ? numeric[0] : null;
}

function parseMatchResult(text) {
  if (!text) return null;
  const t = String(text).toUpperCase();

  if (t.includes("VICTORY")) return "victory";
  if (t.includes("DEFEAT")) return "defeat";

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

export default function UploadTab() {
  const { t } = useLang();
  const { user, claims } = useAuth();

  const [imageUrl, setImageUrl] = useState(null);
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState("");
  const [debugText, setDebugText] = useState("");
  const [debugImage, setDebugImage] = useState(null);

  const [debugMatchImage, setDebugMatchImage] = useState(null);
  const [debugMatchId, setDebugMatchId] = useState(null);

  const [debugResultImage, setDebugResultImage] = useState(null);
  const [debugResultText, setDebugResultText] = useState(null);
  const [debugResultValue, setDebugResultValue] = useState(null);

  const [loading, setLoading] = useState(false);

  const tesseractRef = useRef(null);

  const debugPlayerUrl = useRef(null);
  const debugMatchUrl = useRef(null);
  const debugResultUrl = useRef(null);

  const handleFile = (file) => {
    setSelectedFile(file || null);
    setImageUrl(file ? URL.createObjectURL(file) : null);
    setFileName(file ? file.name : "");
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const worker = await createWorker("eng");
        await worker.setParameters({
          tessedit_char_whitelist: "0123456789abcdef",
          preserve_interword_spaces: "1",
        });

        if (mounted) tesseractRef.current = worker;
        else await worker.terminate();
      } catch (e) {
        console.error("Tesseract init failed:", e);
      }
    })();

    return () => {
      mounted = false;

      if (tesseractRef.current) {
        tesseractRef.current.terminate();
        tesseractRef.current = null;
      }

      if (debugPlayerUrl.current) URL.revokeObjectURL(debugPlayerUrl.current);
      if (debugMatchUrl.current) URL.revokeObjectURL(debugMatchUrl.current);
      if (debugResultUrl.current) URL.revokeObjectURL(debugResultUrl.current);
    };
  }, []);

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
      if (!score && /^\d{4,6}$/.test(line)) score = line;
      else if (!kda && /^\d+\s*\/\s*\d+\s*\/\s*\d+$/.test(line))
        kda = line.replace(/\s/g, "");
      else if (!dmg && /^\d{3,5}$/.test(line)) dmg = line;
      else if (!share && /^\d{1,2}([.,]\d)?%$/.test(line)) share = line;
    }

    if (!score || !kda || !dmg || !share) {
      console.warn("PLAYER OCR PARSE FAILED:", { lines, score, kda, dmg, share });
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

    if (!tesseractRef.current) {
      setStatus("Tesseract is not ready yet. Please try again in a second.");
      return;
    }

    setLoading(true);
    setStatus(t.upload.processing);

    setDebugText("");
    setDebugImage(null);

    setDebugMatchImage(null);
    setDebugMatchId(null);

    setDebugResultImage(null);
    setDebugResultText(null);
    setDebugResultValue(null);

    if (debugPlayerUrl.current) {
      URL.revokeObjectURL(debugPlayerUrl.current);
      debugPlayerUrl.current = null;
    }
    if (debugMatchUrl.current) {
      URL.revokeObjectURL(debugMatchUrl.current);
      debugMatchUrl.current = null;
    }
    if (debugResultUrl.current) {
      URL.revokeObjectURL(debugResultUrl.current);
      debugResultUrl.current = null;
    }

    let opencvWorker = null;

    try {
      setStatus(t.upload.compressing);
      const compressed = await imageCompression(selectedFile, {
        maxSizeMB: 0.9,
        maxWidthOrHeight: 1280,
        useWebWorker: true,
      });

      const bitmap = await createImageBitmap(compressed);

      setStatus(`${t.upload.ocr} (result)`);

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

      const resultUrl = URL.createObjectURL(resultBlob);
      debugResultUrl.current = resultUrl;
      setDebugResultImage(resultUrl);

      await tesseractRef.current.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        preserve_interword_spaces: "1",
      });

      const resultOCR = await tesseractRef.current.recognize(resultBlob);
      const resultText = resultOCR?.data?.text || "";
      console.log("RAW RESULT OCR:", resultText);

      setDebugResultText(resultText);

      const matchResult = parseMatchResult(resultText);
      setDebugResultValue(matchResult || "(not found)");

      await tesseractRef.current.setParameters({
        tessedit_char_whitelist: "0123456789abcdef",
        preserve_interword_spaces: "1",
      });

      setStatus(`${t.upload.ocr} (match)`);

      const matchCanvas = document.createElement("canvas");
      matchCanvas.width = bitmap.width;
      matchCanvas.height = Math.floor(bitmap.height * 0.35);

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

      const processed = preprocessForOCR(matchCanvas);
      const matchBlob = await new Promise((r) => processed.toBlob(r, "image/png"));

      const matchUrl = URL.createObjectURL(matchBlob);
      debugMatchUrl.current = matchUrl;
      setDebugMatchImage(matchUrl);

      const { data } = await tesseractRef.current.recognize(matchBlob);
      console.log("RAW TESSERACT MATCH OCR:", data.text);

      const matchId = extractMatchId(data.text);

      console.log("MATCH ID EXTRACTED:", matchId);
      setDebugMatchId(matchId || "(not found)");

      if (!matchId) {
        setStatus("Match ID not found");
        return;
      }

      setStatus(`${t.upload.processing} (player)`);

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

      const playerUrl = URL.createObjectURL(blob);
      debugPlayerUrl.current = playerUrl;
      setDebugImage(playerUrl);

      setStatus(`${t.upload.ocr} (player)`);

      const reader = new FileReader();
      const base64Image = await new Promise((resolve, reject) => {
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });

      const r = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || "http://localhost:4000"}/ocr`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base64Image }),
        }
      );

      if (!r.ok) {
        throw new Error(`OCR request failed: ${await r.text()}`);
      }

      const ocrJson = await r.json();
      const pt = ocrJson.ParsedResults?.[0]?.ParsedText || "";

      console.log("RAW PLAYER OCR:", pt);
      setDebugText(pt);

      const parsed = parseFragpunkText(pt);
      if (!parsed) {
        setStatus(t.upload.notFound);
        return;
      }

      const userMatchRef = doc(db, "users", user.uid, "matches", matchId);
      if ((await getDoc(userMatchRef)).exists()) {
        setStatus(t.upload.alreadyUploaded);
        return;
      }

      const matchRef = doc(db, "matches", matchId);
      if (!(await getDoc(matchRef)).exists()) {
        await setDoc(matchRef, {
          createdAt: Date.now(),
          result: matchResult ?? null, 
        });
      } else {
        await setDoc(
          matchRef,
          {
            result: matchResult ?? null,
          },
          { merge: true }
        );
      }

      await setDoc(doc(db, "matches", matchId, "players", user.uid), parsed);

      await setDoc(userMatchRef, {
        matchId,
        result: matchResult ?? null,
        ...parsed,
      });

      setStatus(t.upload.success);
    } catch (e) {
      console.error(e);
      setStatus(t.upload.error);
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

        {debugResultImage && (
          <>
            <h3 className={styles.debugTitle}>Result (Tesseract)</h3>
            <img src={debugResultImage} alt="result crop" className={styles.preview} />
          </>
        )}

        {debugResultValue && (
          <p className={styles.status}>
            <b>Result:</b> {debugResultValue}
          </p>
        )}

        {debugResultText && <pre className={styles.debug}>{debugResultText}</pre>}

        {debugMatchImage && (
          <>
            <h3 className={styles.debugTitle}>Match ID (Tesseract)</h3>
            <img src={debugMatchImage} alt="match crop" className={styles.preview} />
          </>
        )}

        {debugMatchId && (
          <p className={styles.status}>
            <b>Match ID:</b> {debugMatchId}
          </p>
        )}

        {debugImage && (
          <>
            <h3 className={styles.debugTitle}>Player row</h3>
            <img src={debugImage} alt="player crop" className={styles.preview} />
          </>
        )}

        <button
          onClick={handleAnalyze}
          disabled={loading || !selectedFile}
          className={`${styles.button} ${selectedFile ? styles.buttonReady : ""}`}
        >
          {loading ? t.upload.processing : t.upload.analyze}
        </button>

        <p className={styles.status}>{status}</p>
      </div>

      {debugText && <pre className={styles.debug}>{debugText}</pre>}
    </div>
  );
}



