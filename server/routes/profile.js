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

  app.get("/share/player/:uid", statsLimiter, async (req, res) => {
    try {
      const { uid } = req.params;
      if (!uid || !isValidUid(uid)) {
        return res.status(400).send("Invalid uid");
      }

      const profileSnap = await db.collection("leaderboard_users").doc(uid).get();
      const profileData = profileSnap.exists ? profileSnap.data() : null;
      const name = profileData?.name || uid;
      const provider = profileData?.provider || null;
      const avatar = profileData?.avatar || null;
      const matches = Number.isFinite(profileData?.matches)
        ? profileData.matches
        : null;
      const winrate = Number.isFinite(profileData?.winrate)
        ? profileData.winrate
        : null;

      let avatarUrl = null;
      if (provider === "discord" && uid.startsWith("discord:")) {
        const discordId = uid.replace("discord:", "");
        if (avatar) {
          avatarUrl = `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png?size=512`;
        } else if (discordId) {
          const fallbackIndex = Number.parseInt(discordId, 10) % 5;
          avatarUrl = `https://cdn.discordapp.com/embed/avatars/${fallbackIndex}.png`;
        }
      }
      if (!avatarUrl) {
        avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
      }

      const siteUrlRaw =
        process.env.PUBLIC_SITE_URL ||
        process.env.SITE_URL ||
        process.env.WEB_URL ||
        "";
      const siteUrl = siteUrlRaw.replace(/\/+$/, "");
      const profileUrl = siteUrl ? `${siteUrl}/player/${encodeURIComponent(uid)}` : "";

      const escapeHtml = (val) =>
        String(val)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

      const title = `FragPunk Tracker — ${name}`;
      const lang = String(req.query.lang || "").toLowerCase();
      const isEn = lang === "en";
      const isFr = lang === "fr";
      const isDe = lang === "de";
      const labelMatches = isEn ? "Matches" : isFr ? "Matchs" : isDe ? "Matches" : "Матчей";
      const labelWinrate = isEn ? "Winrate" : isFr ? "Taux de victoire" : isDe ? "Winrate" : "Винрейт";
      const statsParts = [];
      if (matches !== null) {
        statsParts.push(`${labelMatches}: ${matches}`);
      }
      if (winrate !== null) {
        statsParts.push(`${labelWinrate}: ${winrate}%`);
      }
      const statsLine = statsParts.length ? ` ${statsParts.join(" • ")}` : "";
      const description = isEn
        ? `Player profile ${name} on FragPunk Tracker.${statsLine}`
        : isFr
        ? `Profil du joueur ${name} sur FragPunk Tracker.${statsLine}`
        : isDe
        ? `Spielerprofil ${name} auf FragPunk Tracker.${statsLine}`
        : `Профиль игрока ${name} на FragPunk Tracker.${statsLine}`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(`<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="profile" />
    <meta property="og:image" content="${escapeHtml(avatarUrl)}" />
    <meta property="og:image:width" content="512" />
    <meta property="og:image:height" content="512" />
    ${profileUrl ? `<meta property="og:url" content="${escapeHtml(profileUrl)}" />` : ""}
    ${profileUrl ? `<meta http-equiv="refresh" content="0; url=${escapeHtml(profileUrl)}" />` : ""}
  </head>
  <body>
    ${profileUrl ? `<a href="${escapeHtml(profileUrl)}">Открыть профиль</a>` : "Profile"}
  </body>
</html>`);
    } catch (err) {
      logger.error("SHARE PROFILE ERROR:", err);
      return res.status(500).send("Failed to build share preview");
    }
  });

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
      const friendsSnap = await db
        .collection("users")
        .doc(uid)
        .collection("friends")
        .orderBy("createdAt", "asc")
        .limit(10)
        .get();
      const friendDates = friendsSnap.docs
        .map((doc) => {
          const raw = doc.data()?.createdAt || null;
          return raw?.toMillis ? raw.toMillis() : null;
        })
        .filter(Boolean);

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
        friendCount: friendsSnap.size,
        friendDates,
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
