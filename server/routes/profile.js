export function registerProfileRoutes(app, deps) {
  const {
    admin,
    db,
    logger,
    statsLimiter,
    authLimiter,
    requireAuth,
    parseIntParam,
    isValidUid,
  } = deps;

  app.get("/player/:uid", statsLimiter, async (req, res) => {
    try {
      const { uid } = req.params;
      if (!uid || !isValidUid(uid)) {
        return res.status(400).json({ error: "Invalid uid" });
      }

      const banSnap = await db.collection("bans").doc(uid).get();
      const ban = banSnap.exists ? banSnap.data() || null : null;

      const limitRaw = parseIntParam(req.query.limit, 200);
      if (limitRaw === null) {
        return res.status(400).json({ error: "Invalid limit" });
      }
      const limit = Math.min(Math.max(limitRaw, 1), 500);

      const matchesRef = db.collection("users").doc(uid).collection("matches");
      const profileSnap = await db.collection("leaderboard_users").doc(uid).get();
      const profileData = profileSnap.exists ? profileSnap.data() : null;
      let settings = profileData?.settings || profileData?.socials || null;
      if (settings && typeof settings === "object" && !Object.keys(settings).length) {
        settings = null;
      }
      if (!settings) {
        const profileDoc = await db
          .collection("users")
          .doc(uid)
          .collection("profile")
          .doc("settings")
          .get();
        settings = profileDoc.exists ? profileDoc.data()?.settings || null : null;
      }
      if (!settings) {
        const legacyDoc = await db
          .collection("users")
          .doc(uid)
          .collection("profile")
          .doc("socials")
          .get();
        settings = legacyDoc.exists ? legacyDoc.data()?.socials || null : null;
      }
      const ranksSnap = await db
        .collection("users")
        .doc(uid)
        .collection("profile")
        .doc("ranks")
        .get();
      const ranks = ranksSnap.exists ? ranksSnap.data() || null : null;
      const snap = await matchesRef.orderBy("createdAt", "asc").limit(limit).get();

      const matches = snap.docs.map((doc, i) => ({
        index: i + 1,
        id: doc.id,
        ...doc.data(),
      }));

      return res.json({
        uid,
        matches,
        total: matches.length,
        name: profileData?.name || null,
        avatar: profileData?.avatar || null,
        provider: profileData?.provider || null,
        settings,
        ranks,
        ban,
      });
    } catch (err) {
      logger.error("PLAYER PROFILE ERROR:", err);
      return res.status(500).json({ error: "Failed to load player profile" });
    }
  });

  app.get("/profile/:uid", statsLimiter, async (req, res) => {
    try {
      const { uid } = req.params;
      if (!uid) return res.status(400).json({ error: "Missing uid" });

      const banSnap = await db.collection("bans").doc(uid).get();
      const ban = banSnap.exists ? banSnap.data() || null : null;

      const snap = await db.collection("leaderboard_users").doc(uid).get();
      const data = snap.exists ? snap.data() || {} : {};

      let settings = data.settings || data.socials || null;
      if (settings && typeof settings === "object" && !Object.keys(settings).length) {
        settings = null;
      }
      if (!settings) {
        const profileSnap = await db
          .collection("users")
          .doc(uid)
          .collection("profile")
          .doc("settings")
          .get();
        settings = profileSnap.exists ? profileSnap.data()?.settings || null : null;
      }
      if (!settings) {
        const legacySnap = await db
          .collection("users")
          .doc(uid)
          .collection("profile")
          .doc("socials")
          .get();
        settings = legacySnap.exists ? legacySnap.data()?.socials || null : null;
      }
      const ranksSnap = await db
        .collection("users")
        .doc(uid)
        .collection("profile")
        .doc("ranks")
        .get();
      const ranks = ranksSnap.exists ? ranksSnap.data() || null : null;

      return res.json({
        uid,
        settings,
        ranks,
        name: data.name || null,
        avatar: data.avatar || null,
        provider: data.provider || null,
        ban,
      });
    } catch (err) {
      logger.error("PROFILE ERROR:", err);
      return res.status(500).json({ error: "Failed to load profile" });
    }
  });

  const handleSettingsSave = async (req, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Missing auth token" });

      const settings = req.body?.settings || {};
      const allowed = ["twitch", "youtube", "tiktok"];
      const updates = {};

      for (const key of allowed) {
        const raw = typeof settings[key] === "string" ? settings[key].trim() : "";
        if (!raw) {
          updates[`settings.${key}`] = admin.firestore.FieldValue.delete();
        } else if (raw.length > 120) {
          return res.status(400).json({ error: `Invalid ${key}` });
        } else {
          updates[`settings.${key}`] = raw;
        }
      }

      await db
        .collection("leaderboard_users")
        .doc(uid)
        .set(
          {
            uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            ...updates,
          },
          { merge: true }
        );

      await db
        .collection("users")
        .doc(uid)
        .collection("profile")
        .doc("settings")
        .set({ settings }, { merge: true });

      return res.json({ ok: true });
    } catch (err) {
      logger.error("SETTINGS UPDATE ERROR:", err);
      return res.status(500).json({ error: "Failed to update settings" });
    }
  };

  app.post("/profile/settings", authLimiter, requireAuth, handleSettingsSave);

  app.post("/profile/socials", authLimiter, requireAuth, (req, res) => {
    req.body = { settings: req.body?.socials || {} };
    return handleSettingsSave(req, res);
  });
}
