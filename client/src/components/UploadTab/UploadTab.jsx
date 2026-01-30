import React, { useState } from "react";
import imageCompression from "browser-image-compression";
import { db } from "../../firebase";
import { collection, addDoc } from "firebase/firestore";
import styles from "./UploadTab.module.css";
import { useLang } from "../../i18n/LanguageContext";
import { useAuth } from "../../auth/AuthContext";
import { Navigate } from "react-router-dom";

export default function UploadTab() {
  const { t } = useLang();
  const { user, loading } = useAuth();

  if (loading) {
    return <p style={{ textAlign: "center" }}>Loading...</p>;
  }

  if (!user) {
    return <Navigate to="/players" replace />;
  }

  const [image, setImage] = useState(null);
  const [players, setPlayers] = useState([]);
  const [status, setStatus] = useState("");
  const [debugText, setDebugText] = useState("");
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);

  const parseFragpunkText = (text) => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const names = [];
    const scores = [];
    const kdas = [];
    const hits = [];
    const dmg = [];

    for (const line of lines) {
      if (
        /^[A-Za-z][A-Za-z0-9_.]{2,}$/.test(line) &&
        !["Player", "Score", "KDA", "All", "VICTORY", "MATCH", "REPLAY"].includes(line)
      ) {
        names.push(line);
        continue;
      }

      if (/^\d{4,6}$/.test(line)) scores.push(Number(line));
      if (/^\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{1,2}$/.test(line))
        kdas.push(line.replace(/\s/g, ""));
      if (/^\d{3,5}$/.test(line)) hits.push(Number(line));
      if (/^\d{1,2}\.\d%$/.test(line)) dmg.push(parseFloat(line));
    }

    const count = Math.min(
      names.length,
      scores.length,
      kdas.length,
      hits.length,
      dmg.length,
      10
    );

    return Array.from({ length: count }, (_, i) => {
      const [kills, deaths, assists] = kdas[i].split("/").map(Number);
      return {
        name: names[i],
        score: scores[i],
        kills,
        deaths,
        assists,
        hit: hits[i],
        dmgShare: dmg[i],
        createdAt: Date.now(),
      };
    });
  };

  const handleAnalyze = async () => {
    const fileInput = document.querySelector('input[type="file"]');
    if (!fileInput.files.length) return;

    setLoadingAnalyze(true);
    setPlayers([]);
    setStatus(t.upload.compressing);
    setDebugText("");

    try {
      const compressed = await imageCompression(fileInput.files[0], {
        maxSizeMB: 0.9,
        maxWidthOrHeight: 2560,
        useWebWorker: true,
      });

      setStatus(t.upload.ocr);

      const formData = new FormData();
      formData.append("apikey", "K82627207388957");
      formData.append("language", "eng");
      formData.append("file", compressed);

      const res = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      const text = data.ParsedResults?.[0]?.ParsedText || "";
      setDebugText(text);

      const parsed = parseFragpunkText(text);

      if (!parsed.length) {
        setStatus(t.upload.notFound);
      } else {
        setPlayers(parsed);
        setStatus(`${t.upload.found} ${parsed.length}`);

        for (const p of parsed) {
          await addDoc(collection(db, "players"), {
            ...p,
            userId: user.uid,
          });
        }
      }
    } catch {
      setStatus(t.upload.error);
    } finally {
      setLoadingAnalyze(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{t.upload.title}</h1>

      <div className={styles.card}>
        <input
          type="file"
          accept="image/*"
          onChange={(e) =>
            setImage(
              e.target.files[0]
                ? URL.createObjectURL(e.target.files[0])
                : null
            )
          }
          className={styles.fileInput}
        />

        {image && <img src={image} alt="preview" className={styles.preview} />}

        <div className={styles.actions}>
          <button
            onClick={handleAnalyze}
            disabled={loadingAnalyze}
            className={styles.button}
          >
            {loadingAnalyze ? t.upload.processing : t.upload.analyze}
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
                <th>{t.upload.hit}</th>
                <th>{t.upload.damage}</th>
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
                  <td>{p.hit}</td>
                  <td>{p.dmgShare}</td>
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
