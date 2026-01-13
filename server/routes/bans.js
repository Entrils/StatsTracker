export function registerBanRoutes(app, deps) {
  const {
    admin,
    db,
    authLimiter,
    requireAuth,
    parseIntParam,
    isValidUid,
    invalidateStatsCache,
  } = deps;

  const isAdmin = (req) =>
    req.user?.admin === true || req.user?.role === "admin";

  app.get("/admin/bans", authLimiter, requireAuth, async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });
      const limitRaw = parseIntParam(req.query.limit, 100);
      if (limitRaw === null) {
        return res.status(400).json({ error: "Invalid limit" });
      }
      const limit = Math.min(Math.max(limitRaw, 1), 200);
      const snap = await db
        .collection("bans")
        .orderBy("bannedAt", "desc")
        .limit(limit)
        .get();
      const rows = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      return res.json({ rows });
    } catch {
      return res.status(500).json({ error: "Failed to load bans" });
    }
  });

  app.post("/admin/bans/ban", authLimiter, requireAuth, async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });
      const uid = String(req.body?.uid || "").trim();
      if (!uid || !isValidUid(uid)) {
        return res.status(400).json({ error: "Invalid uid" });
      }
      const reason = String(req.body?.reason || "").trim().slice(0, 200);
      await db.collection("bans").doc(uid).set(
        {
          uid,
          reason,
          active: true,
          bannedAt: admin.firestore.FieldValue.serverTimestamp(),
          bannedBy: req.user?.uid || null,
        },
        { merge: true }
      );
      if (typeof invalidateStatsCache === "function") {
        await invalidateStatsCache();
      }
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: "Failed to ban user" });
    }
  });

  app.post("/admin/bans/unban", authLimiter, requireAuth, async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });
      const uid = String(req.body?.uid || "").trim();
      if (!uid || !isValidUid(uid)) {
        return res.status(400).json({ error: "Invalid uid" });
      }
      await db.collection("bans").doc(uid).set(
        {
          uid,
          active: false,
          unbannedAt: admin.firestore.FieldValue.serverTimestamp(),
          unbannedBy: req.user?.uid || null,
        },
        { merge: true }
      );
      if (typeof invalidateStatsCache === "function") {
        await invalidateStatsCache();
      }
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: "Failed to unban user" });
    }
  });
}
