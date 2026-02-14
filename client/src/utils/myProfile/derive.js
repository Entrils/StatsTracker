import { round1, safeDiv } from "@/utils/myProfile/math";

export function normalizeSpark(data, base) {
  if (!Array.isArray(data)) return [];
  if (!base) return data;
  return data.map((v) => safeDiv(v, base));
}

export function buildSummary(matches, claims, user, uid) {
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

  const kdaRaw = safeDiv(total.kills + total.assists, Math.max(1, total.deaths));
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
  const trendDeaths = round1(avg(last5, "deaths") - avg(prev5, "deaths"));
  const trendAssists = round1(avg(last5, "assists") - avg(prev5, "assists"));
  const trendDamage = round1(avg(last5, "damage") - avg(prev5, "damage"));

  return {
    name: matches[0]?.name || claims?.username || user?.displayName || user?.email || uid,
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
    trendDeaths,
    trendAssists,
    trendDamage,
    last10,
    sparkScoreRaw: last10Chrono.map((m) => m.score || 0),
    sparkKdaRaw: last10Chrono.map((m) =>
      round1(safeDiv((m.kills || 0) + (m.assists || 0), Math.max(1, m.deaths || 0)))
    ),
    sparkWinrateRaw: last10Chrono.map((_, i) => {
      const slice = last10Chrono.slice(0, i + 1);
      const w = slice.filter((m) => m.result === "victory").length;
      const l = slice.filter((m) => m.result === "defeat").length;
      return round1(safeDiv(w * 100, w + l));
    }),
    maxKda,
  };
}

export function buildActivity(matches) {
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
    days.push({ date: d, key, ...data });
  }

  const weeks = Math.ceil((90 + startDow) / 7);
  return { days, maxCount: Math.max(1, maxCount), weeks, startDow };
}

export function buildVsGlobal(summary, globalAvg) {
  if (!summary || !globalAvg) return null;
  const delta = {
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
    delta,
  };
}
