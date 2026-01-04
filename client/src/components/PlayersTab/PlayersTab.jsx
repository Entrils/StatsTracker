import { useEffect, useMemo, useState } from "react";
import {
  collectionGroup,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from "firebase/firestore";
import { db } from "../../firebase";
import { Link } from "react-router-dom";
import styles from "./PlayersTab.module.css";
import { useLang } from "../../i18n/LanguageContext";

const SORTS = {
  AVG_SCORE: "avgScore",
  WINRATE: "winrate",
  KDA: "kda",
  MATCHES: "matches",
};
const PAGE_SIZE = 300;

export default function PlayersTab() {
  const { t } = useLang();

  const [rawRows, setRawRows] = useState([]);
  const [sortBy, setSortBy] = useState(SORTS.MATCHES);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const [disableCreatedAtOrder, setDisableCreatedAtOrder] = useState(false);

  const fetchPage = async (reset = false) => {
    if (reset) {
      setLoading(true);
      setLastDoc(null);
      setHasMore(true);
      setRawRows([]);
      setError("");
    } else {
      setLoadingMore(true);
    }

    try {
      const base = disableCreatedAtOrder
        ? query(collectionGroup(db, "matches"), limit(PAGE_SIZE))
        : query(
            collectionGroup(db, "matches"),
            orderBy("createdAt", "desc"),
            limit(PAGE_SIZE)
          );
      const q =
        !reset && lastDoc && !disableCreatedAtOrder
          ? query(base, startAfter(lastDoc))
          : base;

      try {
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ownerUid: doc.ref?.parent?.parent?.id,
          ...doc.data(),
        }));

        setRawRows((prev) => (reset ? data : [...prev, ...data]));
        setLastDoc(
          !disableCreatedAtOrder
            ? snapshot.docs[snapshot.docs.length - 1] || null
            : null
        );
        setHasMore(
          disableCreatedAtOrder ? false : snapshot.docs.length === PAGE_SIZE
        );
      } catch (err) {
        const msg = String(err?.message || "");
        if (msg.includes("COLLECTION_GROUP_DESC") || msg.includes("index")) {
          setDisableCreatedAtOrder(true);
          setError(
            t.leaderboard.indexHint ||
              "Index missing for sorting. Showing unsorted data."
          );
          if (reset) {
            const fallbackSnap = await getDocs(
              query(collectionGroup(db, "matches"), limit(PAGE_SIZE))
            );
            const data = fallbackSnap.docs.map((doc) => ({
              id: doc.id,
              ownerUid: doc.ref?.parent?.parent?.id,
              ...doc.data(),
            }));
            setRawRows(data);
            setLastDoc(null);
            setHasMore(false);
          }
          return;
        }
        throw err;
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchPage(true);
  }, []);

  const players = useMemo(() => {
    const map = new Map();

    for (const row of rawRows) {
      const uid = row.ownerUid || row.uid || row.userId;
      if (!uid) continue;

      if (!map.has(uid)) {
        map.set(uid, {
          uid,
          name: row.name || row.playerName || row.username || "Unknown",
          score: 0,
          kills: 0,
          deaths: 0,
          assists: 0,
          wins: 0,
          losses: 0,
          matches: 0,
        });
      }

      const p = map.get(uid);
      p.score += row.score || 0;
      p.kills += row.kills || 0;
      p.deaths += row.deaths || 0;
      p.assists += row.assists || 0;
      if (row.result === "victory" || row.win === 1 || row.win === true) {
        p.wins += 1;
      } else if (row.result === "defeat" || row.win === 0) {
        p.losses += 1;
      }
      p.matches += 1;
    }

    return Array.from(map.values()).map((p) => {
      const avgScore = p.matches ? p.score / p.matches : 0;
      const avgKills = p.matches ? p.kills / p.matches : 0;
      const avgDeaths = p.matches ? p.deaths / p.matches : 0;
      const avgAssists = p.matches ? p.assists / p.matches : 0;
      const kda = (p.kills + p.assists) / Math.max(1, p.deaths);
      const winrate = (p.wins / Math.max(1, p.matches)) * 100 || 0;
      return {
        ...p,
        avgScore,
        avgKills,
        avgDeaths,
        avgAssists,
        kda,
        winrate,
      };
    });
  }, [rawRows]);

  const filteredAndSorted = useMemo(() => {
    const filtered = players.filter((p) =>
      p.name?.toLowerCase().includes(search.toLowerCase())
    );

    return filtered.sort((a, b) => {
      if (sortBy === SORTS.KDA) return (b.kda || 0) - (a.kda || 0);
      if (sortBy === SORTS.WINRATE) return (b.winrate || 0) - (a.winrate || 0);
      if (sortBy === SORTS.MATCHES) return (b.matches || 0) - (a.matches || 0);
      return (b[sortBy] || 0) - (a[sortBy] || 0);
    });
  }, [players, sortBy, search]);

  if (!players.length && !loading) {
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
              onClick={() => setSortBy(SORTS.MATCHES)}
              className={`${styles.sortBtn} ${
                sortBy === SORTS.MATCHES ? styles.active : ""
              }`}
            >
              {t.leaderboard.matches || "Matches"}
            </button>

            <button
              onClick={() => setSortBy(SORTS.WINRATE)}
              className={`${styles.sortBtn} ${
                sortBy === SORTS.WINRATE ? styles.active : ""
              }`}
            >
              {t.leaderboard.winrate || "Winrate"}
            </button>

            <button
              onClick={() => setSortBy(SORTS.AVG_SCORE)}
              className={`${styles.sortBtn} ${
                sortBy === SORTS.AVG_SCORE ? styles.active : ""
              }`}
            >
              {t.leaderboard.avgScore || "Avg score"}
            </button>

            <button
              onClick={() => setSortBy(SORTS.KDA)}
              className={`${styles.sortBtn} ${
                sortBy === SORTS.KDA ? styles.active : ""
              }`}
            >
              {t.leaderboard.kda || "KDA"}
            </button>
          </div>

          <div className={styles.refreshWrap}>
            <button
              onClick={() => fetchPage(true)}
              className={styles.refreshBtn}
              disabled={loading}
            >
              {t.leaderboard.refresh || "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className={styles.noResults}>
          {t.leaderboard.loading || "Loading..."}
        </div>
      )}
      {!loading && error && (
        <div className={styles.noResults}>{error}</div>
      )}

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t.upload.player}</th>
              <th>{t.leaderboard.matches || "Matches"}</th>
              <th>{t.leaderboard.wl || "W/L"}</th>
              <th>{t.leaderboard.winrate || "Winrate"}</th>
              <th>{t.leaderboard.avgScore || "Avg score"}</th>
              <th>{t.leaderboard.kda || "KDA"}</th>
            </tr>
          </thead>

          <tbody>
            {filteredAndSorted.map((p, index) => {
              const kda = p.kda.toFixed(2);
              const avgScore = Math.round(p.avgScore);
              const winrate = p.winrate.toFixed(1);

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
                  <td>{p.matches}</td>
                  <td className={styles.wlCell}>
                    <span className={styles.winText}>W</span> {p.wins}
                    <span className={styles.wlSep}>/</span>
                    <span className={styles.lossText}>L</span> {p.losses}
                  </td>
                  <td>{winrate}%</td>
                  <td>{avgScore}</td>
                  <td>{kda}</td>
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

      {hasMore && !loading && (
        <div className={styles.loadMoreWrap}>
          <button
            className={styles.loadMoreBtn}
            onClick={() => fetchPage(false)}
            disabled={loadingMore}
          >
            {loadingMore
              ? t.leaderboard.loading || "Loading..."
              : t.leaderboard.loadMore || "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
