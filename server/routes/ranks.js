import { computeHiddenElo } from "../helpers/elo.js";

export function registerRankRoutes(app, deps) {
  const {
    admin,
    db,
    logger,
    authLimiter,
    requireAuth,
    rankDailyLimiter,
    ALLOWED_RANKS,
    RANK_SUBMIT_DAILY_LIMIT,
    isValidBase64Image,
    parseIntParam,
  } = deps;

  app.post(
    "/rank/submit",
    authLimiter,
    requireAuth,
    rankDailyLimiter,
    async (req, res) => {
      try {
        const uid = req.user?.uid;
        if (!uid) return res.status(401).json({ error: "Missing auth token" });

        const season = String(req.body?.season || "").trim().toLowerCase();
        const rank = String(req.body?.rank || "").trim().toLowerCase();
        const base64Image = req.body?.base64Image;

        const allowedSeasons = new Set(["s1", "s2", "s3", "s4"]);
        if (!allowedSeasons.has(season)) {
          return res.status(400).json({ error: "Invalid season" });
        }
        if (!ALLOWED_RANKS.has(rank)) {
          return res.status(400).json({ error: "Invalid rank" });
        }
        if (!base64Image) {
          return res.status(400).json({ error: "Missing base64Image" });
        }
        if (!isValidBase64Image(base64Image)) {
          return res.status(400).json({ error: "Invalid base64Image" });
        }

        const profileSnap = await db.collection("leaderboard_users").doc(uid).get();
        const name = profileSnap.exists ? profileSnap.data()?.name || null : null;

        const doc = await db.collection("rank_submissions").add({
          uid,
          name,
          season,
          rank,
          image: base64Image,
          status: "pending",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.json({
          ok: true,
          id: doc.id,
          remaining: req.rankRemaining ?? 0,
          limit: RANK_SUBMIT_DAILY_LIMIT,
        });
      } catch (err) {
        logger.error("RANK SUBMIT ERROR:", err);
        return res.status(500).json({ error: "Failed to submit rank" });
      }
    }
  );

  app.get("/admin/ranks", authLimiter, requireAuth, async (req, res) => {
    const isAdmin = req.user?.admin === true || req.user?.role === "admin";
    if (!isAdmin) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const status = String(req.query.status || "pending").toLowerCase();
    const limitRaw = parseIntParam(req.query.limit, 50);
    if (limitRaw === null) {
      return res.status(400).json({ error: "Invalid limit" });
    }
    const limit = Math.min(Math.max(limitRaw, 1), 200);

    try {
      let query = db.collection("rank_submissions");
      if (status !== "all") {
        query = query.where("status", "==", status);
      }
      const snap = await query.limit(limit).get();
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return res.json({ rows });
    } catch (err) {
      logger.error("ADMIN RANKS LIST ERROR:", err);
      return res.status(500).json({ error: "Failed to load submissions" });
    }
  });

  app.post("/admin/ranks/decision", authLimiter, requireAuth, async (req, res) => {
    const isAdmin = req.user?.admin === true || req.user?.role === "admin";
    if (!isAdmin) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const id = String(req.body?.id || "").trim();
    const decision = String(req.body?.decision || "").trim().toLowerCase();
    if (!id || (decision !== "approved" && decision !== "rejected")) {
      return res.status(400).json({ error: "Invalid request" });
    }

    try {
      const ref = db.collection("rank_submissions").doc(id);
      const snap = await ref.get();
      if (!snap.exists) {
        return res.status(404).json({ error: "Not found" });
      }
      const data = snap.data() || {};

      await ref.set(
        {
          status: decision,
          reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
          reviewedBy: req.user?.uid || null,
        },
        { merge: true }
      );

      if (decision === "approved") {
        const season = data.season;
        const rank = data.rank;
        if (season && rank) {
          await db
            .collection("users")
            .doc(data.uid)
            .collection("profile")
            .doc("ranks")
            .set(
              {
                [season]: {
                  rank,
                  verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
              },
              { merge: true }
            );

          const aggRef = db.collection("leaderboard_users").doc(data.uid);
          const [aggSnap, ranksSnap] = await Promise.all([
            aggRef.get(),
            db.collection("users").doc(data.uid).collection("profile").doc("ranks").get(),
          ]);
          if (aggSnap.exists) {
            const agg = aggSnap.data() || {};
            const hiddenElo = computeHiddenElo({
              matches: agg.matches || 0,
              score: agg.score || 0,
              kills: agg.kills || 0,
              deaths: agg.deaths || 0,
              assists: agg.assists || 0,
              damage: agg.damage || 0,
              damageShare: agg.damageShare || 0,
              ranks: ranksSnap.exists ? ranksSnap.data() || {} : {},
            });
            await aggRef.set(
              {
                hiddenElo,
                hiddenEloUpdatedAt: Date.now(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }
        }
      }

      return res.json({ ok: true });
    } catch (err) {
      logger.error("ADMIN RANK DECISION ERROR:", err);
      return res.status(500).json({ error: "Failed to update submission" });
    }
  });
}
