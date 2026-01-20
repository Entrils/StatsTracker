function toNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

function buildStatsFromProfile(profile) {
  const matches = toNumber(profile?.matches, 0);
  const score = toNumber(profile?.score, 0);
  const kills = toNumber(profile?.kills, 0);
  const deaths = toNumber(profile?.deaths, 0);
  const assists = toNumber(profile?.assists, 0);
  const damage = toNumber(profile?.damage, 0);
  const damageShare = toNumber(profile?.damageShare, 0);
  const wins = toNumber(profile?.wins, 0);
  const losses = toNumber(profile?.losses, 0);

  return {
    matches,
    wins,
    losses,
    score,
    kills,
    deaths,
    assists,
    damage,
    damageShare,
    avgScore: matches ? score / matches : 0,
    avgKills: matches ? kills / matches : 0,
    avgDeaths: matches ? deaths / matches : 0,
    avgAssists: matches ? assists / matches : 0,
    avgDamage: matches ? damage / matches : 0,
    avgDamageShare: matches ? damageShare / matches : 0,
    kda: (kills + assists) / Math.max(1, deaths),
    winrate: (wins / Math.max(1, wins + losses)) * 100 || 0,
  };
}

export function registerFriendsRoutes(app, deps) {
  const { admin, db, logger, requireAuth, authLimiter, statsLimiter, isValidUid } =
    deps;

  const friendsRef = (uid) => db.collection("users").doc(uid).collection("friends");
  const incomingRef = (uid) =>
    db.collection("users").doc(uid).collection("friend_requests");
  const outgoingRef = (uid) =>
    db.collection("users").doc(uid).collection("friend_outgoing");

  app.get("/friends/status/:uid", statsLimiter, requireAuth, async (req, res) => {
    try {
      const targetUid = req.params.uid;
      const uid = req.user?.uid;
      if (!uid || !targetUid || !isValidUid(targetUid)) {
        return res.status(400).json({ error: "Invalid uid" });
      }
      if (uid === targetUid) return res.json({ status: "self" });

      const [friendSnap, outgoingSnap, incomingSnap] = await Promise.all([
        friendsRef(uid).doc(targetUid).get(),
        outgoingRef(uid).doc(targetUid).get(),
        incomingRef(uid).doc(targetUid).get(),
      ]);

      if (friendSnap.exists) return res.json({ status: "friend" });
      if (outgoingSnap.exists) return res.json({ status: "outgoing" });
      if (incomingSnap.exists) return res.json({ status: "incoming" });
      return res.json({ status: "none" });
    } catch (err) {
      logger.error("FRIENDS STATUS ERROR:", err);
      return res.status(500).json({ error: "Failed to load status" });
    }
  });

  app.post("/friends/request", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      const targetUid = req.body?.uid;
      if (!uid || !targetUid || !isValidUid(targetUid)) {
        return res.status(400).json({ error: "Invalid uid" });
      }
      if (uid === targetUid) {
        return res.status(400).json({ error: "Cannot add yourself" });
      }

      const [friendSnap, outgoingSnap] = await Promise.all([
        friendsRef(uid).doc(targetUid).get(),
        outgoingRef(uid).doc(targetUid).get(),
      ]);
      if (friendSnap.exists) return res.json({ status: "friend" });
      if (outgoingSnap.exists) return res.json({ status: "outgoing" });

      const createdAt = admin.firestore.FieldValue.serverTimestamp();
      await Promise.all([
        incomingRef(targetUid).doc(uid).set({ uid, createdAt }),
        outgoingRef(uid).doc(targetUid).set({ uid: targetUid, createdAt }),
      ]);

      return res.json({ status: "outgoing" });
    } catch (err) {
      logger.error("FRIENDS REQUEST ERROR:", err);
      return res.status(500).json({ error: "Failed to send request" });
    }
  });

  app.post("/friends/accept", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      const requesterUid = req.body?.uid;
      if (!uid || !requesterUid || !isValidUid(requesterUid)) {
        return res.status(400).json({ error: "Invalid uid" });
      }

      const requestSnap = await incomingRef(uid).doc(requesterUid).get();
      if (!requestSnap.exists) {
        return res.status(404).json({ error: "Request not found" });
      }

      const createdAt = admin.firestore.FieldValue.serverTimestamp();
      const batch = db.batch();
      batch.set(friendsRef(uid).doc(requesterUid), { uid: requesterUid, createdAt });
      batch.set(friendsRef(requesterUid).doc(uid), { uid, createdAt });
      batch.delete(incomingRef(uid).doc(requesterUid));
      batch.delete(outgoingRef(requesterUid).doc(uid));
      await batch.commit();

      return res.json({ status: "friend" });
    } catch (err) {
      logger.error("FRIENDS ACCEPT ERROR:", err);
      return res.status(500).json({ error: "Failed to accept request" });
    }
  });

  app.post("/friends/reject", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      const requesterUid = req.body?.uid;
      if (!uid || !requesterUid || !isValidUid(requesterUid)) {
        return res.status(400).json({ error: "Invalid uid" });
      }

      const batch = db.batch();
      batch.delete(incomingRef(uid).doc(requesterUid));
      batch.delete(outgoingRef(requesterUid).doc(uid));
      await batch.commit();

      return res.json({ status: "rejected" });
    } catch (err) {
      logger.error("FRIENDS REJECT ERROR:", err);
      return res.status(500).json({ error: "Failed to reject request" });
    }
  });

  app.post("/friends/remove", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      const targetUid = req.body?.uid;
      if (!uid || !targetUid || !isValidUid(targetUid)) {
        return res.status(400).json({ error: "Invalid uid" });
      }

      const batch = db.batch();
      batch.delete(friendsRef(uid).doc(targetUid));
      batch.delete(friendsRef(targetUid).doc(uid));
      await batch.commit();

      return res.json({ status: "removed" });
    } catch (err) {
      logger.error("FRIENDS REMOVE ERROR:", err);
      return res.status(500).json({ error: "Failed to remove friend" });
    }
  });

  app.post("/friends/cancel", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      const targetUid = req.body?.uid;
      if (!uid || !targetUid || !isValidUid(targetUid)) {
        return res.status(400).json({ error: "Invalid uid" });
      }

      const batch = db.batch();
      batch.delete(outgoingRef(uid).doc(targetUid));
      batch.delete(incomingRef(targetUid).doc(uid));
      await batch.commit();

      return res.json({ status: "cancelled" });
    } catch (err) {
      logger.error("FRIENDS CANCEL ERROR:", err);
      return res.status(500).json({ error: "Failed to cancel request" });
    }
  });

  app.get("/friends/list", statsLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Missing auth token" });

      const friendsSnap = await friendsRef(uid).limit(200).get();
      const ids = friendsSnap.docs.map((d) => d.id).filter(Boolean);
      const createdAtMap = new Map(
        friendsSnap.docs.map((d) => {
          const raw = d.data()?.createdAt || null;
          const ms = raw?.toMillis ? raw.toMillis() : null;
          return [d.id, ms];
        })
      );
      if (!ids.length) return res.json({ rows: [] });

      const profileRefs = ids.map((id) => db.collection("leaderboard_users").doc(id));
      const rankRefs = ids.map((id) =>
        db.collection("users").doc(id).collection("profile").doc("ranks")
      );

      const [profileSnaps, rankSnaps, last5Snaps, settingsSnaps, legacySnaps] =
        await Promise.all([
        db.getAll(...profileRefs),
        db.getAll(...rankRefs),
        Promise.all(
          ids.map((id) =>
            db
              .collection("users")
              .doc(id)
              .collection("matches")
              .orderBy("createdAt", "desc")
              .limit(5)
              .get()
          )
        ),
        db.getAll(
          ...ids.map((id) =>
            db.collection("users").doc(id).collection("profile").doc("settings")
          )
        ),
        db.getAll(
          ...ids.map((id) =>
            db.collection("users").doc(id).collection("profile").doc("socials")
          )
        ),
      ]);

      const rows = ids.map((id, i) => {
        const profile = profileSnaps[i]?.data() || {};
        const ranks = rankSnaps[i]?.exists ? rankSnaps[i].data() || null : null;
        const settingsData = settingsSnaps[i]?.exists
          ? settingsSnaps[i].data() || {}
          : {};
        const legacyData = legacySnaps[i]?.exists ? legacySnaps[i].data() || {} : {};
        const settings =
          profile.settings ||
          settingsData.settings ||
          settingsData.socials ||
          legacyData.settings ||
          legacyData.socials ||
          null;
        const last5 = last5Snaps[i]?.docs?.map((doc) => {
          const r = doc.data()?.result;
          if (r === "victory") return "W";
          if (r === "defeat") return "L";
          return "-";
        }) || [];
        const stats = buildStatsFromProfile(profile);
        return {
          uid: id,
          name: profile.name || id,
          avatar: profile.avatar || null,
          provider: profile.provider || null,
          settings,
          ranks,
          last5,
          createdAt: createdAtMap.get(id) || null,
          ...stats,
        };
      });

      return res.json({ rows });
    } catch (err) {
      logger.error("FRIENDS LIST ERROR:", err);
      return res.status(500).json({ error: "Failed to load friends" });
    }
  });

  app.get("/friends/requests", statsLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Missing auth token" });

      const snap = await incomingRef(uid).limit(100).get();
      const ids = snap.docs.map((d) => d.id).filter(Boolean);
      if (!ids.length) return res.json({ rows: [] });

      const profileRefs = ids.map((id) => db.collection("leaderboard_users").doc(id));
      const rankRefs = ids.map((id) =>
        db.collection("users").doc(id).collection("profile").doc("ranks")
      );
      const [profileSnaps, rankSnaps] = await Promise.all([
        db.getAll(...profileRefs),
        db.getAll(...rankRefs),
      ]);

      const rows = ids.map((id, i) => {
        const profile = profileSnaps[i]?.data() || {};
        const ranks = rankSnaps[i]?.exists ? rankSnaps[i].data() || null : null;
        return {
          uid: id,
          name: profile.name || id,
          avatar: profile.avatar || null,
          provider: profile.provider || null,
          ranks,
        };
      });

      return res.json({ rows });
    } catch (err) {
      logger.error("FRIENDS REQUESTS ERROR:", err);
      return res.status(500).json({ error: "Failed to load requests" });
    }
  });

  app.get("/friends/outgoing", statsLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Missing auth token" });

      const snap = await outgoingRef(uid).limit(100).get();
      const ids = snap.docs.map((d) => d.id).filter(Boolean);
      if (!ids.length) return res.json({ rows: [] });

      const profileRefs = ids.map((id) => db.collection("leaderboard_users").doc(id));
      const rankRefs = ids.map((id) =>
        db.collection("users").doc(id).collection("profile").doc("ranks")
      );
      const [profileSnaps, rankSnaps] = await Promise.all([
        db.getAll(...profileRefs),
        db.getAll(...rankRefs),
      ]);

      const rows = ids.map((id, i) => {
        const profile = profileSnaps[i]?.data() || {};
        const ranks = rankSnaps[i]?.exists ? rankSnaps[i].data() || null : null;
        return {
          uid: id,
          name: profile.name || id,
          avatar: profile.avatar || null,
          provider: profile.provider || null,
          ranks,
        };
      });

      return res.json({ rows });
    } catch (err) {
      logger.error("FRIENDS OUTGOING ERROR:", err);
      return res.status(500).json({ error: "Failed to load outgoing" });
    }
  });
}
