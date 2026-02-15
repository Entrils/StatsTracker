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
      const offsetRaw = parseIntParam(req.query.offset, 0);
      if (limitRaw === null || offsetRaw === null) {
        return res.status(400).json({ error: "Invalid pagination params" });
      }
      const limit = Math.min(Math.max(limitRaw, 1), 500);
      const offset = Math.max(offsetRaw, 0);

      const snap = await db
        .collection("leaderboard_users")
        .orderBy("hiddenElo", "desc")
        .offset(offset)
        .limit(limit)
        .get();

      const toNum = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };

      const rows = snap.docs.map((doc) => {
        const d = doc.data() || {};
        const matches = toNum(d.matches);
        const wins = toNum(d.wins);
        const losses = toNum(d.losses);
        const kills = toNum(d.kills);
        const deaths = toNum(d.deaths);
        const assists = toNum(d.assists);
        return {
          uid: doc.id,
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

      return res.json({ limit, offset, rows });
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
}
