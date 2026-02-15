const RANK_VALUE = {
  unranked: 0,
  bronze: 0.12,
  silver: 0.24,
  gold: 0.38,
  platinum: 0.5,
  diamond: 0.62,
  master: 0.74,
  ace: 0.86,
  punkmaster: 1,
};

const SEASON_WEIGHTS = {
  s1: 0.05,
  s2: 0.1,
  s3: 0.25,
  s4: 0.55,
};

const STAT_RANGES = {
  avgKda: [1.5, 3.2],
  avgKills: [4, 12],
  avgDamage: [800, 2000],
  avgDamageShare: [10, 35],
  avgScore: [2000, 8000],
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalize(value, min, max) {
  if (!Number.isFinite(value) || max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

function calcRankScore(ranks = {}) {
  const seasons = ["s1", "s2", "s3", "s4"];
  let weighted = 0;
  let weightSum = 0;

  for (const season of seasons) {
    const entry = ranks?.[season];
    if (!entry) continue;
    const rankKey = String(entry?.rank || entry || "unranked").toLowerCase();
    const rankValue = RANK_VALUE[rankKey] ?? 0;
    const weight = SEASON_WEIGHTS[season] ?? 0;
    weighted += rankValue * weight;
    weightSum += weight;
  }

  if (!weightSum) return 0;
  return weighted / weightSum;
}

export function computeHiddenElo({
  matches = 0,
  score = 0,
  kills = 0,
  deaths = 0,
  assists = 0,
  damage = 0,
  damageShare = 0,
  ranks = null,
} = {}) {
  const totalMatches = Math.max(0, Math.floor(toNumber(matches, 0)));
  const avgScore = totalMatches ? toNumber(score) / totalMatches : 0;
  const avgKills = totalMatches ? toNumber(kills) / totalMatches : 0;
  const avgDamage = totalMatches ? toNumber(damage) / totalMatches : 0;
  const avgDamageShare = totalMatches ? toNumber(damageShare) / totalMatches : 0;
  const avgKda = (toNumber(kills) + toNumber(assists)) / Math.max(1, toNumber(deaths));

  const statsScore =
    normalize(avgKda, ...STAT_RANGES.avgKda) * 0.3 +
    normalize(avgKills, ...STAT_RANGES.avgKills) * 0.2 +
    normalize(avgDamage, ...STAT_RANGES.avgDamage) * 0.2 +
    normalize(avgDamageShare, ...STAT_RANGES.avgDamageShare) * 0.12 +
    normalize(avgScore, ...STAT_RANGES.avgScore) * 0.18;

  const rankScore = calcRankScore(ranks || {});
  const skillScore = rankScore * 0.72 + statsScore * 0.28;
  const skillCore = skillScore * 2400;

  const progressTo20 = clamp(totalMatches / 20, 0, 1);
  let elo;

  if (totalMatches <= 20) {
    const onboardingBase = 500 + progressTo20 * 500;
    const pre20SkillFactor = 0.25 + progressTo20 * 0.45;
    elo = onboardingBase + skillCore * pre20SkillFactor;
  } else {
    const experienceMultiplier = 1 + Math.min(0.35, Math.log1p(totalMatches - 20) / 6);
    elo = 1000 + skillCore * experienceMultiplier;
  }

  return Math.round(clamp(elo, 400, 4200));
}
