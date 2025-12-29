import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  collectionGroup,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "../../firebase";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import styles from "./PlayerProfile.module.css";
import { useLang } from "../../i18n/LanguageContext";

export default function PlayerProfile() {
  const { t } = useLang();
  const { id: uid } = useParams();

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const q = query(
        collectionGroup(db, "players"),
        where("ownerUid", "==", uid),
        orderBy("createdAt", "asc")
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
  }, [uid]);

  const summary = useMemo(() => {
    if (!matches.length) return null;

    const total = matches.reduce(
      (acc, m) => {
        acc.score += m.score;
        acc.kills += m.kills;
        acc.deaths += m.deaths;
        acc.assists += m.assists;
        acc.damage += m.damage;
        acc.damageShare += m.damageShare;
        return acc;
      },
      {
        score: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        damage: 0,
        damageShare: 0,
      }
    );

    return {
      name: matches[0].name,
      matches: matches.length,
      avgScore: Math.round(total.score / matches.length),
      avgKills: Math.round(total.kills / matches.length),
      avgDeaths: Math.round(total.deaths / matches.length),
      avgAssists: Math.round(total.assists / matches.length),
      avgDamage: Math.round(total.damage / matches.length),
      avgDamageShare: (total.damageShare / matches.length).toFixed(1),
      kda: (
        (total.kills + total.assists) /
        Math.max(1, total.deaths)
      ).toFixed(2),
    };
  }, [matches]);

  if (loading) {
    return <p className={styles.wrapper}>{t.profile.loading}</p>;
  }

  if (!matches.length || !summary) {
    return <p className={styles.wrapper}>{t.profile.empty}</p>;
  }

  return (
    <div className={styles.wrapper}>
      <Link to="/players" className={styles.backLink}>
        {t.profile.back}
      </Link>

      <h1 className={styles.nickname}>{summary.name}</h1>

      <div className={styles.statsGrid}>
        <Stat label={t.profile.matches} value={summary.matches} />
        <Stat label={t.profile.score} value={summary.avgScore} />
        <Stat label={t.profile.kills} value={summary.avgKills} />
        <Stat label={t.profile.deaths} value={summary.avgDeaths} />
        <Stat label={t.profile.assists} value={summary.avgAssists} />
        <Stat label={t.profile.kda} value={summary.kda} />
        <Stat label={t.profile.damage} value={summary.avgDamage} />
        <Stat
          label={t.profile.damageShare}
          value={`${summary.avgDamageShare}%`}
        />
      </div>

      <div className={styles.chartCard}>
        <h2 className={styles.chartTitle}>{t.profile.progress}</h2>

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

