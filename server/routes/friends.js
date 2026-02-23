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
  const FRIEND_MILESTONE_THRESHOLDS = [1, 3, 5, 10];
  const getAllDocs = async (refs = []) => {
    if (!Array.isArray(refs) || refs.length === 0) return [];
    return typeof db.getAll === "function"
      ? db.getAll(...refs)
      : Promise.all(refs.map((ref) => ref.get()));
  };
  const toMillis = (raw) => {
    if (!raw) return null;
    if (typeof raw?.toMillis === "function") return raw.toMillis();
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw?.seconds === "number") return raw.seconds * 1000;
    return null;
  };
  const incrementValue = (delta) =>
    typeof admin?.firestore?.FieldValue?.increment === "function"
      ? admin.firestore.FieldValue.increment(delta)
      : delta;

  const friendsRef = (uid) => db.collection("users").doc(uid).collection("friends");
  const friendsMetaRef = (uid) =>
    db.collection("users").doc(uid).collection("profile").doc("friends_meta");
  const incomingRef = (uid) =>
    db.collection("users").doc(uid).collection("friend_requests");
  const outgoingRef = (uid) =>
    db.collection("users").doc(uid).collection("friend_outgoing");
  const buildMilestoneDates = (datesAsc = []) => {
    const out = {};
    FRIEND_MILESTONE_THRESHOLDS.forEach((threshold) => {
      const ts = datesAsc[threshold - 1];
      if (typeof ts === "number" && Number.isFinite(ts)) {
        out[String(threshold)] = ts;
      }
    });
    return out;
  };
  const countFriends = async (uid) => {
    const collectionRef = friendsRef(uid);
    if (typeof collectionRef.count === "function") {
      const countSnap = await collectionRef.count().get();
      const countValue = Number(countSnap?.data?.()?.count);
      return Number.isFinite(countValue) ? countValue : 0;
    }
    if (typeof collectionRef.orderBy === "function") {
      let total = 0;
      let lastDoc = null;
      while (true) {
        let q = collectionRef.orderBy("__name__").limit(500);
        if (lastDoc && typeof q.startAfter === "function") {
          q = q.startAfter(lastDoc);
        }
        const snap = await q.get();
        const docs = Array.isArray(snap?.docs) ? snap.docs : [];
        if (!docs.length) break;
        total += docs.length;
        if (docs.length < 500) break;
        lastDoc = docs[docs.length - 1];
      }
      return total;
    }
    const snap = await collectionRef.get();
    if (typeof snap?.size === "number") return snap.size;
    return Array.isArray(snap?.docs) ? snap.docs.length : 0;
  };
  const refreshFriendsMeta = async (uid) => {
    const safeUid = String(uid || "").trim();
    if (!safeUid) return { count: 0, latestFriendAt: null, milestoneDates: {} };
    const [count, firstTenSnap, latestSnap] = await Promise.all([
      countFriends(safeUid),
      friendsRef(safeUid).orderBy("createdAt", "asc").limit(10).get(),
      friendsRef(safeUid).orderBy("createdAt", "desc").limit(1).get(),
    ]);
    const firstTenDates = (Array.isArray(firstTenSnap?.docs) ? firstTenSnap.docs : [])
      .map((doc) => toMillis(doc.data()?.createdAt))
      .filter(Boolean);
    const latestFriendAt = toMillis(
      Array.isArray(latestSnap?.docs) && latestSnap.docs[0]
        ? latestSnap.docs[0].data()?.createdAt
        : null
    );
    const payload = {
      count: Number.isFinite(Number(count)) ? Number(count) : 0,
      latestFriendAt,
      milestoneDates: buildMilestoneDates(firstTenDates),
      updatedAt: Date.now(),
    };
    await friendsMetaRef(safeUid).set(payload, { merge: true });
    return payload;
  };

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
      batch.set(
        db.collection("leaderboard_users").doc(uid),
        { friendCount: incrementValue(1) },
        { merge: true }
      );
      batch.set(
        db.collection("leaderboard_users").doc(requesterUid),
        { friendCount: incrementValue(1) },
        { merge: true }
      );
      batch.delete(incomingRef(uid).doc(requesterUid));
      batch.delete(outgoingRef(requesterUid).doc(uid));
      await batch.commit();
      await Promise.allSettled([refreshFriendsMeta(uid), refreshFriendsMeta(requesterUid)]);

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
      batch.set(
        db.collection("leaderboard_users").doc(uid),
        { friendCount: incrementValue(-1) },
        { merge: true }
      );
      batch.set(
        db.collection("leaderboard_users").doc(targetUid),
        { friendCount: incrementValue(-1) },
        { merge: true }
      );
      await batch.commit();
      await Promise.allSettled([refreshFriendsMeta(uid), refreshFriendsMeta(targetUid)]);

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
      const viewRaw = String(req.query.view || "full").trim().toLowerCase();
      const view = ["full", "compact", "minimal"].includes(viewRaw) ? viewRaw : "full";

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

      if (view === "minimal") {
        const rows = ids.map((id) => ({
          uid: id,
          createdAt: createdAtMap.get(id) || null,
        }));
        return res.json({ rows });
      }

      const profileRefs = ids.map((id) => db.collection("leaderboard_users").doc(id));
      const profileSnaps = await getAllDocs(profileRefs);
      if (view === "compact") {
        const rows = ids.map((id, i) => {
          const profile = profileSnaps[i]?.data() || {};
          const stats = buildStatsFromProfile(profile);
          return {
            uid: id,
            name: profile.name || id,
            avatar: profile.avatar || null,
            provider: profile.provider || null,
            matches: toNumber(profile.matches, 0),
            avgScore: toNumber(stats.avgScore, 0),
            avgKills: toNumber(stats.avgKills, 0),
            avgDeaths: toNumber(stats.avgDeaths, 0),
            avgAssists: toNumber(stats.avgAssists, 0),
            avgDamage: toNumber(stats.avgDamage, 0),
            kda: toNumber(stats.kda, 0),
            winrate: toNumber(stats.winrate, 0),
            createdAt: createdAtMap.get(id) || null,
          };
        });
        return res.json({ rows });
      }

      const rankRefs = ids.map((id) =>
        db.collection("users").doc(id).collection("profile").doc("ranks")
      );
      const [rankSnaps, last5Snaps] = await Promise.all([
        getAllDocs(rankRefs),
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
      ]);

      const rows = ids.map((id, i) => {
        const profile = profileSnaps[i]?.data() || {};
        const ranks = rankSnaps[i]?.exists ? rankSnaps[i].data() || null : null;
        const settings = profile.settings || null;
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

  app.get("/friends/meta", statsLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Missing auth token" });
      const snap = await friendsMetaRef(uid).get();
      let payload = snap.exists ? snap.data() || {} : null;
      const hasCount = Number.isFinite(Number(payload?.count));
      if (!payload || !hasCount) {
        payload = await refreshFriendsMeta(uid);
      }
      const count = Number.isFinite(Number(payload?.count)) ? Number(payload.count) : 0;
      const latestFriendAt = toMillis(payload?.latestFriendAt);
      const milestoneDates =
        payload?.milestoneDates && typeof payload.milestoneDates === "object"
          ? payload.milestoneDates
          : {};
      return res.json({
        count,
        friendCount: count,
        latestFriendAt,
        milestoneDates,
      });
    } catch (err) {
      logger.error("FRIENDS META ERROR:", err);
      return res.status(500).json({ error: "Failed to load friends meta" });
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
        getAllDocs(profileRefs),
        getAllDocs(rankRefs),
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
      return res.json({ rows: [] });
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
        getAllDocs(profileRefs),
        getAllDocs(rankRefs),
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
