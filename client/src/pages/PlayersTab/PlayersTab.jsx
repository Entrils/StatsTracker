import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import styles from "@/pages/PlayersTab/PlayersTab.module.css";
import StateMessage from "@/components/StateMessage/StateMessage";
import PageState from "@/components/StateMessage/PageState";
import TrustMetaBar from "@/components/TrustMetaBar/TrustMetaBar";
import Button from "@/components/ui/Button";
import { useLang } from "@/i18n/LanguageContext";
import { dedupedJsonRequest } from "@/utils/network/dedupedFetch";
import { trackUxEvent } from "@/utils/analytics/trackUxEvent";

const SORTS = {
  ELO: "elo",
  AVG_SCORE: "avgScore",
  WINRATE: "winrate",
  KDA: "kda",
  MATCHES: "matches",
};
const PAGE_SIZE = 300;
const SKELETON_ROWS = 8;
const LAST_FILTER_STORAGE_KEY = "players_last_filter_v1";

export default function PlayersTab() {
  const { t } = useLang();

  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const [rawRows, setRawRows] = useState([]);
  const [sortBy, setSortBy] = useState(SORTS.MATCHES);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [steamOnline, setSteamOnline] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(0);
  const rawRowsRef = useRef([]);
  const activationTrackedRef = useRef(false);

  useEffect(() => {
    rawRowsRef.current = rawRows;
  }, [rawRows]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LAST_FILTER_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const nextSearch = String(parsed?.search || "");
      const nextSort = String(parsed?.sortBy || SORTS.MATCHES);
      setSearch(nextSearch);
      if (Object.values(SORTS).includes(nextSort)) {
        setSortBy(nextSort);
      }
    } catch {
      // ignore read errors
    }
  }, []);

  const fetchPage = useCallback(async (reset = false) => {
    if (reset) {
      setRefreshing(rawRowsRef.current.length > 0);
      setLoading(true);
      setHasMore(true);
      setNextCursor(null);
      setRawRows([]);
      setError("");
    } else {
      setLoadingMore(true);
    }

    try {
      if (!backendUrl) {
        throw new Error("Backend URL not configured");
      }

      const offset = reset ? 0 : rawRowsRef.current.length;
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        sort: String(sortBy),
      });
      if (!reset && nextCursor?.afterUid && Number.isFinite(Number(nextCursor?.afterValue))) {
        params.set("afterUid", String(nextCursor.afterUid));
        params.set("afterValue", String(Number(nextCursor.afterValue)));
      }
      const url = `${backendUrl}/leaderboard?${params.toString()}`;
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
      const onlineRaw = Number(payload.steamOnline);
      setSteamOnline(Number.isFinite(onlineRaw) && onlineRaw >= 0 ? onlineRaw : null);

      setRawRows((prev) => (reset ? data : [...prev, ...data]));
      const hasMoreValue =
        typeof payload?.hasMore === "boolean"
          ? payload.hasMore
          : data.length === PAGE_SIZE;
      setHasMore(Boolean(hasMoreValue));
      setNextCursor(
        payload?.nextCursor &&
          typeof payload.nextCursor === "object" &&
          payload.nextCursor.afterUid
          ? payload.nextCursor
          : null
      );
      setLastSyncedAt(Date.now());
    } catch (err) {
      setError(
        err?.message || t.leaderboard?.error || "Failed to load leaderboard"
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [backendUrl, nextCursor, sortBy, t.leaderboard?.error]);

  useEffect(() => {
    fetchPage(true);
  }, [fetchPage]);

  useEffect(() => {
    if (activationTrackedRef.current) return;
    if (loading) return;
    if (!rawRows.length) return;
    activationTrackedRef.current = true;
    trackUxEvent("activation_target_action", {
      meta: {
        source: "players_tab",
        sortBy,
        playersLoaded: rawRows.length,
      },
    });
  }, [loading, rawRows.length, sortBy]);

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
        elo: Number.isFinite(Number(row.elo ?? row.hiddenElo))
          ? Number(row.elo ?? row.hiddenElo)
          : 0,
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

  const quickInsight = useMemo(() => {
    if (!filteredAndSorted.length) return null;
    const top = filteredAndSorted[0];
    if (!top?.uid) return null;
    if (sortBy === SORTS.WINRATE) {
      return {
        uid: top.uid,
        name: top.name,
        metric: t.leaderboard?.winrate || "Winrate",
        value: `${Number(top.winrate || 0).toFixed(1)}%`,
      };
    }
    if (sortBy === SORTS.KDA) {
      return {
        uid: top.uid,
        name: top.name,
        metric: t.leaderboard?.kda || "KDA",
        value: Number(top.kda || 0).toFixed(2),
      };
    }
    if (sortBy === SORTS.AVG_SCORE) {
      return {
        uid: top.uid,
        name: top.name,
        metric: t.leaderboard?.avgScore || "Avg score",
        value: String(Math.round(Number(top.avgScore || 0))),
      };
    }
    if (sortBy === SORTS.ELO) {
      return {
        uid: top.uid,
        name: top.name,
        metric: t.leaderboard?.elo || "ELO",
        value: String(Math.round(Number(top.elo || 0))),
      };
    }
    return {
      uid: top.uid,
      name: top.name,
      metric: t.leaderboard?.matches || "Matches",
      value: String(Math.round(Number(top.matches || 0))),
    };
  }, [filteredAndSorted, sortBy, t.leaderboard]);

  const discoveryInsights = useMemo(() => {
    if (!filteredAndSorted.length) return [];

    const growth = [...filteredAndSorted]
      .filter((p) => Number(p.rankDelta || 0) > 0)
      .sort((a, b) => (b.rankDelta || 0) - (a.rankDelta || 0))[0];

    const trend = [...filteredAndSorted]
      .filter((p) => Number(p.matches || 0) >= 10)
      .sort((a, b) => {
        const scoreA = Number(a.winrate || 0) * 2 + Number(a.kda || 0) * 15;
        const scoreB = Number(b.winrate || 0) * 2 + Number(b.kda || 0) * 15;
        return scoreB - scoreA;
      })[0];

    const newcomers = filteredAndSorted
      .filter((p) => isNewPlayer(p.createdAt))
      .sort((a, b) => Number(b.elo || 0) - Number(a.elo || 0))[0];

    const items = [];
    if (growth?.uid) {
      items.push({
        key: "growth",
        uid: growth.uid,
        title: t.leaderboard?.discoveryGrowthTitle || "Fast Climber",
        text: (t.leaderboard?.discoveryGrowthText ||
          "{name} jumped {value} spots. Check what boosted them.")
          .replace("{name}", growth.name)
          .replace("{value}", String(Math.round(Number(growth.rankDelta || 0)))),
      });
    }
    if (trend?.uid) {
      items.push({
        key: "trend",
        uid: trend.uid,
        title: t.leaderboard?.discoveryTrendTitle || "Hot Form",
        text: (t.leaderboard?.discoveryTrendText ||
          "{name} is heating up: {winrate}% WR and {kda} KDA.")
          .replace("{name}", trend.name)
          .replace("{winrate}", Number(trend.winrate || 0).toFixed(1))
          .replace("{kda}", Number(trend.kda || 0).toFixed(2)),
      });
    }
    if (newcomers?.uid) {
      items.push({
        key: "newcomer",
        uid: newcomers.uid,
        title: t.leaderboard?.discoveryNewTitle || "New Challenger",
        text: (t.leaderboard?.discoveryNewText ||
          "{name} is a new entry with {elo} ELO. Keep an eye on them.")
          .replace("{name}", newcomers.name)
          .replace("{elo}", String(Math.round(Number(newcomers.elo || 0)))),
      });
    }
    return items.slice(0, 2);
  }, [filteredAndSorted, t.leaderboard]);

  const trustMeta = useMemo(() => {
    const syncLabel = lastSyncedAt
      ? new Date(lastSyncedAt).toLocaleTimeString()
      : (t.leaderboard?.trustPending || "pending");
    const sourceText = t.leaderboard?.trustSource || "Community match uploads";
    const coverageText = (t.leaderboard?.trustCoverage || "Up to {limit} rows per request")
      .replace("{limit}", String(PAGE_SIZE));
    const syncedText = (t.leaderboard?.trustSynced || "Synced: {time}")
      .replace("{time}", syncLabel);
    return `${sourceText} | ${coverageText} | ${syncedText}`;
  }, [lastSyncedAt, t.leaderboard]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LAST_FILTER_STORAGE_KEY, JSON.stringify({
        sortBy,
        search,
      }));
    } catch {
      // ignore write errors
    }
  }, [sortBy, search]);

  const clearFilter = useCallback(() => {
    setSearch("");
    setSortBy(SORTS.MATCHES);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(LAST_FILTER_STORAGE_KEY);
      } catch {
        // ignore storage errors
      }
    }
    trackUxEvent("saved_view_deleted", {
      meta: {
        source: "players_tab",
        id: "last_filter",
        name: "last_filter",
        search,
        sortBy,
      },
    });
  }, [search, sortBy]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t.leaderboard.title}</h1>
        {steamOnline !== null && (
          <p className={styles.steamOnline}>
            {t.leaderboard.steamOnline || "Steam online"}:{" "}
            <strong>{steamOnline.toLocaleString()}</strong>
          </p>
        )}
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
              onClick={() => setSortBy(SORTS.ELO)}
              className={`${styles.sortBtn} ${
                sortBy === SORTS.ELO ? styles.active : ""
              }`}
              variant="secondary"
              size="sm"
              disabled={loading || loadingMore}
            >
              {t.leaderboard.elo || "ELO"}
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
          <button
            type="button"
            className={styles.savedViewsBtn}
            onClick={clearFilter}
          >
            {t.leaderboard?.resetFilter || "Reset filter"}
          </button>

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
        {!!quickInsight && (
          <div className={styles.quickInsight}>
            <div className={styles.quickInsightMeta}>
              <p className={styles.quickInsightTitle}>
                {t.leaderboard?.quickInsightTitle || "Who Is Popping Off"}
              </p>
              <p className={styles.quickInsightText}>
                {(t.leaderboard?.quickInsightText ||
                  "{name} is topping {metric}: {value}. Jump into profile to see the build-up.")
                  .replace("{name}", quickInsight.name)
                  .replace("{metric}", quickInsight.metric)
                  .replace("{value}", quickInsight.value)}
              </p>
            </div>
            <Link
              to={`/player/${quickInsight.uid}`}
              className={styles.quickInsightCta}
              onClick={() =>
                trackUxEvent("activation_target_action", {
                  meta: {
                    source: "players_quick_insight_cta",
                    sortBy,
                    uid: quickInsight.uid,
                  },
                })
              }
            >
              {t.leaderboard?.quickInsightCta || "Open Player Breakdown"}
            </Link>
          </div>
        )}
        {!!discoveryInsights.length && (
          <div className={styles.discoveryGrid}>
            {discoveryInsights.map((item) => (
              <div className={styles.discoveryCard} key={item.key}>
                <p className={styles.discoveryTitle}>{item.title}</p>
                <p className={styles.discoveryText}>{item.text}</p>
                <Link
                  to={`/player/${item.uid}`}
                  className={styles.discoveryCta}
                  onClick={() =>
                    trackUxEvent("activation_target_action", {
                      meta: {
                        source: "players_discovery_cta",
                        type: item.key,
                        uid: item.uid,
                        sortBy,
                      },
                    })
                  }
                >
                  {t.leaderboard?.discoveryCta || t.leaderboard?.quickInsightCta || "Open Player Breakdown"}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <PageState
        loading={loading}
        error={error}
        empty={!players.length}
        errorText={error}
        emptyText={t.leaderboard.empty}
        renderLoading={() => (
          <div className={styles.skeletonWrap} aria-hidden="true">
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <div className={styles.skeletonRow} key={i}>
                <span className={`${styles.skeletonCell} ${styles.skeletonRank}`} />
                <span className={`${styles.skeletonCell} ${styles.skeletonPlayer}`} />
                <span className={styles.skeletonCell} />
                <span className={styles.skeletonCell} />
                <span className={styles.skeletonCell} />
                <span className={styles.skeletonCell} />
                <span className={styles.skeletonCell} />
              </div>
            ))}
          </div>
        )}
      >
        <>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t.upload.player}</th>
                  <th>
                    <span className={styles.thLabel}>
                      {t.leaderboard.elo || "ELO"}
                      <Link
                        to="/help#elo-rating"
                        className={styles.eloHelpLink}
                        aria-label={t.help?.eloTitle || "ELO rating help"}
                        title={t.help?.eloTitle || "ELO rating help"}
                      >
                        ?
                      </Link>
                    </span>
                  </th>
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
                  const isNew = isNewPlayer(createdAtMs);
                  const deltaLabel = isNew
                    ? t.leaderboard?.newLabel || "NEW"
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
                      <td>{Math.round(p.elo || 0)}</td>
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
              const isNew = isNewPlayer(createdAtMs);
              const deltaLabel = isNew
                ? t.leaderboard?.newLabel || "NEW"
                : delta === 0
                ? "=0"
                : `${delta > 0 ? "+" : "-"} ${Math.abs(delta)}`;
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
                  <Link to={`/player/${p.uid}`} className={styles.mobileCta}>
                    {t.leaderboard?.openProfile || "Player Profile"}
                  </Link>
                  <div className={styles.mobileMetaPrimary}>
                    <span>{t.leaderboard.elo || "ELO"}: {Math.round(p.elo || 0)}</span>
                    <span>{t.leaderboard.winrate || "Winrate"}: {p.winrate.toFixed(1)}%</span>
                    <span>{t.leaderboard.kda || "KDA"}: {p.kda.toFixed(2)}</span>
                  </div>
                  <div className={styles.mobileMetaSecondary}>
                    <span>{t.leaderboard.matches || "Matches"}: {p.matches}</span>
                    <span>{t.leaderboard.avgScore || "Avg score"}: {Math.round(p.avgScore)}</span>
                  </div>
                </article>
              );
            })}
          </div>

          {hasMore && (
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
          <TrustMetaBar text={trustMeta} className={styles.trustMeta} />
        </>
      </PageState>
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

function isNewPlayer(rawCreatedAt) {
  const createdAtMs = parseCreatedAt(rawCreatedAt);
  return createdAtMs > 0 && Date.now() - createdAtMs < 7 * 24 * 60 * 60 * 1000;
}

function parseCreatedAt(rawCreatedAt) {
  if (typeof rawCreatedAt === "number") return rawCreatedAt;
  if (typeof rawCreatedAt === "string") return Date.parse(rawCreatedAt);
  if (rawCreatedAt?.seconds) return rawCreatedAt.seconds * 1000;
  if (rawCreatedAt?._seconds) return rawCreatedAt._seconds * 1000;
  return 0;
}
