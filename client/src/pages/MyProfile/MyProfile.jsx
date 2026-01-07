import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from "firebase/firestore";
import { db } from "../../firebase";
import styles from "./MyProfile.module.css";
import { useLang } from "../../i18n/LanguageContext";
import { useAuth } from "../../auth/AuthContext";

const MATCHES_PAGE_SIZE = 80;
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

const ChartSection = lazy(() => import("./ChartSection"));
const LastMatchesTable = lazy(() => import("./LastMatchesTable"));

function safeDiv(a, b) {
  return b === 0 ? 0 : a / b;
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

function sign(x) {
  return x >= 0 ? "+" : "";
}

function diffAccent(delta, preferHigher = true) {
  if (delta === 0) return "";
  const good = preferHigher ? delta > 0 : delta < 0;
  return good ? "good" : "bad";
}

function normalizeSpark(data, base) {
  if (!Array.isArray(data)) return [];
  if (!base) return data;
  return data.map((v) => safeDiv(v, base));
}

function perfColor(ratio) {
  if (!Number.isFinite(ratio)) return "rgba(255,255,255,0.3)";
  const clamped = Math.max(0, Math.min(2, ratio));
  const t = clamped / 2;
  const hue = Math.round(120 * t);
  return `hsl(${hue} 85% 55%)`;
}

function perfWidth(ratio) {
  if (!Number.isFinite(ratio)) return "0%";
  const clamped = Math.max(0, Math.min(2, ratio));
  return `${Math.round((clamped / 2) * 100)}%`;
}

export default function MyProfile() {
  const { t } = useLang();
  const { user, claims } = useAuth();

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  const [globalAvg, setGlobalAvg] = useState(null);
  const [loadingGlobal, setLoadingGlobal] = useState(true);
  const [globalRanks, setGlobalRanks] = useState(null);
  const [globalMeans, setGlobalMeans] = useState(null);
  const [globalMatchMeans, setGlobalMatchMeans] = useState(null);
  const [loadingRanks, setLoadingRanks] = useState(false);
  const [chartMetric, setChartMetric] = useState(() => {
    if (typeof window === "undefined") return "all";
    return localStorage.getItem("myProfile.chartMetric") || "all";
  });
  const chartToggleRef = useRef(null);
  const chartPillRefs = useRef({});
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });
  const activityGridWrapRef = useRef(null);
  const [activityLayout, setActivityLayout] = useState({
    cellSize: 18,
    gap: 6,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("myProfile.chartMetric", chartMetric);
  }, [chartMetric]);

  useEffect(() => {
    const updatePill = () => {
      const container = chartToggleRef.current;
      const pill = chartPillRefs.current[chartMetric];
      if (!container || !pill) return;
      const cRect = container.getBoundingClientRect();
      const pRect = pill.getBoundingClientRect();
      setPillStyle({
        left: pRect.left - cRect.left,
        width: pRect.width,
      });
    };

    updatePill();
    window.addEventListener("resize", updatePill);
    return () => window.removeEventListener("resize", updatePill);
  }, [chartMetric]);

  const uid = user?.uid;

  const fetchHistory = async (reset = false) => {
    if (!uid) return;
    if (reset) {
      setLoading(true);
      setMatches([]);
      setLastDoc(null);
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const base = query(
        collection(db, "users", uid, "matches"),
        orderBy("createdAt", "asc"),
        limit(MATCHES_PAGE_SIZE)
      );
      const q = !reset && lastDoc ? query(base, startAfter(lastDoc)) : base;
      const snapshot = await getDocs(q);

      const data = snapshot.docs.map((d, i) => {
        const m = d.data();
        return {
          index: i + 1,
          id: d.id,
          ...m,
          win: m.result === "victory" ? 1 : 0,
        };
      });

      setMatches((prev) => {
        const merged = reset ? data : [...prev, ...data];
        return merged.map((m, idx) => ({ ...m, index: idx + 1 }));
      });
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === MATCHES_PAGE_SIZE);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!uid) return;
    fetchHistory(true);
  }, [uid]);


  const summary = useMemo(() => {
    if (!matches.length) return null;

    let wins = 0;
    let losses = 0;

    const total = matches.reduce(
      (acc, m) => {
        acc.score += m.score || 0;
        acc.kills += m.kills || 0;
        acc.deaths += m.deaths || 0;
        acc.assists += m.assists || 0;
        acc.damage += m.damage || 0;
        acc.damageShare += m.damageShare || 0;

        if (m.result === "victory") wins += 1;
        else if (m.result === "defeat") losses += 1;

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

    const avgScoreRaw = safeDiv(total.score, matches.length);
    const avgKillsRaw = safeDiv(total.kills, matches.length);
    const avgDeathsRaw = safeDiv(total.deaths, matches.length);
    const avgAssistsRaw = safeDiv(total.assists, matches.length);
    const avgDamageRaw = safeDiv(total.damage, matches.length);
    const avgDamageShareRaw = safeDiv(total.damageShare, matches.length);

    const avgScore = Math.round(avgScoreRaw);
    const avgKills = Math.round(avgKillsRaw);
    const avgDeaths = Math.round(avgDeathsRaw);
    const avgAssists = Math.round(avgAssistsRaw);
    const avgDamage = Math.round(avgDamageRaw);
    const avgDamageShare = round1(avgDamageShareRaw);

    const kdaRaw = safeDiv(
      total.kills + total.assists,
      Math.max(1, total.deaths)
    );
    const kda = round1(kdaRaw);

    const winrateRaw = safeDiv(wins * 100, wins + losses);
    const winrate = round1(winrateRaw);

    const bestScore = matches.reduce(
      (best, m) => ((m.score || 0) > (best.score || 0) ? m : best),
      matches[0]
    );

    const worstScore = matches.reduce(
      (worst, m) => ((m.score || 0) < (worst.score || 0) ? m : worst),
      matches[0]
    );

    const maxKills = matches.reduce(
      (best, m) => ((m.kills || 0) > (best.kills || 0) ? m : best),
      matches[0]
    );

    const maxDamage = matches.reduce(
      (best, m) => ((m.damage || 0) > (best.damage || 0) ? m : best),
      matches[0]
    );

    const maxDeaths = matches.reduce(
      (best, m) => ((m.deaths || 0) > (best.deaths || 0) ? m : best),
      matches[0]
    );

    const maxAssists = matches.reduce(
      (best, m) => ((m.assists || 0) > (best.assists || 0) ? m : best),
      matches[0]
    );

    const maxKda = matches.reduce((best, m) => {
      const k = safeDiv((m.kills || 0) + (m.assists || 0), Math.max(1, m.deaths || 0));
      return k > best ? k : best;
    }, 0);

    const last10 = [...matches].slice(-10).reverse();
    const last10Chrono = matches.slice(-10);

    const last5 = matches.slice(-5);
    const prev5 = matches.slice(-10, -5);

    const avg = (arr, key) =>
      arr.length ? arr.reduce((s, x) => s + (x[key] || 0), 0) / arr.length : 0;

    const trendScore = round1(avg(last5, "score") - avg(prev5, "score"));
    const trendKills = round1(avg(last5, "kills") - avg(prev5, "kills"));

    return {
      name:
        matches[0]?.name ||
        claims?.username ||
        user?.displayName ||
        user?.email ||
        uid,

      matchesCount: matches.length,

      wins,
      losses,
      winrate,

      totalScore: total.score,
      totalKills: total.kills,
      totalDeaths: total.deaths,
      totalAssists: total.assists,
      totalDamage: total.damage,

      avgScore,
      avgKills,
      avgDeaths,
      avgAssists,
      avgDamage,
      avgDamageShare,
      kda,

      avgScoreRaw,
      avgKillsRaw,
      avgDeathsRaw,
      avgAssistsRaw,
      avgDamageRaw,
      avgDamageShareRaw,
      kdaRaw,
      winrateRaw,

      bestScore,
      worstScore,
      maxKills,
      maxDeaths,
      maxAssists,
      maxDamage,

      trendScore,
      trendKills,

      last10,

      sparkScoreRaw: last10Chrono.map((m) => m.score || 0),
      sparkKdaRaw: last10Chrono.map((m) =>
        round1(
          safeDiv((m.kills || 0) + (m.assists || 0), Math.max(1, m.deaths || 0))
        )
      ),
      sparkWinrateRaw: last10Chrono.map((_, i) => {
        const slice = last10Chrono.slice(0, i + 1);
        const w = slice.filter((m) => m.result === "victory").length;
        const l = slice.filter((m) => m.result === "defeat").length;
        return round1(safeDiv(w * 100, w + l));
      }),

      maxKda,
    };
  }, [matches, claims, user, uid]);

  useEffect(() => {
    if (!summary) return;
    const controller = new AbortController();
    setLoadingGlobal(true);
    setGlobalAvg(null);
    setGlobalMeans(null);
    setGlobalMatchMeans(null);
    setGlobalRanks(null);
    setLoadingRanks(true);

    fetch(`${BACKEND_URL}/stats/percentiles?refresh=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metrics: {
          matches: summary.matchesCount,
          wins: summary.wins,
          losses: summary.losses,
          avgScore: summary.avgScoreRaw,
          avgKills: summary.avgKillsRaw,
          avgDeaths: summary.avgDeathsRaw,
          avgAssists: summary.avgAssistsRaw,
          avgDamage: summary.avgDamageRaw,
          avgDamageShare: summary.avgDamageShareRaw,
          kda: summary.kdaRaw,
          winrate: summary.winrateRaw,
        },
      }),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setGlobalRanks(data.percentiles || null);
        setGlobalMeans(data.averages || null);
        setGlobalMatchMeans(data.matchAverages || null);
        if (data.matchAverages) {
          const m = data.matchAverages;
          setGlobalAvg({
            count: data.matchCount || 0,
            avgScore: Math.round(m.avgScore || 0),
            avgKills: Math.round(m.avgKills || 0),
            avgDeaths: Math.round(m.avgDeaths || 0),
            avgAssists: Math.round(m.avgAssists || 0),
            avgDamage: Math.round(m.avgDamage || 0),
            avgDamageShare: round1(m.avgDamageShare || 0),
            kda: round1(m.kda || 0),
          });
        }
      })
      .catch((e) => {
        setGlobalAvg(null);
      })
      .finally(() => {
        setLoadingGlobal(false);
        setLoadingRanks(false);
      });

    return () => controller.abort();
  }, [summary]);

  const sparkScore = useMemo(() => {
    if (!globalMeans?.avgScore) return [];
    return normalizeSpark(summary?.sparkScoreRaw, globalMeans.avgScore);
  }, [summary, globalMeans]);
  const sparkKda = useMemo(() => {
    if (!globalMeans?.kda) return [];
    return normalizeSpark(summary?.sparkKdaRaw, globalMeans.kda);
  }, [summary, globalMeans]);
  const sparkWinrate = useMemo(() => {
    if (!globalMeans?.winrate) return [];
    return normalizeSpark(summary?.sparkWinrateRaw, globalMeans.winrate);
  }, [summary, globalMeans]);
  const showRanks =
    !loadingGlobal && !loadingRanks && !!globalAvg && !!globalRanks;

  const activity = useMemo(() => {
    if (!matches.length) return null;

    const getTs = (v) => {
      if (!v) return null;
      if (typeof v === "number") return v;
      if (v instanceof Date) return v.getTime();
      if (typeof v.toMillis === "function") return v.toMillis();
      return null;
    };

    const dayKey = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const byDay = new Map();
    for (const m of matches) {
      const ts = getTs(m.createdAt);
      if (!ts) continue;
      const d = new Date(ts);
      d.setHours(0, 0, 0, 0);
      const key = dayKey(d);
      const prev = byDay.get(key) || { count: 0, wins: 0, losses: 0 };
      prev.count += 1;
      if (m.result === "victory") prev.wins += 1;
      else if (m.result === "defeat") prev.losses += 1;
      byDay.set(key, prev);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - 89);
    const startDow = (start.getDay() + 6) % 7;
    const days = [];
    let maxCount = 0;

    for (let i = 0; i < 90; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = dayKey(d);
      const data = byDay.get(key) || { count: 0, wins: 0, losses: 0 };
      if (data.count > maxCount) maxCount = data.count;
      days.push({
        date: d,
        key,
        ...data,
      });
    }

    const weeks = Math.ceil((90 + startDow) / 7);
    return { days, maxCount: Math.max(1, maxCount), weeks, startDow };
  }, [matches]);

  useEffect(() => {
    const updateLayout = () => {
      if (!activity || !activityGridWrapRef.current) return;
      const containerWidth = activityGridWrapRef.current.clientWidth;
      const maxCell = 18;
      const maxGap = 6;
      const minCell = 10;
      const minGap = 2;
      const desiredWidth =
        activity.weeks * maxCell + Math.max(0, activity.weeks - 1) * maxGap;
      if (desiredWidth <= 0 || containerWidth <= 0) return;
      if (containerWidth >= desiredWidth) {
        setActivityLayout({ cellSize: maxCell, gap: maxGap });
        return;
      }

      const weeks = Math.max(1, activity.weeks);
      const scale = containerWidth / desiredWidth;
      let gap = Math.max(minGap, Math.floor(maxGap * scale));
      let cellSize = Math.floor(
        (containerWidth - Math.max(0, weeks - 1) * gap) / weeks
      );

      if (cellSize < minCell) {
        gap = Math.max(
          minGap,
          Math.floor(
            (containerWidth - weeks * minCell) / Math.max(1, weeks - 1)
          )
        );
        cellSize = Math.floor(
          (containerWidth - Math.max(0, weeks - 1) * gap) / weeks
        );
      }

      cellSize = Math.min(maxCell, Math.max(minCell, cellSize));
      gap = Math.min(maxGap, Math.max(minGap, gap));
      setActivityLayout({ cellSize, gap });
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, [activity]);

  const vsGlobal = useMemo(() => {
    if (!summary || !globalAvg) return null;

    const d = {
      score: summary.avgScore - globalAvg.avgScore,
      kills: summary.avgKills - globalAvg.avgKills,
      deaths: summary.avgDeaths - globalAvg.avgDeaths,
      assists: summary.avgAssists - globalAvg.avgAssists,
      damage: summary.avgDamage - globalAvg.avgDamage,
      damageShare: round1(summary.avgDamageShare - globalAvg.avgDamageShare),
      kda: round1(summary.kda - globalAvg.kda),
    };

    return {
      globalSample: globalAvg.count,
      global: globalAvg,
      delta: d,
    };
  }, [summary, globalAvg]);

  if (!user) {
    return (
      <p className={styles.wrapper}>
        {t.me?.loginRequired || "Login required"}
      </p>
    );
  }

  if (loading) {
    return <p className={styles.wrapper}>{t.me?.loading || "Loading..."}</p>;
  }

  if (!matches.length || !summary) {
    return <p className={styles.wrapper}>{t.me?.empty || "No data yet"}</p>;
  }

  return (
    <div className={styles.wrapper}>
      <h1 className={styles.nickname}>
        {summary.name}{" "}
        <span className={styles.meBadge}>{t.me?.meBadge || "Me"}</span>
      </h1>

      <div className={`${styles.statsSection} ${styles.fadeIn} ${styles.stagger1}`}>
        <div className={styles.statsHeader}>
          <h2 className={styles.statsTitle}>{t.me?.overview || "Overview"}</h2>
          <p className={styles.statsSubtitle}>
            {t.me?.overviewHint || "Match results and consistency"}
          </p>
        </div>
        <div className={styles.statStrip}>
          <div className={styles.stripItem}>
            <span className={styles.stripLabel}>{t.me?.matches || "Matches"}</span>
            <span className={styles.stripValue}>{summary.matchesCount}</span>
            <span className={styles.stripBar}>
              <span
                className={styles.stripFill}
                style={{
                  width: "100%",
                  background: "linear-gradient(90deg, #00f5d4, #a3ff12)",
                }}
              />
            </span>
          </div>
          <div className={styles.stripItem}>
            <span className={styles.stripLabel}>{t.me?.wins || "Wins"}</span>
            <span className={styles.stripValue}>{summary.wins}</span>
            <span className={styles.stripBar}>
              <span
                className={styles.stripFill}
                style={{
                  width: `${Math.min(100, summary.winrate)}%`,
                  background: "linear-gradient(90deg, #00f5d4, #a3ff12)",
                }}
              />
            </span>
          </div>
          <div className={styles.stripItem}>
            <span className={styles.stripLabel}>{t.me?.winrate || "Winrate"}</span>
            <span className={styles.stripValue}>{summary.winrate}%</span>
            <span className={styles.stripBar}>
              <span
                className={styles.stripFill}
                style={{
                  width: `${Math.min(100, summary.winrate)}%`,
                  background: "linear-gradient(90deg, #00f5d4, #a3ff12)",
                }}
              />
            </span>
          </div>
        </div>
        <div className={styles.statsMosaic}>
          {/*
            Top% shows only when global stats are ready.
          */}
          <Stat
            label={t.me?.matches || "Matches"}
            value={summary.matchesCount}
            icon={<IconMatches />}
            variant="hero"
            trend={sparkScore}
            bar={{ value: summary.matchesCount, max: summary.matchesCount || 1 }}
            rank={showRanks ? globalRanks?.matches : null}
            rankLabel={t.me?.topPercent || "Top"}
          />
          <Stat
            label={t.me?.winrate || "Winrate"}
            value={`${summary.winrate}%`}
            icon={<IconRate />}
            accent="rate"
            variant="hero"
            trend={sparkWinrate}
            bar={{ value: summary.winrate, max: 100 }}
            rank={showRanks ? globalRanks?.winrate : null}
            rankLabel={t.me?.topPercent || "Top"}
          />
          <Stat
            label={t.me?.wins || "Wins"}
            value={summary.wins}
            icon={<IconWin />}
            accent="win"
            variant="compact"
            bar={{ value: summary.wins, max: summary.matchesCount || 1 }}
            rank={showRanks ? globalRanks?.wins : null}
            rankLabel={t.me?.topPercent || "Top"}
          />
          <Stat
            label={t.me?.losses || "Losses"}
            value={summary.losses}
            icon={<IconLoss />}
            accent="loss"
            variant="compact"
            bar={{ value: summary.losses, max: summary.matchesCount || 1 }}
            rank={showRanks ? globalRanks?.losses : null}
            rankLabel={t.me?.topPercent || "Top"}
          />
        </div>
      </div>

      <div className={`${styles.statsSection} ${styles.fadeIn} ${styles.stagger2}`}>
        <div className={styles.statsHeader}>
          <h2 className={styles.statsTitle}>{t.me?.averages || "Averages"}</h2>
          <p className={styles.statsSubtitle}>
            {t.me?.averagesHint || "Per-match performance"}
          </p>
        </div>
        <div className={styles.statStrip}>
          <div className={styles.stripItem}>
            <span className={styles.stripLabel}>{t.me?.score || "Score"}</span>
            <span className={styles.stripValue}>{summary.avgScore}</span>
            <span className={styles.stripBar}>
              <span
                className={styles.stripFill}
                style={
                  globalMatchMeans?.avgScore
                    ? {
                        width: perfWidth(
                          summary.avgScoreRaw / globalMatchMeans.avgScore
                        ),
                        background: `linear-gradient(90deg, ${perfColor(
                          summary.avgScoreRaw / globalMatchMeans.avgScore
                        )}, #f5f5f5)`,
                      }
                    : {
                        width: `${Math.min(
                          100,
                          safeDiv(
                            summary.avgScore * 100,
                            summary.bestScore?.score || 1
                          )
                        )}%`,
                      }
                }
              />
            </span>
          </div>
          <div className={styles.stripItem}>
            <span className={styles.stripLabel}>{t.me?.kda || "KDA"}</span>
            <span className={styles.stripValue}>{summary.kda}</span>
            <span className={styles.stripBar}>
              <span
                className={styles.stripFill}
                style={
                  globalMatchMeans?.kda
                    ? {
                        width: perfWidth(summary.kdaRaw / globalMatchMeans.kda),
                        background: `linear-gradient(90deg, ${perfColor(
                          summary.kdaRaw / globalMatchMeans.kda
                        )}, #f5f5f5)`,
                      }
                    : {
                        width: `${Math.min(
                          100,
                          safeDiv(summary.kda * 100, summary.maxKda || 1)
                        )}%`,
                      }
                }
              />
            </span>
          </div>
          <div className={styles.stripItem}>
            <span className={styles.stripLabel}>{t.me?.damage || "Damage"}</span>
            <span className={styles.stripValue}>{summary.avgDamage}</span>
            <span className={styles.stripBar}>
              <span
                className={styles.stripFill}
                style={
                  globalMatchMeans?.avgDamage
                    ? {
                        width: perfWidth(
                          summary.avgDamageRaw / globalMatchMeans.avgDamage
                        ),
                        background: `linear-gradient(90deg, ${perfColor(
                          summary.avgDamageRaw / globalMatchMeans.avgDamage
                        )}, #f5f5f5)`,
                      }
                    : {
                        width: `${Math.min(
                          100,
                          safeDiv(
                            summary.avgDamage * 100,
                            summary.maxDamage?.damage || 1
                          )
                        )}%`,
                      }
                }
              />
            </span>
          </div>
        </div>
        <div className={styles.statsMosaicWide}>
          <Stat
            label={t.me?.score || "Score"}
            value={summary.avgScore}
            icon={<IconScore />}
            variant="hero"
            trend={sparkScore}
            bar={{
              value: summary.avgScore,
              max: summary.bestScore?.score || 1,
            }}
            rank={showRanks ? globalRanks?.avgScore : null}
            rankLabel={t.me?.topPercent || "Top"}
          />
          <Stat
            label={t.me?.kda || "KDA"}
            value={summary.kda}
            icon={<IconKda />}
            variant="hero"
            trend={sparkKda}
            bar={{ value: summary.kda, max: summary.maxKda || 1 }}
            rank={showRanks ? globalRanks?.kda : null}
            rankLabel={t.me?.topPercent || "Top"}
          />
          <Stat
            label={t.me?.kills || "Kills"}
            value={summary.avgKills}
            icon={<IconKills />}
            variant="compact"
            bar={{ value: summary.avgKills, max: summary.maxKills?.kills || 1 }}
            rank={showRanks ? globalRanks?.avgKills : null}
            rankLabel={t.me?.topPercent || "Top"}
          />
          <Stat
            label={t.me?.deaths || "Deaths"}
            value={summary.avgDeaths}
            icon={<IconDeaths />}
            variant="compact"
            bar={{ value: summary.avgDeaths, max: summary.maxDeaths?.deaths || 1 }}
            rank={showRanks ? globalRanks?.avgDeaths : null}
            rankLabel={t.me?.topPercent || "Top"}
          />
          <Stat
            label={t.me?.assists || "Assists"}
            value={summary.avgAssists}
            icon={<IconAssists />}
            variant="compact"
            bar={{
              value: summary.avgAssists,
              max: summary.maxAssists?.assists || 1,
            }}
            rank={showRanks ? globalRanks?.avgAssists : null}
            rankLabel={t.me?.topPercent || "Top"}
          />
          <Stat
            label={t.me?.damage || "Damage"}
            value={summary.avgDamage}
            icon={<IconDamage />}
            variant="compact"
            bar={{ value: summary.avgDamage, max: summary.maxDamage?.damage || 1 }}
            rank={showRanks ? globalRanks?.avgDamage : null}
            rankLabel={t.me?.topPercent || "Top"}
          />
          <Stat
            label={t.me?.damageShare || "Dmg share"}
            value={`${summary.avgDamageShare}%`}
            icon={<IconDamageShare />}
            variant="compact"
            bar={{ value: summary.avgDamageShare, max: 100 }}
            rank={
              showRanks ? globalRanks?.avgDamageShare : null
            }
            rankLabel={t.me?.topPercent || "Top"}
          />
        </div>
      </div>

      <div className={`${styles.card} ${styles.fadeIn} ${styles.stagger3}`}>
        <h2 className={styles.cardTitle}>
          {t.me?.vsGlobal || "vs Global average"}
          {!loadingGlobal && vsGlobal?.globalSample ? (
            <span className={styles.smallNote}>
              {" "}
              ({t.me?.globalSample || "sample"}: {vsGlobal.globalSample})
            </span>
          ) : null}
        </h2>

        {loadingGlobal && (
          <p className={styles.hint}>
            {t.me?.globalLoading || "Loading global averages..."}
          </p>
        )}

        {!loadingGlobal && !vsGlobal && (
          <p className={styles.hint}>
            {t.me?.globalUnavailable || "Global averages unavailable yet."}
          </p>
        )}

        {!loadingGlobal && vsGlobal && (
          <div className={styles.compareGrid}>
            <CompareRow
              label={t.me?.score || "Score"}
              you={summary.avgScore}
              global={vsGlobal.global.avgScore}
              delta={vsGlobal.delta.score}
              accent={diffAccent(vsGlobal.delta.score, true)}
              compareSep={t.me?.compareSep || "vs"}
            />
            <CompareRow
              label={t.me?.kills || "Kills"}
              you={summary.avgKills}
              global={vsGlobal.global.avgKills}
              delta={vsGlobal.delta.kills}
              accent={diffAccent(vsGlobal.delta.kills, true)}
              compareSep={t.me?.compareSep || "vs"}
            />
            <CompareRow
              label={t.me?.deaths || "Deaths"}
              you={summary.avgDeaths}
              global={vsGlobal.global.avgDeaths}
              delta={vsGlobal.delta.deaths}
              accent={diffAccent(vsGlobal.delta.deaths, false)}
              compareSep={t.me?.compareSep || "vs"}
            />
            <CompareRow
              label={t.me?.assists || "Assists"}
              you={summary.avgAssists}
              global={vsGlobal.global.avgAssists}
              delta={vsGlobal.delta.assists}
              accent={diffAccent(vsGlobal.delta.assists, true)}
              compareSep={t.me?.compareSep || "vs"}
            />
            <CompareRow
              label={t.me?.damage || "Damage"}
              you={summary.avgDamage}
              global={vsGlobal.global.avgDamage}
              delta={vsGlobal.delta.damage}
              accent={diffAccent(vsGlobal.delta.damage, true)}
              compareSep={t.me?.compareSep || "vs"}
            />
            <CompareRow
              label={t.me?.damageShare || "Dmg share"}
              you={`${summary.avgDamageShare}%`}
              global={`${vsGlobal.global.avgDamageShare}%`}
              delta={`${sign(vsGlobal.delta.damageShare)}${vsGlobal.delta.damageShare}%`}
              accent={diffAccent(vsGlobal.delta.damageShare, true)}
              compareSep={t.me?.compareSep || "vs"}
            />
            <CompareRow
              label={t.me?.kda || "KDA"}
              you={summary.kda}
              global={vsGlobal.global.kda}
              delta={`${sign(vsGlobal.delta.kda)}${vsGlobal.delta.kda}`}
              accent={diffAccent(vsGlobal.delta.kda, true)}
              compareSep={t.me?.compareSep || "vs"}
            />
          </div>
        )}
      </div>

      <div className={`${styles.sectionGrid} ${styles.fadeIn} ${styles.stagger4}`}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t.me?.totals || "Totals"}</h2>
          <div className={styles.twoCol}>
            <Mini label={t.me?.score || "Score"} value={summary.totalScore} />
            <Mini label={t.me?.kills || "Kills"} value={summary.totalKills} />
            <Mini label={t.me?.deaths || "Deaths"} value={summary.totalDeaths} />
            <Mini label={t.me?.assists || "Assists"} value={summary.totalAssists} />
            <Mini label={t.me?.damage || "Damage"} value={summary.totalDamage} />
          </div>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t.me?.activity || "Activity"}</h2>
          <p className={styles.hint}>
            {t.me?.activityHint || "Last 90 days"}
          </p>
          {activity && (
            <div
              className={styles.activityWrap}
              style={{
                "--activity-cell": `${activityLayout.cellSize}px`,
                "--activity-gap": `${activityLayout.gap}px`,
              }}
            >
              <div className={styles.activityWeekdays}>
                {(t.me?.weekdaysShort || [
                  "Mon",
                  "Tue",
                  "Wed",
                  "Thu",
                  "Fri",
                  "Sat",
                  "Sun",
                ]).map((label, i) => (
                  <div
                    className={styles.activityWeekday}
                    key={label}
                    style={{ gridRow: i + 1 }}
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div className={styles.activityGridWrap} ref={activityGridWrapRef}>
                <div
                  className={styles.activityGrid}
                  style={{
                    gridTemplateColumns: `repeat(${activity.weeks}, var(--activity-cell))`,
                  }}
                >
                  {activity.days.map((d, i) => {
                    const week = Math.floor((i + activity.startDow) / 7) + 1;
                    const row = ((d.date.getDay() + 6) % 7) + 1;
                    const winrate =
                      d.wins + d.losses > 0 ? d.wins / (d.wins + d.losses) : 0;
                    const baseDot = Math.max(
                      4,
                      Math.floor(activityLayout.cellSize * 0.35)
                    );
                    const maxDot = Math.max(baseDot, activityLayout.cellSize - 4);
                    const size =
                      d.count === 0
                        ? baseDot
                        : Math.min(
                            maxDot,
                            baseDot +
                              Math.round(
                                (d.count / activity.maxCount) * (maxDot - baseDot)
                              )
                          );
                    const red = Math.round(255 - winrate * 180);
                    const green = Math.round(80 + winrate * 175);
                    const color =
                      d.count === 0
                        ? "rgba(255,255,255,0.08)"
                        : `rgb(${red}, ${green}, 90)`;
                    return (
                      <div
                        key={d.key}
                        className={styles.activityCell}
                        style={{ gridColumn: week, gridRow: row }}
                        aria-label={`${d.key} ${t.me?.wins || "Wins"} ${
                          d.wins
                        } ${t.me?.losses || "Losses"} ${d.losses}`}
                      >
                        <span
                          className={styles.activityDot}
                          style={{
                            width: size,
                            height: size,
                            background: color,
                          }}
                        />
                        <div className={styles.activityTooltip}>
                          <div className={styles.activityTooltipDate}>{d.key}</div>
                          <div className={styles.activityTooltipRow}>
                            {t.me?.wins || "Wins"}: {d.wins}
                          </div>
                          <div className={styles.activityTooltipRow}>
                            {t.me?.losses || "Losses"}: {d.losses}
                          </div>
                          <div className={styles.activityTooltipRow}>
                            {t.me?.matches || "Matches"}: {d.count}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            {t.me?.trends || "Trends (last 5 vs prev 5)"}
          </h2>
          <div className={styles.twoCol}>
            <Mini
              label={t.me?.score || "Score"}
              value={`${summary.trendScore >= 0 ? "+" : ""}${summary.trendScore}`}
              accent={summary.trendScore >= 0 ? "good" : "bad"}
            />
            <Mini
              label={t.me?.kills || "Kills"}
              value={`${summary.trendKills >= 0 ? "+" : ""}${summary.trendKills}`}
              accent={summary.trendKills >= 0 ? "good" : "bad"}
            />
          </div>
          <p className={styles.hint}>
            {t.me?.trendsHint ||
              "Difference between average of last 5 matches and previous 5."}
          </p>
        </div>
      </div>

      <div className={`${styles.card} ${styles.fadeIn} ${styles.stagger5}`}>
        <h2 className={styles.cardTitle}>{t.me?.records || "Records"}</h2>
        <div className={styles.recordsGrid}>
          <Record
            label={t.me?.bestScore || "Best score"}
            value={summary.bestScore.score}
            sub={formatDate(summary.bestScore.createdAt, t.me?.unknown || "-")}
          />
          <Record
            label={t.me?.worstScore || "Worst score"}
            value={summary.worstScore.score}
            sub={formatDate(summary.worstScore.createdAt, t.me?.unknown || "-")}
          />
          <Record
            label={t.me?.maxKills || "Max kills"}
            value={summary.maxKills.kills}
            sub={formatDate(summary.maxKills.createdAt, t.me?.unknown || "-")}
          />
          <Record
            label={t.me?.maxDamage || "Max damage"}
            value={summary.maxDamage.damage}
            sub={formatDate(summary.maxDamage.createdAt, t.me?.unknown || "-")}
          />
        </div>
      </div>
      <Suspense
        fallback={
          <div className={styles.skeletonCard}>
            <div className={`${styles.skeletonRow} ${styles.skeletonRowWide}`} />
            <div className={`${styles.skeletonRow} ${styles.skeletonRowMedium}`} />
            <div className={styles.skeletonPills}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div className={styles.skeletonPill} key={i} />
              ))}
            </div>
            <div className={styles.skeletonChart} />
          </div>
        }
      >
        <ChartSection
          matches={matches}
          t={t}
          chartMetric={chartMetric}
          setChartMetric={setChartMetric}
          chartToggleRef={chartToggleRef}
          chartPillRefs={chartPillRefs}
          pillStyle={pillStyle}
        />
      </Suspense>
      <Suspense
        fallback={
          <div className={styles.skeletonCard}>
            <div className={`${styles.skeletonRow} ${styles.skeletonRowWide}`} />
            <div className={`${styles.skeletonRow} ${styles.skeletonRowMedium}`} />
            <div className={styles.skeletonTable} />
          </div>
        }
      >
        <LastMatchesTable
          last10={summary.last10}
          t={t}
          round1={round1}
          formatDate={formatDate}
        />
      </Suspense>
      {hasMore && (
        <div className={styles.loadMoreWrap}>
          <button
            className={styles.loadMoreBtn}
            onClick={() => fetchHistory(false)}
            disabled={loadingMore}
          >
            {loadingMore
              ? t.me?.loadingMore || "Loading..."
              : t.me?.loadMore || "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

function formatDate(ts, fallback = "-") {
  if (!ts) return fallback;
  const d = new Date(ts);
  return d.toLocaleString();
}

function Stat({ label, value, icon, accent, variant, trend, bar, rank, rankLabel }) {
  const variantClass =
    variant === "hero"
      ? styles.statHero
      : variant === "compact"
      ? styles.statCompact
      : "";
  const rankScore =
    typeof rank === "number" ? Math.max(1, 100 - Math.min(100, rank) + 1) : null;
  const barWidth = bar
    ? `${Math.min(
        100,
        rankScore ?? safeDiv(bar.value * 100, bar.max || 1)
      )}%`
    : null;
  return (
    <div
      className={`${styles.statCard} ${variantClass} ${
        accent === "win"
          ? styles.statWin
          : accent === "loss"
          ? styles.statLoss
          : accent === "rate"
          ? styles.statRate
          : ""
      }`}
    >
      {icon ? <div className={styles.statIcon}>{icon}</div> : null}
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      {rank ? (
        <div className={styles.statMeta}>
          {rankLabel || "Top"} {rank}%
        </div>
      ) : null}
      {bar ? (
        <div className={styles.statBar}>
          <span className={styles.statBarFill} style={{ width: barWidth }} />
        </div>
      ) : null}
      {variant === "hero" && Array.isArray(trend) && trend.length ? (
        <div className={styles.statSpark}>
          <Sparkline data={trend} />
        </div>
      ) : null}
    </div>
  );
}

function Sparkline({ data }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(1, max - min);
  const step = data.length > 1 ? 100 / (data.length - 1) : 0;
  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = 24 - Math.round(((v - min) / range) * 20);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} />
    </svg>
  );
}


function IconMatches() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M7 20h10" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

function IconWin() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  );
}

function IconLoss() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  );
}

function IconRate() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 18V6" />
      <path d="M6 18h12" />
      <path d="M9 15l3-3 3 2 3-4" />
    </svg>
  );
}

function IconScore() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17l-5.6 3.2 1.1-6.2L3 9.6l6.2-.9z" />
    </svg>
  );
}

function IconKills() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12h16" />
      <path d="M12 4v16" />
      <circle cx="12" cy="12" r="6" />
    </svg>
  );
}

function IconDeaths() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3c-4.4 0-8 3-8 7 0 2.8 1.5 5.2 3.8 6.3V19a2 2 0 0 0 2 2h4.4a2 2 0 0 0 2-2v-2.7C18.5 15.2 20 12.8 20 10c0-4-3.6-7-8-7z" />
      <circle cx="9" cy="11" r="1.4" />
      <circle cx="15" cy="11" r="1.4" />
      <path d="M10 15h4" />
      <path d="M11 17h2" />
    </svg>
  );
}

function IconAssists() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12l4-3 4 4 4-3 4 2" />
      <path d="M8 9l2-2 4 4" />
      <path d="M4 12v3h4l3-2" />
      <path d="M20 11v3h-4l-3-2" />
    </svg>
  );
}

function IconKda() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 18V6" />
      <path d="M10 18V9" />
      <path d="M16 18V4" />
      <path d="M20 18H2" />
    </svg>
  );
}

function IconDamage() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2c2.2 2.7 4.8 5.8 4.8 9.2 0 2.7-2.1 4.8-4.8 4.8s-4.8-2.1-4.8-4.8C7.2 7.8 9.8 4.7 12 2z" />
      <path d="M12 8c.9 1.2 1.8 2.3 1.8 3.8 0 1.3-1 2.2-2.2 2.2S9.4 13 9.4 11.8c0-1.5.9-2.6 2.6-3.8z" />
    </svg>
  );
}

function IconDamageShare() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9l7 7" />
    </svg>
  );
}

function Mini({ label, value, accent }) {
  return (
    <div
      className={`${styles.mini} ${
        accent === "good" ? styles.good : accent === "bad" ? styles.bad : ""
      }`}
    >
      <div className={styles.miniLabel}>{label}</div>
      <div className={styles.miniValue}>{value}</div>
    </div>
  );
}

function Record({ label, value, sub }) {
  return (
    <div className={styles.record}>
      <div className={styles.recordLabel}>{label}</div>
      <div className={styles.recordValue}>{value}</div>
      <div className={styles.recordSub}>{sub}</div>
    </div>
  );
}

function CompareRow({ label, you, global, delta, accent, compareSep }) {
  return (
    <div className={styles.compareRow}>
      <div className={styles.compareLabel}>{label}</div>

      <div className={styles.compareVals}>
        <span className={styles.compareYou}>{you}</span>
        <span className={styles.compareSep}>{compareSep || "vs"}</span>
        <span className={styles.compareGlobal}>{global}</span>
      </div>

      <div
        className={`${styles.compareDelta} ${
          accent === "good" ? styles.good : accent === "bad" ? styles.bad : ""
        }`}
      >
        {typeof delta === "number" ? `${sign(delta)}${delta}` : delta}
      </div>
    </div>
  );
}
