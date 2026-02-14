import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import styles from "@/pages/PlayersTab/PlayersTab.module.css";
import StateMessage from "@/components/StateMessage/StateMessage";
import Button from "@/components/ui/Button";
import { useLang } from "@/i18n/LanguageContext";
import { dedupedJsonRequest } from "@/utils/network/dedupedFetch";

const SORTS = {
  AVG_SCORE: "avgScore",
  WINRATE: "winrate",
  KDA: "kda",
  MATCHES: "matches",
};
const PAGE_SIZE = 300;
const SKELETON_ROWS = 8;

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
  const [refreshing, setRefreshing] = useState(false);

  const fetchPage = async (reset = false) => {
    if (reset) {
      setRefreshing(rawRows.length > 0);
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
      const url = `${backendUrl}/leaderboard?limit=${PAGE_SIZE}&offset=${offset}&sort=${sortBy}`;
      const payload = await dedupedJsonRequest(
        `leaderboard:${url}`,
        async () => {
          const res = await fetch(url);
          if (!res.ok) {
            const text = await res.text();
            const error = new Error(text || "Failed to load leaderboard");
            error.status = res.status;
            throw error;
          }
          return res.json();
        },
        2500
      );
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
      setRefreshing(false);
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
      return (
        <div className={styles.wrapper}>
          <StateMessage text={error} tone="error" />
        </div>
      );
    }
    return (
      <div className={styles.wrapper}>
        <StateMessage text={t.leaderboard.empty} tone="empty" />
      </div>
    );
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
            <Button
              onClick={() => setSortBy(SORTS.MATCHES)}
              className={`${styles.sortBtn} ${
                sortBy === SORTS.MATCHES ? styles.active : ""
              }`}
              variant="secondary"
              size="sm"
              disabled={loading || loadingMore}
            >
              {t.leaderboard.matches || "Matches"}
            </Button>

            <Button
              onClick={() => setSortBy(SORTS.WINRATE)}
              className={`${styles.sortBtn} ${
                sortBy === SORTS.WINRATE ? styles.active : ""
              }`}
              variant="secondary"
              size="sm"
              disabled={loading || loadingMore}
            >
              {t.leaderboard.winrate || "Winrate"}
            </Button>

            <Button
              onClick={() => setSortBy(SORTS.AVG_SCORE)}
              className={`${styles.sortBtn} ${
                sortBy === SORTS.AVG_SCORE ? styles.active : ""
              }`}
              variant="secondary"
              size="sm"
              disabled={loading || loadingMore}
            >
              {t.leaderboard.avgScore || "Avg score"}
            </Button>

            <Button
              onClick={() => setSortBy(SORTS.KDA)}
              className={`${styles.sortBtn} ${
                sortBy === SORTS.KDA ? styles.active : ""
              }`}
              variant="secondary"
              size="sm"
              disabled={loading || loadingMore}
            >
              {t.leaderboard.kda || "KDA"}
            </Button>
          </div>

          <div className={styles.refreshWrap}>
            <Button
              onClick={() => fetchPage(true)}
              className={styles.refreshBtn}
              disabled={loading || loadingMore}
              aria-label={t.leaderboard.refresh || "Refresh"}
              title={t.leaderboard.refresh || "Refresh"}
              variant="secondary"
              iconOnly
              aria-busy={refreshing ? "true" : "false"}
            >
              <svg
                className={`${styles.refreshIcon} ${
                  refreshing ? styles.refreshIconSpinning : ""
                }`}
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M20 12a8 8 0 1 1-2.34-5.66"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M20 4v5h-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className={styles.visuallyHidden}>
                {t.leaderboard.refresh || "Refresh"}
              </span>
            </Button>
          </div>
        </div>
      </div>

      {loading && (
        <div className={styles.skeletonWrap} aria-hidden="true">
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <div className={styles.skeletonRow} key={i}>
              <span className={`${styles.skeletonCell} ${styles.skeletonRank}`} />
              <span className={`${styles.skeletonCell} ${styles.skeletonPlayer}`} />
              <span className={styles.skeletonCell} />
              <span className={styles.skeletonCell} />
              <span className={styles.skeletonCell} />
              <span className={styles.skeletonCell} />
            </div>
          ))}
        </div>
      )}
      {!loading && error && <StateMessage text={error} tone="error" />}

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
                : `${delta > 0 ? "+" : "-"} ${deltaAbs}`;
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
          <StateMessage text={t.leaderboard.notFound} tone="empty" />
        )}
      </div>
      <div className={styles.mobileList}>
        {filteredAndSorted.map((p, index) => {
          const rank = p.rank ?? index + 1;
          const delta = p.rankDelta || 0;
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
          const isNew = createdAtMs && Date.now() - createdAtMs < 7 * 24 * 60 * 60 * 1000;
          const deltaLabel = isNew ? "NEW" : delta === 0 ? "=0" : `${delta > 0 ? "+" : "-"} ${Math.abs(delta)}`;
          return (
            <article className={styles.mobileCard} key={`mobile-${p.uid}`}>
              <div className={styles.mobileTop}>
                <span className={styles.mobileRank}>#{rank}</span>
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
              <Link to={`/player/${p.uid}`} className={styles.mobileName}>
                {p.name}
              </Link>
              <div className={styles.mobileMeta}>
                <span>{t.leaderboard.matches || "Matches"}: {p.matches}</span>
                <span>{t.leaderboard.winrate || "Winrate"}: {p.winrate.toFixed(1)}%</span>
                <span>{t.leaderboard.avgScore || "Avg score"}: {Math.round(p.avgScore)}</span>
                <span>{t.leaderboard.kda || "KDA"}: {p.kda.toFixed(2)}</span>
              </div>
            </article>
          );
        })}
      </div>

      {hasMore && !loading && (
        <div className={styles.loadMoreWrap}>
          <Button
            className={styles.loadMoreBtn}
            onClick={() => fetchPage(false)}
            disabled={loadingMore}
            variant="secondary"
            size="md"
          >
            {loadingMore
              ? t.leaderboard.loading || "Loading..."
              : t.leaderboard.loadMore || "Load more"}
          </Button>
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
