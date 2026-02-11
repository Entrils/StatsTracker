export function registerLeaderboardRoutes(app, deps) {
  const {
    admin,
    db,
    logger,
    authLimiter,
    requireAuth,
    statsLimiter,
    getLeaderboardPage,
    parseIntParam,
    getActiveBansSet,
  } = deps;

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
      const aggRef = db.collection("leaderboard_users").doc(uid);
      const processedRef = db.collection("leaderboard_updates").doc(`${uid}_${matchId}`);

      const result = await db.runTransaction(async (tx) => {
        const processedSnap = await tx.get(processedRef);
        if (processedSnap.exists) {
          return { updated: false };
        }

        const aggSnap = await tx.get(aggRef);
        const matchSnap = await tx.get(matchRef);
        if (!matchSnap.exists) {
          return { updated: false, missingMatch: true };
        }

        const m = matchSnap.data() || {};
        const inc = admin.firestore.FieldValue.increment;
        const wins = m.result === "victory" ? 1 : 0;
        const losses = m.result === "defeat" ? 1 : 0;

        const aggPayload = {
          uid,
          name: m.name || "Unknown",
          score: inc(m.score || 0),
          kills: inc(m.kills || 0),
          deaths: inc(m.deaths || 0),
          assists: inc(m.assists || 0),
          damage: inc(m.damage || 0),
          damageShare: inc(m.damageShare || 0),
          matches: inc(1),
          wins: inc(wins),
          losses: inc(losses),
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
          if (typeof m.createdAt === "number") {
            if (!prev.firstMatchAt || m.createdAt < prev.firstMatchAt) {
              prev.firstMatchAt = m.createdAt;
            }
          }

          players.set(uid, prev);
        }

        lastDoc = snap.docs[snap.docs.length - 1];
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
      const allowedSorts = new Set(["matches", "winrate", "avgScore", "kda"]);
      const sortBy = allowedSorts.has(sort) ? sort : "matches";

      const now = Date.now();
      const { rows, total } = await getLeaderboardPage(limit, offset, sortBy);
      return res.json({
        updatedAt: now,
        total,
        sortBy,
        rows,
      });
    } catch (err) {
      logger.error("LEADERBOARD ERROR:", err);
      return res.status(500).json({ error: "Failed to load leaderboard" });
    }
  });
}
