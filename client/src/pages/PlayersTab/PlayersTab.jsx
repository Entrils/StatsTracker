import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import styles from "@/pages/PlayersTab/PlayersTab.module.css";
import { useLang } from "@/i18n/LanguageContext";

const SORTS = {
  AVG_SCORE: "avgScore",
  WINRATE: "winrate",
  KDA: "kda",
  MATCHES: "matches",
};
const PAGE_SIZE = 300;

export default function PlayersTab() {
  const { t } = useLang();

  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const [rawRows, setRawRows] = useState([]);
  const [sortBy, setSortBy] = useState(SORTS.MATCHES);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");

  const fetchPage = async (reset = false) => {
    if (reset) {
      setLoading(true);
      setHasMore(true);
      setRawRows([]);
      setError("");
    } else {
      setLoadingMore(true);
    }

    try {
      if (!backendUrl) {
        throw new Error("Backend URL not configured");
      }

      const offset = reset ? 0 : rawRows.length;
      const res = await fetch(
        `${backendUrl}/leaderboard?limit=${PAGE_SIZE}&offset=${offset}&sort=${sortBy}`
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to load leaderboard");
      }

      const payload = await res.json();
      const data = Array.isArray(payload.rows) ? payload.rows : [];
      const total = Number.isFinite(payload.total) ? payload.total : data.length;

      setRawRows((prev) => (reset ? data : [...prev, ...data]));
      setHasMore(offset + data.length < total);
    } catch (err) {
      setError(
        err?.message || t.leaderboard.error || "Failed to load leaderboard"
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchPage(true);
  }, [sortBy]);

  const players = useMemo(() => {
    return rawRows
      .filter((row) => row && (row.uid || row.ownerUid || row.userId))
      .map((row) => ({
        uid: row.uid || row.ownerUid || row.userId,
        name: row.name || row.playerName || row.username || "Unknown",
        score: row.score || 0,
        kills: row.kills || 0,
        deaths: row.deaths || 0,
        assists: row.assists || 0,
        wins: row.wins || 0,
        losses: row.losses || 0,
        matches: row.matches || 0,
        avgScore: row.avgScore || 0,
        avgKills: row.avgKills || 0,
        avgDeaths: row.avgDeaths || 0,
        avgAssists: row.avgAssists || 0,
        kda: row.kda || 0,
        winrate: row.winrate || 0,
        settings: row.settings || {},
        createdAt: row.createdAt || row.firstMatchAt || row.updatedAt || 0,
        rank: Number.isFinite(row.rank) ? row.rank : null,
        rankDelta: Number.isFinite(row.rankDelta) ? row.rankDelta : 0,
      }));
  }, [rawRows]);

  const filteredAndSorted = useMemo(() => {
    return players.filter((p) =>
      p.name?.toLowerCase().includes(search.toLowerCase())
    );
  }, [players, search]);

  if (!players.length && !loading) {
    if (error) {
      return <p className={styles.empty}>{error}</p>;
    }
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
              <th>#</th>
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
              const socials = p.settings || {};

              const rank = p.rank ?? index + 1;
              const delta = p.rankDelta || 0;
              const deltaAbs = Math.abs(delta);
              const createdAtMs =
                typeof p.createdAt === "number"
                  ? p.createdAt
                  : typeof p.createdAt === "string"
                  ? Date.parse(p.createdAt)
                  : p.createdAt?.seconds
                  ? p.createdAt.seconds * 1000
                  : p.createdAt?._seconds
                  ? p.createdAt._seconds * 1000
                  : 0;
              const isNew =
                createdAtMs &&
                Date.now() - createdAtMs < 7 * 24 * 60 * 60 * 1000;
              const deltaLabel = isNew
                ? "NEW"
                : delta === 0
                ? "=0"
                : `${delta > 0 ? "▲" : "▼"} ${deltaAbs}`;
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
                  <td className={styles.rankCell}>
                    <div className={styles.rankWrap}>
                      <span className={styles.rankValue}>{rank}</span>
                      <span
                        className={`${styles.rankDelta} ${
                          isNew
                            ? styles.rankNew
                            : delta > 0
                            ? styles.rankUp
                            : delta < 0
                            ? styles.rankDown
                            : styles.rankSame
                        }`}
                      >
                        {deltaLabel}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className={styles.playerCell}>
                      <Link
                        to={`/player/${p.uid}`}
                        className={styles.playerLink}
                      >
                        {p.name}
                      </Link>
                      <div className={styles.socialIcons}>
                        {renderSocialIcon("twitch", socials.twitch)}
                        {renderSocialIcon("youtube", socials.youtube)}
                        {renderSocialIcon("tiktok", socials.tiktok)}
                      </div>
                    </div>
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

function renderSocialIcon(type, value) {
  if (!value) return null;
  const url = normalizeSocialUrl(type, value);
  const label =
    type === "twitch" ? "Twitch" : type === "youtube" ? "YouTube" : "TikTok";
  return (
    <a
      key={type}
      className={`${styles.socialIcon} ${styles[`social${label}`] || ""}`}
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
    >
      <img
        src={
          type === "twitch"
            ? "/twitch.png"
            : type === "youtube"
            ? "/yt.png"
            : "/tiktok.png"
        }
        alt={label}
        loading="lazy"
      />
    </a>
  );
}

function normalizeSocialUrl(type, value) {
  const v = String(value).trim();
  if (!v) return "#";
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  if (type === "twitch") return `https://twitch.tv/${v.replace(/^@/, "")}`;
  if (type === "youtube") return `https://youtube.com/${v.replace(/^@/, "@")}`;
  return `https://tiktok.com/${v.replace(/^@/, "")}`;
}

