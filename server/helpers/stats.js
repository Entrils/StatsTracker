export function createStatsHelpers({
  admin,
  db,
  logger,
  CACHE_COLLECTION,
  GLOBAL_CACHE_TTL_MS,
  getActiveBansSet,
  LEADERBOARD_CACHE_TTL_MS: _LEADERBOARD_CACHE_TTL_MS = 30000,
}) {
  let globalCache = {
    updatedAt: 0,
    distributions: null,
    countPlayers: 0,
  };
  const normalizeSettingsPayload = (value) => {
    const candidates = [value, value?.settings, value?.socials];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      const out = {};
      const fields = ["twitch", "youtube", "tiktok", "fragpunkId"];
      fields.forEach((key) => {
        const raw = typeof candidate[key] === "string" ? candidate[key].trim() : "";
        if (!raw) return;
        out[key] = raw;
      });
      if (Object.keys(out).length) return out;
    }
    return null;
  };
  const canOrderByDocumentId =
    typeof admin?.firestore?.FieldPath?.documentId === "function";
  const isMissingIndexError = (err) => {
    const code = String(err?.code || "").toLowerCase();
    const msg = String(err?.message || "").toLowerCase();
    return code.includes("failed-precondition")
      || msg.includes("failed_precondition")
      || msg.includes("failed precondition")
      || msg.includes("requires an index")
      || msg.includes("create index");
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
    const bannedSet = getActiveBansSet ? await getActiveBansSet() : null;
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
        if (bannedSet && bannedSet.has(owner)) continue;
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

  const SORT_FIELDS = {
    matches: "matches",
    winrate: "winrate",
    avgScore: "avgScore",
    kda: "kda",
    elo: "elo",
  };

  const getSortFields = (sortBy) => {
    const key = SORT_FIELDS[sortBy] ? sortBy : "matches";
    return {
      sortKey: key,
      lastRankField: `lastRank_${key}`,
      lastRankAtField: `lastRankAt_${key}`,
    };
  };

  const toMs = (v) => {
    if (!v) return 0;
    if (typeof v === "number") return v;
    if (typeof v.toMillis === "function") return v.toMillis();
    return 0;
  };

  const getSortOrderField = (sortBy) => {
    if (sortBy === "elo") return "hiddenElo";
    if (["matches", "winrate", "avgScore", "kda"].includes(sortBy)) return sortBy;
    return "matches";
  };

  const toSortableNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  async function getLeaderboardPage(limit, offset, sortBy = "matches", cursor = null) {
    const now = Date.now();
    const windowMs = 7 * 24 * 60 * 60 * 1000;
    const { sortKey, lastRankField, lastRankAtField } = getSortFields(sortBy);
    const sortField = getSortOrderField(sortKey);
    const bannedSet = getActiveBansSet ? await getActiveBansSet() : null;
    const desiredCount = Math.max(1, limit) + 1;
    const scanChunk = Math.max(50, Math.min(400, limit * 2));
    const scanLimit = Math.max(500, limit * 20);
    const collectedDocs = [];
    let scanned = 0;
    let nextAfterValue = Number.isFinite(Number(cursor?.afterValue))
      ? Number(cursor.afterValue)
      : null;
    let nextAfterUid = String(cursor?.afterUid || "").trim() || null;

    let useDocIdTieBreak = canOrderByDocumentId;
    while (collectedDocs.length < desiredCount && scanned < scanLimit) {
      let query = db
        .collection("leaderboard_users")
        .orderBy(sortField, "desc");
      if (useDocIdTieBreak) {
        query = query.orderBy(admin.firestore.FieldPath.documentId(), "asc");
      }
      query = query.limit(scanChunk);
      if (Number.isFinite(nextAfterValue) && typeof query.startAfter === "function") {
        query = useDocIdTieBreak && nextAfterUid
          ? query.startAfter(nextAfterValue, nextAfterUid)
          : query.startAfter(nextAfterValue);
      }
      let snap;
      try {
        snap = await query.get();
      } catch (err) {
        if (useDocIdTieBreak && isMissingIndexError(err)) {
          logger?.warn?.(
            "LEADERBOARD QUERY FALLBACK (NO COMPOSITE INDEX FOR DOCID TIEBREAK):",
            err?.message || err
          );
          useDocIdTieBreak = false;
          // Reset cursor to safest point for degraded query mode.
          if (!Number.isFinite(nextAfterValue) && Number.isFinite(Number(cursor?.afterValue))) {
            nextAfterValue = Number(cursor.afterValue);
          }
          nextAfterUid = null;
          continue;
        }
        throw err;
      }
      const docs = Array.isArray(snap?.docs) ? snap.docs : [];
      if (!docs.length) break;
      scanned += docs.length;
      for (const doc of docs) {
        const uid = String(doc?.id || "");
        if (!uid) continue;
        if (bannedSet && bannedSet.has(uid)) continue;
        collectedDocs.push(doc);
        if (collectedDocs.length >= desiredCount) break;
      }
      const lastScanned = docs[docs.length - 1];
      const lastScannedData = lastScanned?.data?.() || {};
      nextAfterUid = useDocIdTieBreak ? (String(lastScanned?.id || "").trim() || null) : null;
      nextAfterValue = toSortableNumber(lastScannedData?.[sortField], 0);
      if (docs.length < scanChunk) break;
    }

    const shouldSupplementMissingMatches =
      sortField === "matches" &&
      !cursor &&
      Math.max(0, Number(offset) || 0) === 0 &&
      collectedDocs.length < desiredCount &&
      canOrderByDocumentId;
    if (shouldSupplementMissingMatches) {
      const missingNeeded = desiredCount - collectedDocs.length;
      const seen = new Set(collectedDocs.map((doc) => String(doc?.id || "")).filter(Boolean));
      let fallbackLastDoc = null;
      let fallbackScanned = 0;
      const fallbackScanLimit = Math.max(300, missingNeeded * 30);
      while (collectedDocs.length < desiredCount && fallbackScanned < fallbackScanLimit) {
        let query = db
          .collection("leaderboard_users")
          .orderBy(admin.firestore.FieldPath.documentId(), "asc")
          .limit(scanChunk);
        if (fallbackLastDoc && typeof query.startAfter === "function") {
          query = query.startAfter(fallbackLastDoc);
        }
        const snap = await query.get();
        const docs = Array.isArray(snap?.docs) ? snap.docs : [];
        if (!docs.length) break;
        fallbackScanned += docs.length;
        for (const doc of docs) {
          const uid = String(doc?.id || "");
          if (!uid || seen.has(uid)) continue;
          if (bannedSet && bannedSet.has(uid)) continue;
          const raw = doc.data() || {};
          const hasMatches = Number.isFinite(Number(raw.matches));
          if (hasMatches) continue;
          seen.add(uid);
          collectedDocs.push(doc);
          if (collectedDocs.length >= desiredCount) break;
        }
        fallbackLastDoc = docs[docs.length - 1] || null;
        if (docs.length < scanChunk) break;
      }
    }

    const pageDocs = collectedDocs.slice(0, limit);
    const hasMore = collectedDocs.length > limit;
    const pageRows = pageDocs.map((doc) => {
      const p = doc.data() || {};
      const uid = doc.id;
      const matches = Number(p.matches || 0);
      const avgScore = Number.isFinite(Number(p.avgScore))
        ? Number(p.avgScore)
        : matches
          ? (p.score || 0) / matches
          : 0;
      const avgKills = matches ? (p.kills || 0) / matches : 0;
      const avgDeaths = matches ? (p.deaths || 0) / matches : 0;
      const avgAssists = matches ? (p.assists || 0) / matches : 0;
      const kda = Number.isFinite(Number(p.kda))
        ? Number(p.kda)
        : (p.kills + p.assists) / Math.max(1, p.deaths || 0);
      const winrate = Number.isFinite(Number(p.winrate))
        ? Number(p.winrate)
        : (p.wins / Math.max(1, matches)) * 100 || 0;

      return {
        uid,
        name: p.name || "Unknown",
        elo: Number.isFinite(Number(p.hiddenElo)) ? Number(p.hiddenElo) : 500,
        settings:
          normalizeSettingsPayload(p.settings) ||
          normalizeSettingsPayload(p.socials) ||
          null,
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
        createdAt: p.createdAt || p.firstMatchAt || p.updatedAt || null,
        lastRank_matches: p.lastRank_matches || null,
        lastRankAt_matches: p.lastRankAt_matches || null,
        lastRank_winrate: p.lastRank_winrate || null,
        lastRankAt_winrate: p.lastRankAt_winrate || null,
        lastRank_avgScore: p.lastRank_avgScore || null,
        lastRankAt_avgScore: p.lastRankAt_avgScore || null,
        lastRank_kda: p.lastRank_kda || null,
        lastRankAt_kda: p.lastRankAt_kda || null,
      };
    });
    const rowsWithoutSettings = pageRows.filter((row) => !normalizeSettingsPayload(row?.settings));
    if (rowsWithoutSettings.length) {
      const uidList = [...new Set(rowsWithoutSettings.map((row) => String(row?.uid || "")).filter(Boolean))];
      const userRefs = uidList.map((uid) => db.collection("users").doc(uid));
      const userSnaps =
        userRefs.length === 0
          ? []
          : typeof db.getAll === "function"
            ? await db.getAll(...userRefs)
            : await Promise.all(userRefs.map((ref) => ref.get()));
      const settingsByUid = new Map();
      userSnaps.forEach((snap, idx) => {
        const uid = uidList[idx];
        const userData = snap?.exists ? snap.data() || {} : {};
        const settings =
          normalizeSettingsPayload(userData?.settings) ||
          normalizeSettingsPayload(userData?.socials);
        if (settings) settingsByUid.set(uid, settings);
      });

      const missingProfileSettingsUids = uidList.filter((uid) => !settingsByUid.has(uid));
      if (missingProfileSettingsUids.length) {
        const profileSettingsRefs = missingProfileSettingsUids.map((uid) =>
          db.collection("users").doc(uid).collection("profile").doc("settings")
        );
        const profileSettingsSnaps =
          typeof db.getAll === "function"
            ? await db.getAll(...profileSettingsRefs)
            : await Promise.all(profileSettingsRefs.map((ref) => ref.get()));
        profileSettingsSnaps.forEach((snap, idx) => {
          const uid = missingProfileSettingsUids[idx];
          const data = snap?.exists ? snap.data() || {} : {};
          const settings = normalizeSettingsPayload(data);
          if (settings) settingsByUid.set(uid, settings);
        });
      }

      pageRows.forEach((row) => {
        if (normalizeSettingsPayload(row?.settings)) return;
        const fallbackSettings = settingsByUid.get(String(row?.uid || ""));
        if (fallbackSettings) row.settings = fallbackSettings;
      });
    }

    const batch = db.batch();
    let hasUpdates = false;

    pageRows.forEach((row, idx) => {
      const currentRank = Math.max(0, Number(offset) || 0) + idx + 1;
      row.rank = currentRank;

      const lastRankAtMs = toMs(row[lastRankAtField]);
      const hasRecent = lastRankAtMs && now - lastRankAtMs <= windowMs;
      const lastRank = Number.isFinite(row[lastRankField]) ? row[lastRankField] : null;
      const delta = hasRecent && lastRank ? lastRank - currentRank : 0;
      row.rankDelta = delta;

      if (!lastRankAtMs || now - lastRankAtMs > windowMs) {
        const ref = db.collection("leaderboard_users").doc(row.uid);
        batch.set(
          ref,
          { [lastRankField]: currentRank, [lastRankAtField]: now },
          { merge: true }
        );
        hasUpdates = true;
      }
    });

    if (hasUpdates) {
      await batch.commit();
    }
    const lastPageDoc = pageDocs[pageDocs.length - 1] || null;
    const lastPageData = lastPageDoc?.data?.() || {};
    const nextCursor =
      hasMore && lastPageDoc
        ? {
            afterUid: String(lastPageDoc.id || ""),
            afterValue: toSortableNumber(lastPageData?.[sortField], 0),
          }
        : null;
    return { rows: pageRows, hasMore, nextCursor };
  }

  return { getDistributions, getLeaderboardPage, topPercent };
}
