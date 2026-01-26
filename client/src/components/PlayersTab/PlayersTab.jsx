import { useEffect, useMemo, useState } from "react";
import { db } from "../../firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { Link } from "react-router-dom";
import styles from "./PlayersTab.module.css";
import { useLang } from "../../i18n/LanguageContext";

const SORTS = {
  SCORE: "score",
  KILLS: "kills",
  KDA: "kda",
};

export default function PlayersTab() {
  const { t } = useLang();

  const [players, setPlayers] = useState([]);
  const [sortBy, setSortBy] = useState(SORTS.SCORE);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "players"), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setPlayers(data);
    });

    return () => unsub();
  }, []);

  const filteredAndSorted = useMemo(() => {
    const filtered = players.filter((p) =>
      p.name?.toLowerCase().includes(search.toLowerCase())
    );

    return filtered.sort((a, b) => {
      if (sortBy === SORTS.KDA) {
        const kdaA = (a.kills + a.assists) / Math.max(1, a.deaths);
        const kdaB = (b.kills + b.assists) / Math.max(1, b.deaths);
        return kdaB - kdaA;
      }
      return (b[sortBy] || 0) - (a[sortBy] || 0);
    });
  }, [players, sortBy, search]);

  if (!players.length) {
    return <p className={styles.empty}>{t.leaderboard.empty}</p>;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t.leaderboard.title}</h1>

        <div className={styles.controls}>
          <input
            type="text"
            placeholder={t.leaderboard.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.search}
          />

          <div className={styles.sort}>
            <button
              onClick={() => setSortBy(SORTS.SCORE)}
              className={`${styles.sortBtn} ${
                sortBy === SORTS.SCORE ? styles.active : ""
              }`}
            >
              {t.leaderboard.score}
            </button>

            <button
              onClick={() => setSortBy(SORTS.KILLS)}
              className={`${styles.sortBtn} ${
                sortBy === SORTS.KILLS ? styles.active : ""
              }`}
            >
              {t.leaderboard.kills}
            </button>

            <button
              onClick={() => setSortBy(SORTS.KDA)}
              className={`${styles.sortBtn} ${
                sortBy === SORTS.KDA ? styles.active : ""
              }`}
            >
              KDA
            </button>
          </div>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t.upload.player}</th>
              <th>{t.leaderboard.score}</th>
              <th>{t.leaderboard.kills}</th>
              <th>{t.leaderboard.deaths}</th>
              <th>{t.leaderboard.assists}</th>
            </tr>
          </thead>

          <tbody>
            {filteredAndSorted.map((p, index) => (
              <tr
                key={p.id}
                className={`${styles.row} ${
                  index === 0
                    ? styles.gold
                    : index === 1
                    ? styles.silver
                    : index === 2
                    ? styles.bronze
                    : ""
                }`}
              >
                <td>
                  <Link to={`/player/${p.id}`} className={styles.playerLink}>
                    {p.name}
                  </Link>
                </td>
                <td>{p.score}</td>
                <td>{p.kills}</td>
                <td>{p.deaths}</td>
                <td>{p.assists}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {!filteredAndSorted.length && (
          <div className={styles.noResults}>
            {t.leaderboard.notFound}
          </div>
        )}
      </div>
    </div>
  );
}
