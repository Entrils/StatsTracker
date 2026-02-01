import React, { useEffect, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import {
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "../../firebase";
import styles from "./UploadTab.module.css";
import { useLang } from "../../i18n/LanguageContext";
import { useAuth } from "../../auth/AuthContext";

/**
 * ⚠️ ВРЕМЕННО
 * Генерируем стабильный matchId из OCR текста
 */
function generateMatchIdFromText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return `match_${Math.abs(hash)}`;
}

export default function UploadTab() {
  const { t } = useLang();
  const { user, claims } = useAuth();

  const [imageUrl, setImageUrl] = useState(null);
  const [players, setPlayers] = useState([]);
  const [status, setStatus] = useState("");
  const [debugText, setDebugText] = useState("");
  const [debugImage, setDebugImage] = useState(null);
  const [loading, setLoading] = useState(false);

  const debugUrlRef = useRef(null);

  useEffect(() => {
    return () => {
      if (debugUrlRef.current) URL.revokeObjectURL(debugUrlRef.current);
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

  // 📌 Строгий парсер (одна строка игрока)
  const parseFragpunkText = (text) => {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 4) return null;

    const [scoreLine, kdaLine, damageLine, damageShareLine] = lines;

    if (!/^\d{4,6}$/.test(scoreLine)) return null;
    if (!/^\d{1,2}\/\d{1,2}\/\d{1,2}$/.test(kdaLine)) return null;
    if (!/^\d{3,5}$/.test(damageLine)) return null;
    if (!/^\d{1,2}([.,]\d)?%$/.test(damageShareLine)) return null;

    const [kills, deaths, assists] = kdaLine.split("/").map(Number);

    return {
      ownerUid: user.uid,
      name:
        claims?.username ||
        user.displayName ||
        user.email ||
        user.uid,
      score: Number(scoreLine),
      kills,
      deaths,
      assists,
      damage: Number(damageLine),
      damageShare: parseFloat(
        damageShareLine.replace("%", "").replace(",", ".")
      ),
      createdAt: Date.now(),
    };
  };

  const handleAnalyze = async () => {
    const input = document.querySelector('input[type="file"]');
    if (!input?.files?.length) return;

    setLoading(true);
    setPlayers([]);
    setDebugText("");
    setStatus(t.upload.processing);

    if (debugUrlRef.current) {
      URL.revokeObjectURL(debugUrlRef.current);
      debugUrlRef.current = null;
    }
    setDebugImage(null);

    let worker;

    try {
      // 1️⃣ compress
      setStatus(t.upload.compressing);
      const compressed = await imageCompression(input.files[0], {
        maxSizeMB: 0.9,
        maxWidthOrHeight: 1280,
        useWebWorker: true,
      });

      // 2️⃣ bitmap → ImageData
      const bitmap = await createImageBitmap(compressed);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // 3️⃣ OpenCV worker
      setStatus(`${t.upload.processing} (OpenCV)`);
      worker = new Worker(
        new URL("../../workers/opencvWorker.js", import.meta.url),
        { type: "classic" }
      );

      const { blob, error } = await new Promise((resolve, reject) => {
        worker.onerror = reject;
        worker.onmessage = (e) => resolve(e.data);
        worker.postMessage({ imageData });
      });

      if (error || !blob) {
        setStatus(`${t.upload.notFound} (${error || "no blob"})`);
        setLoading(false);
        worker.terminate();
        return;
      }

      const url = URL.createObjectURL(blob);
      debugUrlRef.current = url;
      setDebugImage(url);

      // 4️⃣ OCR
      setStatus(t.upload.ocr);
      const formData = new FormData();
      formData.append("apikey", "K82627207388957");
      formData.append("language", "eng");
      formData.append("file", blob, "row.png");

      const ocrRes = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        body: formData,
      });

      const ocrData = await ocrRes.json();
      const text = ocrData.ParsedResults?.[0]?.ParsedText || "";
      setDebugText(text);

      const parsed = parseFragpunkText(text);
      if (!parsed) {
        setStatus(t.upload.notFound);
        setLoading(false);
        worker.terminate();
        return;
      }

      // 🧠 MATCH ID
      const matchId = generateMatchIdFromText(text);

      // 5️⃣ проверка: загружал ли пользователь этот матч
      const userMatchRef = doc(db, "users", user.uid, "matches", matchId);
      const userMatchSnap = await getDoc(userMatchRef);

      if (userMatchSnap.exists()) {
        setStatus(t.upload.alreadyUploaded);
        setLoading(false);
        worker.terminate();
        return;
      }

      // 6️⃣ создаём матч (если нет)
      const matchRef = doc(db, "matches", matchId);
      const matchSnap = await getDoc(matchRef);
      if (!matchSnap.exists()) {
        await setDoc(matchRef, {
          createdAt: Date.now(),
        });
      }

      // 7️⃣ игрок в матче
      const matchPlayerRef = doc(
        db,
        "matches",
        matchId,
        "players",
        user.uid
      );
      await setDoc(matchPlayerRef, parsed);

      // 8️⃣ матч в профиле пользователя
      await setDoc(userMatchRef, {
        ...parsed,
        matchId,
      });

      setPlayers([parsed]);
      setStatus(t.upload.success);

      setLoading(false);
      worker.terminate();
    } catch (err) {
      console.error(err);
      setStatus(t.upload.error);
      setLoading(false);
      if (worker) worker.terminate();
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{t.upload.title}</h1>

      <div className={styles.card}>
        <input
          type="file"
          accept="image/*"
          className={styles.fileInput}
          onChange={(e) =>
            setImageUrl(
              e.target.files[0]
                ? URL.createObjectURL(e.target.files[0])
                : null
            )
          }
        />

        {imageUrl && (
          <img src={imageUrl} alt="preview" className={styles.preview} />
        )}

        {debugImage && (
          <>
            <h3 className={styles.debugTitle}>OpenCV crop debug</h3>
            <img src={debugImage} alt="opencv crop" className={styles.preview} />
          </>
        )}

        <div className={styles.actions}>
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className={styles.button}
          >
            {loading ? t.upload.processing : t.upload.analyze}
          </button>
        </div>

        <p className={styles.status}>{status}</p>
      </div>

      {players.length > 0 && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t.upload.player}</th>
                <th>{t.upload.score}</th>
                <th>{t.upload.kills}</th>
                <th>{t.upload.deaths}</th>
                <th>{t.upload.assists}</th>
                <th>{t.upload.damage}</th>
                <th>{t.upload.damageShare}</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr key={i}>
                  <td>{p.name}</td>
                  <td>{p.score}</td>
                  <td>{p.kills}</td>
                  <td>{p.deaths}</td>
                  <td>{p.assists}</td>
                  <td>{p.damage}</td>
                  <td>{p.damageShare}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {debugText && <pre className={styles.debug}>{debugText}</pre>}
    </div>
  );
}
