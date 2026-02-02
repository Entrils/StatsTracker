import { useEffect, useMemo, useState } from "react";
import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  orderBy,
  query,
  where,
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
import styles from "./MyProfile.module.css";
import { useLang } from "../../i18n/LanguageContext";
import { useAuth } from "../../auth/AuthContext";

const GLOBAL_SAMPLE = 800; // последних матчей брать для глобального авг

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

export default function MyProfile() {
  const { t } = useLang();
  const { user, claims } = useAuth();

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const [globalAvg, setGlobalAvg] = useState(null);
  const [loadingGlobal, setLoadingGlobal] = useState(true);

  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return;

    const fetchHistory = async () => {
      setLoading(true);

      const q = query(
        collection(db, "users", uid, "matches"),
        orderBy("createdAt", "asc")
      );

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

      setMatches(data);
      setLoading(false);
    };

    fetchHistory();
  }, [uid]);

  useEffect(() => {
    if (!user) return;

    const fetchGlobal = async () => {
      setLoadingGlobal(true);

      try {
        const q = query(
          collectionGroup(db, "players"),
          orderBy("createdAt", "desc"),
          limit(GLOBAL_SAMPLE)
        );

        const snapshot = await getDocs(q);

        const rows = snapshot.docs.map((d) => d.data());

        if (!rows.length) {
          setGlobalAvg(null);
          setLoadingGlobal(false);
          return;
        }

        const total = rows.reduce(
          (acc, m) => {
            acc.count += 1;
            acc.score += m.score || 0;
            acc.kills += m.kills || 0;
            acc.deaths += m.deaths || 0;
            acc.assists += m.assists || 0;
            acc.damage += m.damage || 0;
            acc.damageShare += m.damageShare || 0;
            return acc;
          },
          {
            count: 0,
            score: 0,
            kills: 0,
            deaths: 0,
            assists: 0,
            damage: 0,
            damageShare: 0,
          }
        );

        const avgScore = Math.round(total.score / total.count);
        const avgKills = Math.round(total.kills / total.count);
        const avgDeaths = Math.round(total.deaths / total.count);
        const avgAssists = Math.round(total.assists / total.count);
        const avgDamage = Math.round(total.damage / total.count);
        const avgDamageShare = round1(total.damageShare / total.count);

        const kda = round1(
          safeDiv(total.kills + total.assists, Math.max(1, total.deaths))
        );

        setGlobalAvg({
          count: total.count,
          avgScore,
          avgKills,
          avgDeaths,
          avgAssists,
          avgDamage,
          avgDamageShare,
          kda,
        });
      } catch (e) {
        console.error("GLOBAL AVG FETCH FAILED:", e);
        setGlobalAvg(null);
      } finally {
        setLoadingGlobal(false);
      }
    };

    fetchGlobal();
  }, [user]);

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

    const avgScore = Math.round(total.score / matches.length);
    const avgKills = Math.round(total.kills / matches.length);
    const avgDeaths = Math.round(total.deaths / matches.length);
    const avgAssists = Math.round(total.assists / matches.length);
    const avgDamage = Math.round(total.damage / matches.length);
    const avgDamageShare = round1(total.damageShare / matches.length);

    const kda = round1(
      safeDiv(total.kills + total.assists, Math.max(1, total.deaths))
    );

    const winrate = round1(safeDiv(wins * 100, wins + losses));

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

    const last10 = [...matches].slice(-10).reverse();

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

      bestScore,
      worstScore,
      maxKills,
      maxDamage,

      trendScore,
      trendKills,

      last10,
    };
  }, [matches, claims, user, uid]);

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
        {summary.name} <span className={styles.meBadge}>ME</span>
      </h1>

      <div className={styles.statsGrid}>
        <Stat label={t.me?.matches || "Matches"} value={summary.matchesCount} />
        <Stat label="Wins" value={summary.wins} />
        <Stat label="Losses" value={summary.losses} />
        <Stat label="Winrate" value={`${summary.winrate}%`} />
        <Stat label={t.me?.score || "Score"} value={summary.avgScore} />
        <Stat label={t.me?.kills || "Kills"} value={summary.avgKills} />
        <Stat label={t.me?.deaths || "Deaths"} value={summary.avgDeaths} />
        <Stat label={t.me?.assists || "Assists"} value={summary.avgAssists} />
        <Stat label="KDA" value={summary.kda} />
        <Stat label={t.me?.damage || "Damage"} value={summary.avgDamage} />
        <Stat
          label={t.me?.damageShare || "Dmg share"}
          value={`${summary.avgDamageShare}%`}
        />
      </div>

      <div className={styles.card}>
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
            />
            <CompareRow
              label={t.me?.kills || "Kills"}
              you={summary.avgKills}
              global={vsGlobal.global.avgKills}
              delta={vsGlobal.delta.kills}
              accent={diffAccent(vsGlobal.delta.kills, true)}
            />
            <CompareRow
              label={t.me?.deaths || "Deaths"}
              you={summary.avgDeaths}
              global={vsGlobal.global.avgDeaths}
              delta={vsGlobal.delta.deaths}
              accent={diffAccent(vsGlobal.delta.deaths, false)}
            />
            <CompareRow
              label={t.me?.assists || "Assists"}
              you={summary.avgAssists}
              global={vsGlobal.global.avgAssists}
              delta={vsGlobal.delta.assists}
              accent={diffAccent(vsGlobal.delta.assists, true)}
            />
            <CompareRow
              label={t.me?.damage || "Damage"}
              you={summary.avgDamage}
              global={vsGlobal.global.avgDamage}
              delta={vsGlobal.delta.damage}
              accent={diffAccent(vsGlobal.delta.damage, true)}
            />
            <CompareRow
              label={t.me?.damageShare || "Dmg share"}
              you={`${summary.avgDamageShare}%`}
              global={`${vsGlobal.global.avgDamageShare}%`}
              delta={`${sign(vsGlobal.delta.damageShare)}${vsGlobal.delta.damageShare}%`}
              accent={diffAccent(vsGlobal.delta.damageShare, true)}
            />
            <CompareRow
              label="KDA"
              you={summary.kda}
              global={vsGlobal.global.kda}
              delta={`${sign(vsGlobal.delta.kda)}${vsGlobal.delta.kda}`}
              accent={diffAccent(vsGlobal.delta.kda, true)}
            />
          </div>
        )}
      </div>

      <div className={styles.sectionGrid}>
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

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>{t.me?.records || "Records"}</h2>
        <div className={styles.recordsGrid}>
          <Record
            label={t.me?.bestScore || "Best score"}
            value={summary.bestScore.score}
            sub={formatDate(summary.bestScore.createdAt)}
          />
          <Record
            label={t.me?.worstScore || "Worst score"}
            value={summary.worstScore.score}
            sub={formatDate(summary.worstScore.createdAt)}
          />
          <Record
            label={t.me?.maxKills || "Max kills"}
            value={summary.maxKills.kills}
            sub={formatDate(summary.maxKills.createdAt)}
          />
          <Record
            label={t.me?.maxDamage || "Max damage"}
            value={summary.maxDamage.damage}
            sub={formatDate(summary.maxDamage.createdAt)}
          />
        </div>
      </div>

      <div className={styles.chartCard}>
        <h2 className={styles.chartTitle}>📈 {t.me?.progress || "Progress"}</h2>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={matches}>
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="score"
              stroke="#00f5d4"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="kills"
              stroke="#a3ff12"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="damage"
              stroke="#ff2d95"
              strokeWidth={2}
              dot={false}
            />

            <CartesianGrid stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
            <XAxis dataKey="index" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" domain={[0, 1]} ticks={[0, 1]} />
            <Tooltip />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>
          {t.me?.lastMatches || "Last 10 matches"}
        </h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Result</th>
                <th>{t.me?.score || "Score"}</th>
                <th>{t.me?.kills || "Kills"}</th>
                <th>{t.me?.deaths || "Deaths"}</th>
                <th>{t.me?.assists || "Assists"}</th>
                <th>{t.me?.damage || "Damage"}</th>
                <th>{t.me?.damageShare || "Dmg%"}</th>
                <th>{t.me?.date || "Date"}</th>
              </tr>
            </thead>
            <tbody>
              {summary.last10.map((m) => (
                <tr key={`${m.ownerUid}-${m.createdAt}-${m.index}`}>
                  <td>{m.index}</td>

                  <td
                    className={
                      m.result === "victory"
                        ? styles.good
                        : m.result === "defeat"
                        ? styles.bad
                        : ""
                    }
                  >
                    {m.result === "victory"
                      ? "WIN"
                      : m.result === "defeat"
                      ? "LOSS"
                      : "-"}
                  </td>

                  <td>{m.score}</td>
                  <td>{m.kills}</td>
                  <td>{m.deaths}</td>
                  <td>{m.assists}</td>
                  <td>{m.damage}</td>
                  <td>{round1(m.damageShare)}%</td>
                  <td>{formatDate(m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function formatDate(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleString();
}

function Stat({ label, value }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
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

function CompareRow({ label, you, global, delta, accent }) {
  return (
    <div className={styles.compareRow}>
      <div className={styles.compareLabel}>{label}</div>

      <div className={styles.compareVals}>
        <span className={styles.compareYou}>{you}</span>
        <span className={styles.compareSep}>vs</span>
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
