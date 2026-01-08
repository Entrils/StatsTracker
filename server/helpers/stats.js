export function createStatsHelpers({
  admin,
  db,
  logger,
  CACHE_COLLECTION,
  GLOBAL_CACHE_TTL_MS,
}) {
  let globalCache = {
    updatedAt: 0,
    distributions: null,
    countPlayers: 0,
  };

  async function readCacheDoc(id, ttlMs) {
    try {
      const snap = await db.collection(CACHE_COLLECTION).doc(id).get();
      if (!snap.exists) return null;
      const data = snap.data() || {};
      if (!data.updatedAt || Date.now() - data.updatedAt > ttlMs) return null;
      return data;
    } catch {
      return null;
    }
  }

  async function writeCacheDoc(id, payload) {
    try {
      const size = Buffer.byteLength(JSON.stringify(payload), "utf8");
      if (size > 900000) {
        logger.warn(`CACHE SKIP ${id}: payload too large (${size} bytes)`);
        return;
      }
      await db.collection(CACHE_COLLECTION).doc(id).set(payload);
    } catch (err) {
      logger.warn(`CACHE WRITE FAILED ${id}:`, err?.message || err);
    }
  }

  function percentileRank(sorted, value) {
    if (!sorted?.length || typeof value !== "number" || Number.isNaN(value)) {
      return null;
    }
    let lo = 0;
    let hi = sorted.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (sorted[mid] <= value) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (idx < 0) return 1;
    return Math.round(((idx + 1) / sorted.length) * 100);
  }

  function topPercent(sorted, value, preferHigher = true) {
    const pct = percentileRank(sorted, value);
    if (!pct) return null;
    return preferHigher ? Math.max(1, 100 - pct + 1) : Math.max(1, pct);
  }

  async function buildDistributions() {
    const players = new Map();
    const matchTotals = {
      count: 0,
      wins: 0,
      losses: 0,
      score: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      damage: 0,
      damageShare: 0,
    };
    let lastDoc = null;
    const baseQuery = db
      .collection("leaderboard_users")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(1000);

    while (true) {
      const query = lastDoc ? baseQuery.startAfter(lastDoc) : baseQuery;
      const snap = await query.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        const m = doc.data() || {};
        const owner = doc.id;
        const matches = Number(m.matches || 0);
        if (!owner || !matches) continue;

        matchTotals.count += matches;
        matchTotals.score += m.score || 0;
        matchTotals.kills += m.kills || 0;
        matchTotals.deaths += m.deaths || 0;
        matchTotals.assists += m.assists || 0;
        matchTotals.damage += m.damage || 0;
        matchTotals.damageShare += m.damageShare || 0;
        matchTotals.wins += m.wins || 0;
        matchTotals.losses += m.losses || 0;

        players.set(owner, {
          count: matches,
          wins: m.wins || 0,
          losses: m.losses || 0,
          score: m.score || 0,
          kills: m.kills || 0,
          deaths: m.deaths || 0,
          assists: m.assists || 0,
          damage: m.damage || 0,
          damageShare: m.damageShare || 0,
        });
      }

      lastDoc = snap.docs[snap.docs.length - 1];
    }

    const dist = {
      matches: [],
      wins: [],
      losses: [],
      avgScore: [],
      avgKills: [],
      avgDeaths: [],
      avgAssists: [],
      avgDamage: [],
      avgDamageShare: [],
      kda: [],
      winrate: [],
    };
    const sums = {
      matches: 0,
      wins: 0,
      losses: 0,
      avgScore: 0,
      avgKills: 0,
      avgDeaths: 0,
      avgAssists: 0,
      avgDamage: 0,
      avgDamageShare: 0,
      kda: 0,
      winrate: 0,
    };

    for (const p of players.values()) {
      if (!p.count) continue;
      const avgScore = p.score / p.count;
      const avgKills = p.kills / p.count;
      const avgDeaths = p.deaths / p.count;
      const avgAssists = p.assists / p.count;
      const avgDamage = p.damage / p.count;
      const avgDamageShare = p.damageShare / p.count;
      const kda = (p.kills + p.assists) / Math.max(1, p.deaths);
      const winrate = ((p.wins / Math.max(1, p.wins + p.losses)) * 100) || 0;

      dist.matches.push(p.count);
      dist.wins.push(p.wins);
      dist.losses.push(p.losses);
      dist.avgScore.push(avgScore);
      dist.avgKills.push(avgKills);
      dist.avgDeaths.push(avgDeaths);
      dist.avgAssists.push(avgAssists);
      dist.avgDamage.push(avgDamage);
      dist.avgDamageShare.push(avgDamageShare);
      dist.kda.push(kda);
      dist.winrate.push(winrate);

      sums.matches += p.count;
      sums.wins += p.wins;
      sums.losses += p.losses;
      sums.avgScore += avgScore;
      sums.avgKills += avgKills;
      sums.avgDeaths += avgDeaths;
      sums.avgAssists += avgAssists;
      sums.avgDamage += avgDamage;
      sums.avgDamageShare += avgDamageShare;
      sums.kda += kda;
      sums.winrate += winrate;
    }

    for (const key of Object.keys(dist)) {
      dist[key] = dist[key].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    }

    const countPlayers = dist.avgScore.length;
    const averages = {};
    if (countPlayers) {
      for (const key of Object.keys(sums)) {
        averages[key] = sums[key] / countPlayers;
      }
    }

    const matchAverages = matchTotals.count
      ? {
          avgScore: matchTotals.score / matchTotals.count,
          avgKills: matchTotals.kills / matchTotals.count,
          avgDeaths: matchTotals.deaths / matchTotals.count,
          avgAssists: matchTotals.assists / matchTotals.count,
          avgDamage: matchTotals.damage / matchTotals.count,
          avgDamageShare: matchTotals.damageShare / matchTotals.count,
          kda:
            (matchTotals.kills + matchTotals.assists) /
            Math.max(1, matchTotals.deaths),
          winrate:
            (matchTotals.wins /
              Math.max(1, matchTotals.wins + matchTotals.losses)) *
              100 || 0,
        }
      : null;

    return { dist, countPlayers, averages, matchAverages, matchCount: matchTotals.count };
  }

  async function getDistributions(forceRefresh = false) {
    const now = Date.now();
    if (
      !forceRefresh &&
      globalCache.distributions &&
      now - globalCache.updatedAt < GLOBAL_CACHE_TTL_MS
    ) {
      return globalCache;
    }

    if (!forceRefresh) {
      const cached = await readCacheDoc("global", GLOBAL_CACHE_TTL_MS);
      if (cached?.distributions) {
        globalCache = cached;
        return cached;
      }
    }

    const { dist, countPlayers, averages, matchAverages, matchCount } =
      await buildDistributions();
    globalCache = {
      updatedAt: now,
      distributions: dist,
      countPlayers,
      averages,
      matchAverages,
      matchCount,
    };
    await writeCacheDoc("global", globalCache);
    return globalCache;
  }

  async function getLeaderboardPage(limit, offset) {
    const baseQuery = db
      .collection("leaderboard_users")
      .orderBy("matches", "desc");
    const pageQuery = baseQuery.offset(offset).limit(limit);
    const snap = await pageQuery.get();
    const rows = snap.docs.map((doc) => {
      const p = doc.data() || {};
      const matches = Number(p.matches || 0);
      const avgScore = matches ? (p.score || 0) / matches : 0;
      const avgKills = matches ? (p.kills || 0) / matches : 0;
      const avgDeaths = matches ? (p.deaths || 0) / matches : 0;
      const avgAssists = matches ? (p.assists || 0) / matches : 0;
      const kda = (p.kills + p.assists) / Math.max(1, p.deaths || 0);
      const winrate = (p.wins / Math.max(1, matches)) * 100 || 0;
      return {
        uid: doc.id,
        name: p.name || "Unknown",
        settings: p.settings || p.socials || null,
        score: p.score || 0,
        kills: p.kills || 0,
        deaths: p.deaths || 0,
        assists: p.assists || 0,
        damage: p.damage || 0,
        damageShare: p.damageShare || 0,
        wins: p.wins || 0,
        losses: p.losses || 0,
        matches,
        avgScore,
        avgKills,
        avgDeaths,
        avgAssists,
        kda,
        winrate,
      };
    });

    const missingSettings = rows.filter(
      (r) => !r.settings || !Object.keys(r.settings || {}).length
    );

    if (missingSettings.length) {
      const refs = missingSettings.map((r) =>
        db.collection("users").doc(r.uid).collection("profile").doc("settings")
      );
      const snaps = await db.getAll(...refs);
      snaps.forEach((snap, i) => {
        const data = snap.exists ? snap.data() || {} : {};
        const settings = data.settings || null;
        if (settings && Object.keys(settings).length) {
          missingSettings[i].settings = settings;
        }
      });

      const stillMissing = missingSettings.filter(
        (r) => !r.settings || !Object.keys(r.settings || {}).length
      );
      if (stillMissing.length) {
        const legacyRefs = stillMissing.map((r) =>
          db.collection("users").doc(r.uid).collection("profile").doc("socials")
        );
        const legacySnaps = await db.getAll(...legacyRefs);
        legacySnaps.forEach((snap, i) => {
          const data = snap.exists ? snap.data() || {} : {};
          const settings = data.socials || null;
          if (settings && Object.keys(settings).length) {
            stillMissing[i].settings = settings;
          }
        });
      }
    }

    const countSnap = await db.collection("leaderboard_users").count().get();
    const total = countSnap.data().count || 0;
    return { rows, total };
  }

  return { getDistributions, getLeaderboardPage, topPercent };
}
