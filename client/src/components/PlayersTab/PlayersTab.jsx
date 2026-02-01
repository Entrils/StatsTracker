import { useEffect, useMemo, useState } from "react";
import {
  collectionGroup,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../../firebase";
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

  const [rawRows, setRawRows] = useState([]);
  const [sortBy, setSortBy] = useState(SORTS.SCORE);
  const [search, setSearch] = useState("");

  // 🔥 Слушаем ВСЕ players во ВСЕХ матчах
  useEffect(() => {
    const unsub = onSnapshot(
      collectionGroup(db, "players"),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => doc.data());
        setRawRows(data);
      }
    );

    return () => unsub();
  }, []);

  // 🧠 Агрегация по пользователю
  const players = useMemo(() => {
    const map = new Map();

    for (const row of rawRows) {
      const uid = row.ownerUid;
      if (!uid) continue;

      if (!map.has(uid)) {
        map.set(uid, {
          uid,
          name: row.name,
          score: 0,
          kills: 0,
          deaths: 0,
          assists: 0,
          matches: 0,
        });
      }

      const p = map.get(uid);
      p.score += row.score || 0;
      p.kills += row.kills || 0;
      p.deaths += row.deaths || 0;
      p.assists += row.assists || 0;
      p.matches += 1;
    }

    return Array.from(map.values());
  }, [rawRows]);

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
            {filteredAndSorted.map((p, index) => {
              const kda = (
                (p.kills + p.assists) /
                Math.max(1, p.deaths)
              ).toFixed(2);

              return (
                <tr
                  key={p.uid}
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
                    <Link
                      to={`/player/${p.uid}`}
                      className={styles.playerLink}
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td>{p.score}</td>
                  <td>{p.kills}</td>
                  <td>{p.deaths}</td>
                  <td>{p.assists}</td>
                </tr>
              );
            })}
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
