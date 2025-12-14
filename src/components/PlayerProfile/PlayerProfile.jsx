import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { db } from "../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";

import styles from "./PlayerProfile.module.css";

export default function PlayerProfile() {
  const { id } = useParams();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const q = query(
        collection(db, "players"),
        where("__name__", "==", id)
      );

      const snapshot = await getDocs(q);

      const data = snapshot.docs.map((doc, i) => ({
        index: i + 1,
        ...doc.data(),
      }));

      setMatches(data);
      setLoading(false);
    };

    fetchHistory();
  }, [id]);

  if (loading) return <p className={styles.wrapper}>Загрузка профиля...</p>;
  if (!matches.length) return <p className={styles.wrapper}>Нет истории матчей</p>;

  const player = matches[matches.length - 1];

  return (
    <div className={styles.wrapper}>
      <Link to="/players" className={styles.backLink}>
        ← Назад
      </Link>

      <h1 className={styles.nickname}>{player.name}</h1>

      <div className={styles.statsGrid}>
        <Stat label="Score" value={player.score} />
        <Stat label="Kills" value={player.kills} />
        <Stat label="Deaths" value={player.deaths} />
        <Stat label="Assists" value={player.assists} />
        <Stat label="Hit Enemy" value={player.hit} />
        <Stat label="Damage %" value={player.dmgShare} />
      </div>

      <div className={styles.chartCard}>
        <h2 className={styles.chartTitle}>📈 Прогресс</h2>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={matches}>
            <Line
              type="monotone"
              dataKey="score"
              stroke="#6366f1"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="kills"
              stroke="#22d3ee"
              strokeWidth={2}
            />
            <CartesianGrid stroke="#374151" strokeDasharray="4 4" />
            <XAxis dataKey="index" />
            <YAxis />
            <Tooltip />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
  );
}
