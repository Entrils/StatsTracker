import { computeHiddenElo } from "../helpers/elo.js";

export function registerLeaderboardRoutes(app, deps) {
  const {
    admin,
    db,
    logger,
    authLimiter,
    requireAuth,
    statsLimiter,
    getLeaderboardPage,
    getSteamOnline,
    steamAppId,
    parseIntParam,
    getActiveBansSet,
  } = deps;
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
  const listHiddenEloWithoutIndexes = async () => {
    if (!canOrderByDocumentId) return null;
    const scanLimit = 5000;
    const pageSize = 500;
    const rows = [];
    let scanned = 0;
    let lastDoc = null;

    while (scanned < scanLimit) {
      let query = db
        .collection("leaderboard_users")
        .orderBy(admin.firestore.FieldPath.documentId(), "asc")
        .limit(Math.min(pageSize, scanLimit - scanned));
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }
      const snap = await query.get();
      if (!snap?.docs?.length) break;
      for (const doc of snap.docs) {
        rows.push({ uid: doc.id, ...(doc.data() || {}) });
      }
      scanned += snap.docs.length;
      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < pageSize) break;
    }

    rows.sort((a, b) => {
      const eloA = Number.isFinite(Number(a.hiddenElo)) ? Number(a.hiddenElo) : 0;
      const eloB = Number.isFinite(Number(b.hiddenElo)) ? Number(b.hiddenElo) : 0;
      if (eloA !== eloB) return eloB - eloA;
      return String(a.uid || "").localeCompare(String(b.uid || ""));
    });
    return rows;
  };

  app.post("/leaderboard/update", authLimiter, requireAuth, async (req, res) => {
    try {
      const { matchId } = req.body || {};
      const uid = req.user?.uid;
      if (!uid || !matchId) {
        return res.status(400).json({ error: "Missing uid or matchId" });
      }
      const banSnap = await db.collection("bans").doc(uid).get();
      if (banSnap.exists && banSnap.data()?.active) {
        return res.status(403).json({ error: "Banned" });
      }

      const matchRef = db
        .collection("users")
        .doc(uid)
        .collection("matches")
        .doc(matchId);
      const ranksRef = db.collection("users").doc(uid).collection("profile").doc("ranks");
      const aggRef = db.collection("leaderboard_users").doc(uid);
      const processedRef = db.collection("leaderboard_updates").doc(`${uid}_${matchId}`);

      const result = await db.runTransaction(async (tx) => {
        const processedSnap = await tx.get(processedRef);
        if (processedSnap.exists) {
          return { updated: false };
        }

        const aggSnap = await tx.get(aggRef);
        const ranksSnap = await tx.get(ranksRef);
        const matchSnap = await tx.get(matchRef);
        if (!matchSnap.exists) {
          return { updated: false, missingMatch: true };
        }

        const m = matchSnap.data() || {};
        const current = aggSnap.exists ? aggSnap.data() || {} : {};
        const toNum = (v) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        };
        const wins = m.result === "victory" ? 1 : 0;
        const losses = m.result === "defeat" ? 1 : 0;
        const currentStreakRaw = toNum(current.currentStreak);
        const bestStreakRaw = toNum(current.bestStreak);
        const nextCurrentStreak =
          m.result === "victory"
            ? currentStreakRaw + 1
            : m.result === "defeat"
              ? 0
              : currentStreakRaw;
        const nextBestStreak = Math.max(bestStreakRaw, nextCurrentStreak);
        const totals = {
          score: toNum(current.score) + toNum(m.score),
          kills: toNum(current.kills) + toNum(m.kills),
          deaths: toNum(current.deaths) + toNum(m.deaths),
          assists: toNum(current.assists) + toNum(m.assists),
          damage: toNum(current.damage) + toNum(m.damage),
          damageShare: toNum(current.damageShare) + toNum(m.damageShare),
          matches: toNum(current.matches) + 1,
          wins: toNum(current.wins) + wins,
          losses: toNum(current.losses) + losses,
        };
        const ranks = ranksSnap.exists ? ranksSnap.data() || {} : {};
        const hiddenElo = computeHiddenElo({ ...totals, ranks });
        const avgScore = totals.matches ? totals.score / totals.matches : 0;
        const kda = (totals.kills + totals.assists) / Math.max(1, totals.deaths);
        const winrate = (totals.wins / Math.max(1, totals.matches)) * 100 || 0;

        const aggPayload = {
          uid,
          name: m.name || current.name || "Unknown",
          score: totals.score,
          kills: totals.kills,
          deaths: totals.deaths,
          assists: totals.assists,
          damage: totals.damage,
          damageShare: totals.damageShare,
          matches: totals.matches,
          wins: totals.wins,
          losses: totals.losses,
          avgScore,
          kda,
          winrate,
          maxKills: Math.max(toNum(current.maxKills), toNum(m.kills)),
          currentStreak: nextCurrentStreak,
          bestStreak: nextBestStreak,
          hiddenElo,
          hiddenEloUpdatedAt: Date.now(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (!aggSnap.exists || !aggSnap.get("createdAt")) {
          aggPayload.createdAt =
            typeof m.createdAt === "number"
              ? m.createdAt
              : admin.firestore.FieldValue.serverTimestamp();
        }

        tx.set(aggRef, aggPayload, { merge: true });

        tx.set(processedRef, {
          uid,
          matchId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return { updated: true };
      });

      return res.json(result);
    } catch (err) {
      logger.error("LEADERBOARD UPDATE ERROR:", err);
      return res.status(500).json({ error: "Failed to update leaderboard" });
    }
  });

  app.post("/leaderboard/rebuild", authLimiter, requireAuth, async (req, res) => {
    try {
      const isAdmin = req.user?.admin === true || req.user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const bannedSet = getActiveBansSet ? await getActiveBansSet() : null;
      let lastDoc = null;
      const players = new Map();
      const ranksByUid = new Map();
      const baseQuery = db
        .collectionGroup("matches")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(1000);

      while (true) {
        const query = lastDoc ? baseQuery.startAfter(lastDoc) : baseQuery;
        const snap = await query.get();
        if (snap.empty) break;

        for (const doc of snap.docs) {
          const m = doc.data() || {};
          const uid = doc.ref?.parent?.parent?.id || m.ownerUid || m.uid || m.userId;
          if (!uid) continue;
          if (bannedSet && bannedSet.has(uid)) continue;

          const prev = players.get(uid) || {
            uid,
            name: "Unknown",
            score: 0,
            kills: 0,
            deaths: 0,
            assists: 0,
            damage: 0,
            damageShare: 0,
            wins: 0,
            losses: 0,
            matches: 0,
            maxKills: 0,
            firstMatchAt: null,
          };

          if ((m.name || m.playerName || m.username) && prev.name === "Unknown") {
            prev.name = m.name || m.playerName || m.username;
          }

          prev.score += m.score || 0;
          prev.kills += m.kills || 0;
          prev.deaths += m.deaths || 0;
          prev.assists += m.assists || 0;
          prev.damage += m.damage || 0;
          prev.damageShare += m.damageShare || 0;
          if (m.result === "victory") prev.wins += 1;
          else if (m.result === "defeat") prev.losses += 1;
          prev.matches += 1;
          prev.maxKills = Math.max(prev.maxKills || 0, Number(m.kills || 0));
          if (typeof m.createdAt === "number") {
            if (!prev.firstMatchAt || m.createdAt < prev.firstMatchAt) {
              prev.firstMatchAt = m.createdAt;
            }
          }

          players.set(uid, prev);
        }

        lastDoc = snap.docs[snap.docs.length - 1];
      }

      const playerUids = [...players.keys()];
      const ranksChunkSize = 300;
      for (let i = 0; i < playerUids.length; i += ranksChunkSize) {
        const chunk = playerUids.slice(i, i + ranksChunkSize);
        const refs = chunk.map((id) =>
          db.collection("users").doc(id).collection("profile").doc("ranks")
        );
        const snaps = await db.getAll(...refs);
        snaps.forEach((snap, idx) => {
          ranksByUid.set(chunk[idx], snap.exists ? snap.data() || {} : {});
        });
      }

      const batchSize = 500;
      let batch = db.batch();
      let i = 0;

      for (const p of players.values()) {
        const ref = db.collection("leaderboard_users").doc(p.uid);
        const payload = {
          name: p.name,
          score: p.score,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          damage: p.damage,
          damageShare: p.damageShare,
          wins: p.wins,
          losses: p.losses,
          matches: p.matches,
          maxKills: Number(p.maxKills || 0),
          avgScore: p.matches ? p.score / p.matches : 0,
          kda: (p.kills + p.assists) / Math.max(1, p.deaths || 0),
          winrate: (p.wins / Math.max(1, p.matches)) * 100 || 0,
          hiddenElo: computeHiddenElo({
            matches: p.matches,
            score: p.score,
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,
            damage: p.damage,
            damageShare: p.damageShare,
            ranks: ranksByUid.get(p.uid) || {},
          }),
          hiddenEloUpdatedAt: Date.now(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (p.firstMatchAt) {
          payload.createdAt = p.firstMatchAt;
        } else {
          payload.createdAt = admin.firestore.FieldValue.delete();
        }

        batch.set(ref, payload, { merge: true });

        i += 1;
        if (i % batchSize === 0) {
          await batch.commit();
          batch = db.batch();
        }
      }

      if (i % batchSize !== 0) {
        await batch.commit();
      }

      return res.json({ ok: true, players: players.size });
    } catch (err) {
      logger.error("LEADERBOARD REBUILD ERROR:", err);
      return res.status(500).json({ error: "Failed to rebuild leaderboard" });
    }
  });

  app.get("/leaderboard", statsLimiter, async (req, res) => {
    try {
      const limitRaw = parseIntParam(req.query.limit, 300);
      const offsetRaw = parseIntParam(req.query.offset, 0);
      if (limitRaw === null || offsetRaw === null) {
        return res.status(400).json({ error: "Invalid pagination params" });
      }
      const limit = Math.min(Math.max(limitRaw, 1), 1000);
      const offset = Math.max(offsetRaw, 0);
      const sort = String(req.query.sort || "matches");
      const allowedSorts = new Set(["matches", "winrate", "avgScore", "kda", "elo"]);
      const sortBy = allowedSorts.has(sort) ? sort : "matches";

      const now = Date.now();
      const { rows, total } = await getLeaderboardPage(limit, offset, sortBy);
      const steamOnline = getSteamOnline ? await getSteamOnline() : null;
      return res.json({
        updatedAt: now,
        total,
        sortBy,
        steamOnline,
        steamAppId: steamAppId || null,
        rows,
      });
    } catch (err) {
      logger.error("LEADERBOARD ERROR:", err);
      return res.status(500).json({ error: "Failed to load leaderboard" });
    }
  });

  app.get("/admin/hidden-elo", authLimiter, requireAuth, async (req, res) => {
    try {
      const isAdmin = req.user?.admin === true || req.user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const limitRaw = parseIntParam(req.query.limit, 100);
      if (limitRaw === null) {
        return res.status(400).json({ error: "Invalid pagination params" });
      }
      const limit = Math.min(Math.max(limitRaw, 1), 500);
      const afterUid = String(req.query.afterUid || "").trim();
      const afterHiddenEloRaw = req.query.afterHiddenElo;
      const afterHiddenEloNum = Number(afterHiddenEloRaw);
      const hasCursor = Number.isFinite(afterHiddenEloNum)
        && (canOrderByDocumentId ? Boolean(afterUid) : true);
      const hasOffset = req.query.offset !== undefined;
      const offsetRaw = hasOffset ? parseIntParam(req.query.offset, 0) : 0;
      if (hasOffset && offsetRaw === null) {
        return res.status(400).json({ error: "Invalid pagination params" });
      }
      const offset = Math.max(offsetRaw || 0, 0);

      const runQuery = async (withDocIdTieBreak) => {
        let query = db
          .collection("leaderboard_users")
          .orderBy("hiddenElo", "desc");
        if (withDocIdTieBreak) {
          query = query.orderBy(admin.firestore.FieldPath.documentId(), "asc");
        }
        if (hasCursor && typeof query.startAfter === "function") {
          query = withDocIdTieBreak
            ? query.startAfter(afterHiddenEloNum, afterUid)
            : query.startAfter(afterHiddenEloNum);
        } else if (hasOffset && offset > 0 && typeof query.offset === "function") {
          // Legacy fallback for old clients.
          query = query.offset(offset);
        }
        query = query.limit(limit);
        return query.get();
      };

      let usedDocIdTieBreak = canOrderByDocumentId;
      let snap;
      let memoryRows = null;
      try {
        snap = await runQuery(usedDocIdTieBreak);
      } catch (err) {
        if (!usedDocIdTieBreak || !isMissingIndexError(err)) throw err;
        logger?.warn?.("ADMIN HIDDEN ELO LIST QUERY FALLBACK (NO COMPOSITE INDEX):", err?.message || err);
        usedDocIdTieBreak = false;
        try {
          snap = await runQuery(false);
        } catch (fallbackErr) {
          if (!isMissingIndexError(fallbackErr)) throw fallbackErr;
          logger?.warn?.(
            "ADMIN HIDDEN ELO LIST QUERY FALLBACK (NO INDEX FOR hiddenElo, USING MEMORY SORT):",
            fallbackErr?.message || fallbackErr
          );
          memoryRows = await listHiddenEloWithoutIndexes();
          if (!memoryRows) throw fallbackErr;
        }
      }

      const toNum = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };

      const materializedRows = memoryRows || snap.docs.map((doc) => ({ uid: doc.id, ...(doc.data() || {}) }));
      let rowsPool = materializedRows;
      let pagedRows = materializedRows;
      if (memoryRows) {
        if (hasCursor) {
          rowsPool = rowsPool.filter((row) => {
            const rowHiddenElo = toNum(row.hiddenElo);
            if (rowHiddenElo < afterHiddenEloNum) return true;
            if (rowHiddenElo > afterHiddenEloNum) return false;
            if (!afterUid) return false;
            return String(row.uid || "") > afterUid;
          });
        } else if (hasOffset && offset > 0) {
          rowsPool = rowsPool.slice(offset);
        }
        pagedRows = rowsPool.slice(0, limit);
      }

      const rows = pagedRows.map((row) => {
        const d = row || {};
        const matches = toNum(d.matches);
        const wins = toNum(d.wins);
        const losses = toNum(d.losses);
        const kills = toNum(d.kills);
        const deaths = toNum(d.deaths);
        const assists = toNum(d.assists);
        return {
          uid: d.uid,
          name: d.name || "Unknown",
          hiddenElo: toNum(d.hiddenElo),
          hiddenEloUpdatedAt: d.hiddenEloUpdatedAt || null,
          matches,
          wins,
          losses,
          avgScore: matches ? toNum(d.score) / matches : 0,
          kda: (kills + assists) / Math.max(1, deaths),
          winrate: (wins / Math.max(1, matches)) * 100 || 0,
        };
      });

      const hasMore = memoryRows
        ? rowsPool.length > rows.length
        : snap.docs.length === limit;
      const lastRow = rows[rows.length - 1] || null;
      const nextAfterUid = lastRow?.uid || null;
      const nextAfterHiddenElo = nextAfterUid ? toNum(lastRow.hiddenElo) : null;
      return res.json({
        limit,
        offset: hasOffset ? offset : 0,
        rows,
        hasMore,
        orderMode: memoryRows ? "memory:hiddenElo+uid" : usedDocIdTieBreak ? "hiddenElo+uid" : "hiddenElo",
        nextCursor:
          nextAfterUid && nextAfterHiddenElo !== null
            ? { afterUid: nextAfterUid, afterHiddenElo: nextAfterHiddenElo }
            : null,
      });
    } catch (err) {
      logger.error("ADMIN HIDDEN ELO LIST ERROR:", err);
      return res.status(500).json({ error: "Failed to load hidden elo list" });
    }
  });

  app.post("/admin/hidden-elo/recompute", authLimiter, requireAuth, async (req, res) => {
    try {
      const isAdmin = req.user?.admin === true || req.user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const now = Date.now();
      let processedLeaderboard = 0;
      let createdFromUsers = 0;

      const toNum = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };

      // 1) Recompute for all existing leaderboard_users docs.
      let lastLeaderboardDoc = null;
      const leaderboardBaseQuery = db
        .collection("leaderboard_users")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(300);

      while (true) {
        const query = lastLeaderboardDoc
          ? leaderboardBaseQuery.startAfter(lastLeaderboardDoc)
          : leaderboardBaseQuery;
        const snap = await query.get();
        if (snap.empty) break;

        const ids = snap.docs.map((doc) => doc.id);
        const rankRefs = ids.map((uid) =>
          db.collection("users").doc(uid).collection("profile").doc("ranks")
        );
        const rankSnaps = await db.getAll(...rankRefs);
        const rankByUid = new Map();
        rankSnaps.forEach((rankSnap, idx) => {
          rankByUid.set(ids[idx], rankSnap.exists ? rankSnap.data() || {} : {});
        });

        const batch = db.batch();
        for (const doc of snap.docs) {
          const uid = doc.id;
          const d = doc.data() || {};
          const hiddenElo = computeHiddenElo({
            matches: toNum(d.matches),
            score: toNum(d.score),
            kills: toNum(d.kills),
            deaths: toNum(d.deaths),
            assists: toNum(d.assists),
            damage: toNum(d.damage),
            damageShare: toNum(d.damageShare),
            ranks: rankByUid.get(uid) || {},
          });
          batch.set(
            doc.ref,
            {
              hiddenElo,
              hiddenEloUpdatedAt: now,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          processedLeaderboard += 1;
        }
        await batch.commit();

        lastLeaderboardDoc = snap.docs[snap.docs.length - 1];
      }

      // 2) Ensure users without leaderboard_users doc also get hiddenElo.
      let lastUserDoc = null;
      const usersBaseQuery = db
        .collection("users")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(300);

      while (true) {
        const query = lastUserDoc ? usersBaseQuery.startAfter(lastUserDoc) : usersBaseQuery;
        const usersSnap = await query.get();
        if (usersSnap.empty) break;

        const ids = usersSnap.docs.map((doc) => doc.id);
        const lbRefs = ids.map((uid) => db.collection("leaderboard_users").doc(uid));
        const rankRefs = ids.map((uid) =>
          db.collection("users").doc(uid).collection("profile").doc("ranks")
        );

        const [lbSnaps, rankSnaps] = await Promise.all([db.getAll(...lbRefs), db.getAll(...rankRefs)]);

        const batch = db.batch();
        let createdInChunk = 0;
        for (let i = 0; i < ids.length; i += 1) {
          if (lbSnaps[i]?.exists) continue;
          const uid = ids[i];
          const ranks = rankSnaps[i]?.exists ? rankSnaps[i].data() || {} : {};
          const hiddenElo = computeHiddenElo({
            matches: 0,
            score: 0,
            kills: 0,
            deaths: 0,
            assists: 0,
            damage: 0,
            damageShare: 0,
            ranks,
          });

          batch.set(
            db.collection("leaderboard_users").doc(uid),
            {
              uid,
              name: "Unknown",
              matches: 0,
              wins: 0,
              losses: 0,
              score: 0,
              kills: 0,
              deaths: 0,
              assists: 0,
              damage: 0,
              damageShare: 0,
              hiddenElo,
              hiddenEloUpdatedAt: now,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          createdFromUsers += 1;
          createdInChunk += 1;
        }

        if (createdInChunk > 0) {
          await batch.commit();
        }

        lastUserDoc = usersSnap.docs[usersSnap.docs.length - 1];
      }

      return res.json({
        ok: true,
        processedLeaderboard,
        createdFromUsers,
        totalTouched: processedLeaderboard + createdFromUsers,
      });
    } catch (err) {
      logger.error("ADMIN HIDDEN ELO RECOMPUTE ERROR:", err);
      return res.status(500).json({ error: "Failed to recompute hidden elo" });
    }
  });

  app.post("/admin/share-metrics/backfill", authLimiter, requireAuth, async (req, res) => {
    try {
      const isAdmin = req.user?.admin === true || req.user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const readNum = (value, fallback) => {
        const raw = value === undefined ? fallback : value;
        const n = Number.parseInt(raw, 10);
        return Number.isFinite(n) ? n : null;
      };
      const isEnabled = (value, fallback = true) => {
        if (value === undefined || value === null || value === "") return fallback;
        const normalized = String(value).trim().toLowerCase();
        return normalized !== "0" && normalized !== "false" && normalized !== "no";
      };

      const limitRaw = readNum(req.body?.limit ?? req.query?.limit, 50);
      if (limitRaw === null) {
        return res.status(400).json({ error: "Invalid limit" });
      }
      const limit = Math.min(Math.max(limitRaw, 1), 200);
      const startAfterUid = String(req.body?.startAfterUid ?? req.query?.startAfterUid ?? "").trim();
      const apply = isEnabled(req.body?.apply ?? req.query?.apply, true);
      const onlyMissing = isEnabled(req.body?.onlyMissing ?? req.query?.onlyMissing, true);
      const maxMatchesPerUserRaw = readNum(
        req.body?.maxMatchesPerUser ?? req.query?.maxMatchesPerUser,
        10000
      );
      if (maxMatchesPerUserRaw === null) {
        return res.status(400).json({ error: "Invalid maxMatchesPerUser" });
      }
      const maxMatchesPerUser = Math.min(Math.max(maxMatchesPerUserRaw, 100), 50000);

      const baseQuery = db
        .collection("leaderboard_users")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(limit);
      const usersSnap = startAfterUid ? await baseQuery.startAfter(startAfterUid).get() : await baseQuery.get();
      const docs = Array.isArray(usersSnap?.docs) ? usersSnap.docs : [];
      if (!docs.length) {
        return res.json({
          ok: true,
          scanned: 0,
          patched: 0,
          dryRun: !apply,
          onlyMissing,
          hasMore: false,
          nextCursor: null,
        });
      }

      const toNum = (value, fallback = 0) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
      };
      const hasFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

      const statsByUid = new Map();
      for (const userDoc of docs) {
        const uid = String(userDoc.id || "");
        if (!uid) continue;
        const profile = userDoc.data() || {};
        const hasFriendCount = hasFiniteNumber(profile.friendCount);
        const hasBestStreak = hasFiniteNumber(profile.bestStreak);
        const hasMaxKills = hasFiniteNumber(profile.maxKills);
        if (onlyMissing && hasFriendCount && hasBestStreak && hasMaxKills) continue;

        const next = {
          uid,
          friendCount: hasFriendCount ? toNum(profile.friendCount, 0) : null,
          bestStreak: hasBestStreak ? toNum(profile.bestStreak, 0) : null,
          maxKills: hasMaxKills ? toNum(profile.maxKills, 0) : null,
          scannedMatches: 0,
          truncatedMatches: false,
        };

        if (next.friendCount === null) {
          try {
            const friendsRef = db.collection("users").doc(uid).collection("friends");
            if (typeof friendsRef.count === "function") {
              const countSnap = await friendsRef.count().get();
              next.friendCount = toNum(countSnap?.data?.()?.count, 0);
            } else {
              let total = 0;
              let lastDoc = null;
              while (true) {
                let q = friendsRef.orderBy("__name__").limit(500);
                if (lastDoc && typeof q.startAfter === "function") q = q.startAfter(lastDoc);
                const chunk = await q.get();
                const chunkDocs = Array.isArray(chunk?.docs) ? chunk.docs : [];
                if (!chunkDocs.length) break;
                total += chunkDocs.length;
                if (chunkDocs.length < 500) break;
                lastDoc = chunkDocs[chunkDocs.length - 1];
              }
              next.friendCount = total;
            }
          } catch {
            next.friendCount = 0;
          }
        }

        if (next.bestStreak === null || next.maxKills === null) {
          let bestStreak = 0;
          let currentStreak = 0;
          let maxKills = 0;
          let scannedMatches = 0;
          let lastMatchDoc = null;
          const matchesRef = db.collection("users").doc(uid).collection("matches");
          while (scannedMatches < maxMatchesPerUser) {
            let q = matchesRef.orderBy("createdAt", "asc").limit(500);
            if (lastMatchDoc && typeof q.startAfter === "function") q = q.startAfter(lastMatchDoc);
            const chunk = await q.get();
            const chunkDocs = Array.isArray(chunk?.docs) ? chunk.docs : [];
            if (!chunkDocs.length) break;
            for (const matchDoc of chunkDocs) {
              if (scannedMatches >= maxMatchesPerUser) break;
              const match = matchDoc.data() || {};
              const kills = toNum(match.kills, 0);
              if (kills > maxKills) maxKills = kills;
              if (match.result === "victory") {
                currentStreak += 1;
                if (currentStreak > bestStreak) bestStreak = currentStreak;
              } else if (match.result === "defeat") {
                currentStreak = 0;
              }
              scannedMatches += 1;
            }
            if (chunkDocs.length < 500) break;
            lastMatchDoc = chunkDocs[chunkDocs.length - 1];
          }
          next.scannedMatches = scannedMatches;
          next.truncatedMatches = scannedMatches >= maxMatchesPerUser;
          if (next.bestStreak === null) next.bestStreak = bestStreak;
          if (next.maxKills === null) next.maxKills = maxKills;
        }

        statsByUid.set(uid, next);
      }

      let patched = 0;
      let scannedMatches = 0;
      let truncatedUsers = 0;
      if (apply && statsByUid.size > 0) {
        let batch = db.batch();
        let batchOps = 0;
        for (const stats of statsByUid.values()) {
          scannedMatches += toNum(stats.scannedMatches, 0);
          if (stats.truncatedMatches) truncatedUsers += 1;
          batch.set(
            db.collection("leaderboard_users").doc(stats.uid),
            {
              friendCount: toNum(stats.friendCount, 0),
              bestStreak: toNum(stats.bestStreak, 0),
              maxKills: toNum(stats.maxKills, 0),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          batchOps += 1;
          patched += 1;
          if (batchOps >= 400) {
            await batch.commit();
            batch = db.batch();
            batchOps = 0;
          }
        }
        if (batchOps > 0) {
          await batch.commit();
        }
      } else {
        for (const stats of statsByUid.values()) {
          scannedMatches += toNum(stats.scannedMatches, 0);
          if (stats.truncatedMatches) truncatedUsers += 1;
        }
      }

      const lastCursor = docs[docs.length - 1]?.id || null;
      const hasMore = docs.length === limit;
      return res.json({
        ok: true,
        dryRun: !apply,
        onlyMissing,
        limit,
        scanned: docs.length,
        candidates: statsByUid.size,
        patched,
        scannedMatches,
        truncatedUsers,
        hasMore,
        nextCursor: hasMore ? lastCursor : null,
      });
    } catch (err) {
      logger.error("ADMIN SHARE METRICS BACKFILL ERROR:", err);
      return res.status(500).json({ error: "Failed to backfill share metrics" });
    }
  });
}
