import {
  normalizeUidList,
  getTeamRosterConfig,
  findActiveTeamTournamentRegistration,
} from "./helpers.js";
import { respondServerError, respondWithOutcome } from "./routeHelpers.js";
export function registerTeamInviteRoutes(app, ctx) {
  const {
    admin,
    db,
    logger,
    authLimiter,
    requireAuth,
    isValidUid,
    findUserTeamInFormat,
    invalidateTeamsCaches,
    invalidateTournamentCaches,
    userTournamentContextRef,
  } = ctx;
  const isValidUidSafe =
    typeof isValidUid === "function"
      ? isValidUid
      : (value) => typeof value === "string" && String(value || "").trim().length > 0;
  const normalizeInviteUidCandidates = (value = "") => {
    const cleanUid = String(value || "").trim();
    if (!cleanUid) return [];
    const candidates = new Set([cleanUid]);
    if (cleanUid.startsWith("discord:")) {
      const rawDiscordId = cleanUid.slice("discord:".length).trim();
      if (rawDiscordId) candidates.add(rawDiscordId);
    } else if (/^\d+$/.test(cleanUid)) {
      candidates.add(`discord:${cleanUid}`);
    }
    return [...candidates];
  };
  const resolveExistingAuthUid = async (value = "") => {
    if (!admin || typeof admin.auth !== "function") return undefined;
    const authApi = admin.auth();
    if (!authApi || typeof authApi.getUser !== "function") return undefined;
    const candidates = normalizeInviteUidCandidates(value);
    for (const candidateUid of candidates) {
      try {
        const userRecord = await authApi.getUser(candidateUid);
        const resolvedUid = String(userRecord?.uid || "").trim();
        if (resolvedUid) return resolvedUid;
      } catch (err) {
        const code = String(err?.code || "").toLowerCase();
        if (code.includes("user-not-found")) continue;
        logger.warn("TEAM INVITE AUTH UID RESOLVE ERROR:", err?.message || err);
      }
    }
    return null;
  };
  const invalidateUserTeamDerivedCaches = (uids = []) => {
    const uniq = [...new Set((uids || []).map((v) => String(v || "")).filter(Boolean))];
    if (!uniq.length) return;
    uniq.forEach((uid) => {
      if (typeof invalidateTeamsCaches === "function") invalidateTeamsCaches({ uid });
      if (typeof invalidateTournamentCaches === "function") invalidateTournamentCaches({ uid });
      if (typeof userTournamentContextRef === "function") {
        userTournamentContextRef(uid)
          .set(
            {
              uid,
              updatedAt: 0,
              "payload.truncated": true,
            },
            { merge: true }
          )
          .catch((err) => logger.warn("TEAM INVITE CONTEXT INVALIDATE ERROR:", err?.message || err));
      }
    });
  };
  const resolveInviteTargetUid = async (rawTarget = "") => {
    const cleanTarget = String(rawTarget || "").trim();
    if (!cleanTarget || !isValidUidSafe(cleanTarget)) {
      return { error: "Invalid params" };
    }
    const directProfile = await db.collection("leaderboard_users").doc(cleanTarget).get();
    if (directProfile?.exists) {
      const existingAuthUid = await resolveExistingAuthUid(cleanTarget);
      if (existingAuthUid === undefined) return { uid: cleanTarget };
      if (existingAuthUid) return { uid: existingAuthUid };
      return { error: "Player not found" };
    }
    const byNameSnap = await db
      .collection("leaderboard_users")
      .where("name", "==", cleanTarget)
      .limit(2)
      .get();
    const docs = Array.isArray(byNameSnap?.docs) ? byNameSnap.docs : [];
    if (docs.length > 1) {
      return { error: "Multiple players found with this nickname. Use UID." };
    }
    if (docs.length === 1) {
      const nicknameResolvedUid = String(docs[0].id || "").trim();
      const existingAuthUid = await resolveExistingAuthUid(nicknameResolvedUid);
      if (existingAuthUid === undefined) return { uid: nicknameResolvedUid };
      if (existingAuthUid) return { uid: existingAuthUid };
      return { error: "Player not found" };
    }
    const existingAuthUid = await resolveExistingAuthUid(cleanTarget);
    if (existingAuthUid === undefined) return { uid: cleanTarget };
    if (existingAuthUid) return { uid: existingAuthUid };
    return { error: "Player not found" };
  };
  const buildInviteUidCandidates = (uid = "") => {
    return normalizeInviteUidCandidates(uid);
  };
  const userInviteRef = (targetUid = "", teamId = "") =>
    db.collection("users").doc(String(targetUid || "")).collection("team_invites").doc(String(teamId || ""));
  app.post("/teams/:id/invite", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      const teamId = String(req.params.id || "");
      const rawTarget = String(req.body?.uid || "").trim();
      if (!uid || !teamId || !rawTarget || !isValidUidSafe(rawTarget)) {
        return res.status(400).json({ error: "Invalid params" });
      }
      const teamRef = db.collection("teams").doc(teamId);
      const teamSnap = await teamRef.get();
      if (!teamSnap.exists) return res.status(404).json({ error: "Team not found" });
      const team = teamSnap.data() || {};
      if (team.captainUid !== uid) return res.status(403).json({ error: "Only captain can invite" });
      const targetResolved = await resolveInviteTargetUid(rawTarget);
      if (!targetResolved?.uid) {
        return res.status(404).json({ error: targetResolved?.error || "Player not found" });
      }
      const targetUid = String(targetResolved.uid || "");
      if (uid === targetUid) {
        return res.status(400).json({ error: "Cannot invite yourself" });
      }
      const inviteRef = teamRef.collection("invites").doc(targetUid);
      const members = normalizeUidList(team.memberUids || []);
      const roster = getTeamRosterConfig(team);
      const maxMembers = roster.maxMembers;
      if (members.includes(targetUid)) {
        return res.status(409).json({ error: "User is already in team" });
      }
      const targetTeamSameFormat = await findUserTeamInFormat({
        uid: targetUid,
        teamFormat: roster.teamFormat,
        excludeTeamId: teamId,
      });
      if (targetTeamSameFormat) {
        return res.status(409).json({ error: "User is already in another team of this format" });
      }
      if (members.length >= maxMembers) {
        return res.status(409).json({ error: "Team is full" });
      }
      const activeRegistration = await findActiveTeamTournamentRegistration({
        db,
        admin,
        teamId,
        team,
        teamRef,
        logger,
      });
      if (activeRegistration) {
        return res.status(409).json({
          error: "Cannot change roster while team is registered in upcoming/ongoing tournament",
          tournamentId: activeRegistration.id,
          tournamentStatus: activeRegistration.status,
        });
      }

      await inviteRef.set({
        uid: targetUid,
        teamId,
        teamName: team.name || "Team",
        captainUid: uid,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await userInviteRef(targetUid, teamId).set(
        {
          uid: targetUid,
          teamId,
          teamName: team.name || "Team",
          captainUid: uid,
          status: "pending",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return res.json({ ok: true });
    } catch (err) {
      return respondServerError(res, logger, "TEAM INVITE ERROR", "Failed to invite player", err);
    }
  });

  app.get("/teams/:id/invites", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      const teamId = String(req.params.id || "");
      if (!uid || !teamId) return res.status(400).json({ error: "Invalid params" });

      const teamRef = db.collection("teams").doc(teamId);
      const teamSnap = await teamRef.get();
      if (!teamSnap.exists) return res.status(404).json({ error: "Team not found" });
      const team = teamSnap.data() || {};
      if (String(team.captainUid || "") !== String(uid || "")) {
        return res.status(403).json({ error: "Only captain can view invites" });
      }

      let inviteSnap = null;
      try {
        inviteSnap = await teamRef
          .collection("invites")
          .where("status", "==", "pending")
          .limit(100)
          .get();
      } catch (primaryErr) {
        logger.warn("TEAM LIST INVITES PRIMARY QUERY ERROR:", primaryErr?.message || primaryErr);
        inviteSnap = await teamRef.collection("invites").limit(200).get();
      }

      const rows = (inviteSnap?.docs || [])
        .map((doc) => {
          const data = doc.data() || {};
          if (String(data.status || "") !== "pending") return null;
          return {
            uid: String(data.uid || doc.id || ""),
            teamId,
            teamName: String(data.teamName || team.name || "Team"),
            captainUid: String(data.captainUid || team.captainUid || ""),
            status: "pending",
            createdAt: data.createdAt || null,
          };
        })
        .filter((row) => row && row.uid)
        .slice(0, 100);

      const profileMap = new Map();
      const inviteUids = rows.map((row) => String(row.uid || "")).filter(Boolean);
      if (inviteUids.length) {
        try {
          const refs = inviteUids.map((inviteUid) => db.collection("leaderboard_users").doc(inviteUid));
          const profileSnaps =
            typeof db.getAll === "function"
              ? await db.getAll(...refs)
              : await Promise.all(refs.map((ref) => ref.get()));
          for (let i = 0; i < profileSnaps.length; i += 1) {
            const snap = profileSnaps[i];
            const data = snap?.exists ? snap.data() || {} : {};
            profileMap.set(inviteUids[i], String(data.name || "").trim());
          }
        } catch (profileErr) {
          logger.warn("TEAM LIST INVITES PROFILE QUERY ERROR:", profileErr?.message || profileErr);
        }
      }

      const decoratedRows = rows.map((row) => ({
        ...row,
        name: profileMap.get(String(row.uid || "")) || "",
      }));

      return res.json({ rows: decoratedRows });
    } catch (err) {
      return respondServerError(res, logger, "TEAM LIST INVITES ERROR", "Failed to load invites", err);
    }
  });

  app.post("/teams/:id/invites/:uid/cancel", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      const teamId = String(req.params.id || "");
      const targetUid = String(req.params.uid || "").trim();
      if (!uid || !teamId || !targetUid || !isValidUidSafe(targetUid)) {
        return res.status(400).json({ error: "Invalid params" });
      }

      const teamRef = db.collection("teams").doc(teamId);
      const inviteRef = teamRef.collection("invites").doc(targetUid);
      const [teamSnap, inviteSnap] = await Promise.all([teamRef.get(), inviteRef.get()]);
      if (!teamSnap.exists) return res.status(404).json({ error: "Team not found" });
      const team = teamSnap.data() || {};
      if (String(team.captainUid || "") !== String(uid || "")) {
        return res.status(403).json({ error: "Only captain can cancel invites" });
      }
      if (!inviteSnap.exists) return res.status(404).json({ error: "Invite not found" });
      const invite = inviteSnap.data() || {};
      if (String(invite.status || "") !== "pending") {
        return res.status(409).json({ error: "Invite is not pending" });
      }

      await inviteRef.set(
        {
          status: "cancelled",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      await userInviteRef(targetUid, teamId).delete().catch(() => {});
      return res.json({ ok: true });
    } catch (err) {
      return respondServerError(
        res,
        logger,
        "TEAM INVITE CANCEL ERROR",
        "Failed to cancel invite",
        err
      );
    }
  });



  app.get("/teams/invites/my", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      const uidCandidates = buildInviteUidCandidates(uid);
      const rowMap = new Map();
      try {
        const inboxSnap = await db
          .collection("users")
          .doc(uid)
          .collection("team_invites")
          .where("status", "==", "pending")
          .limit(100)
          .get();
        (inboxSnap?.docs || []).forEach((doc) => {
          const data = doc.data() || {};
          const teamId = String(data.teamId || doc.id || "").trim();
          if (!teamId) return;
          const key = `${teamId}:${uid}`;
          if (rowMap.has(key)) return;
          rowMap.set(key, {
            id: key,
            teamId,
            teamName: data.teamName || "Team",
            captainUid: data.captainUid || "",
            createdAt: data.createdAt || null,
          });
        });
      } catch (inboxErr) {
        logger.warn("TEAM MY INVITES USER INBOX QUERY ERROR:", inboxErr?.message || inboxErr);
      }

      const pushRowsFromSnap = (snap, matchByDocId = false) => {
        const docs = Array.isArray(snap?.docs) ? snap.docs : [];
        docs.forEach((doc) => {
          const data = doc.data() || {};
          if (String(data.status || "") !== "pending") return;
          const inviteUid = String(data.uid || "").trim();
          const docUid = String(doc.id || "").trim();
          const isMatch =
            uidCandidates.includes(inviteUid) ||
            (matchByDocId && uidCandidates.includes(docUid));
          if (!isMatch) return;
          const teamId = String(doc.ref.parent.parent?.id || data.teamId || "").trim();
          if (!teamId) return;
          const key = `${teamId}:${uid}`;
          if (rowMap.has(key)) return;
          rowMap.set(key, {
            id: key,
            teamId,
            teamName: data.teamName || "Team",
            captainUid: data.captainUid || "",
            createdAt: data.createdAt || null,
          });
        });
      };

      for (const candidateUid of uidCandidates) {
        try {
          const primarySnap = await db
            .collectionGroup("invites")
            .where("uid", "==", candidateUid)
            .where("status", "==", "pending")
            .limit(50)
            .get();
          pushRowsFromSnap(primarySnap);
        } catch (primaryErr) {
          logger.warn("TEAM MY INVITES PRIMARY QUERY ERROR:", primaryErr?.message || primaryErr);
          try {
            const fallbackSnap = await db
              .collectionGroup("invites")
              .where("uid", "==", candidateUid)
              .limit(200)
              .get();
            pushRowsFromSnap(fallbackSnap);
          } catch (fallbackErr) {
            logger.warn("TEAM MY INVITES FALLBACK QUERY ERROR:", fallbackErr?.message || fallbackErr);
          }
        }
      }

      if (!rowMap.size) {
        try {
          const broadSnap = await db
            .collectionGroup("invites")
            .where("status", "==", "pending")
            .limit(300)
            .get();
          pushRowsFromSnap(broadSnap, true);
        } catch (broadErr) {
          logger.warn("TEAM MY INVITES BROAD QUERY ERROR:", broadErr?.message || broadErr);
        }
      }

      const rows = [...rowMap.values()].slice(0, 50);
      const teamIds = [...new Set(rows.map((row) => String(row.teamId || "")).filter(Boolean))];
      const teamMap = new Map();
      if (teamIds.length) {
        try {
          const teamRefs = teamIds.map((teamId) => db.collection("teams").doc(teamId));
          const teamSnaps =
            typeof db.getAll === "function"
              ? await db.getAll(...teamRefs)
              : await Promise.all(teamRefs.map((ref) => ref.get()));
          for (let i = 0; i < teamSnaps.length; i += 1) {
            const snap = teamSnaps[i];
            const data = snap?.exists ? snap.data() || {} : {};
            teamMap.set(teamIds[i], {
              name: String(data.name || "").trim(),
              avatarUrl: String(data.avatarUrl || "").trim(),
              captainUid: String(data.captainUid || "").trim(),
            });
          }
        } catch (teamReadErr) {
          logger.warn("TEAM MY INVITES TEAM DETAILS QUERY ERROR:", teamReadErr?.message || teamReadErr);
        }
      }
      const captainUids = [
        ...new Set(
          rows
            .map((row) => {
              const teamData = teamMap.get(String(row.teamId || "")) || {};
              return String(teamData.captainUid || row.captainUid || "").trim();
            })
            .filter(Boolean)
        ),
      ];
      const captainNameMap = new Map();
      if (captainUids.length) {
        try {
          const captainRefs = captainUids.map((captainUid) =>
            db.collection("leaderboard_users").doc(captainUid)
          );
          const captainSnaps =
            typeof db.getAll === "function"
              ? await db.getAll(...captainRefs)
              : await Promise.all(captainRefs.map((ref) => ref.get()));
          for (let i = 0; i < captainSnaps.length; i += 1) {
            const snap = captainSnaps[i];
            const data = snap?.exists ? snap.data() || {} : {};
            captainNameMap.set(captainUids[i], String(data.name || "").trim());
          }
        } catch (captainErr) {
          logger.warn("TEAM MY INVITES CAPTAIN PROFILES QUERY ERROR:", captainErr?.message || captainErr);
        }
      }

      const decoratedRows = rows.map((row) => {
        const teamData = teamMap.get(String(row.teamId || "")) || {};
        const captainUid = String(teamData.captainUid || row.captainUid || "").trim();
        return {
          ...row,
          teamName: teamData.name || row.teamName || "Team",
          teamAvatarUrl: teamData.avatarUrl || "",
          captainUid,
          captainName: captainNameMap.get(captainUid) || "",
        };
      });

      return res.json({ rows: decoratedRows });
    } catch (err) {
      return respondServerError(res, logger, "TEAM MY INVITES ERROR", "Failed to load invites", err);
    }
  });

  app.post("/teams/:id/invites/:uid/accept", authLimiter, requireAuth, async (req, res) => {
    try {
      const teamId = String(req.params.id || "");
      const targetUid = String(req.params.uid || "");
      const uid = req.user?.uid;
      if (!teamId || !targetUid || uid !== targetUid || !isValidUidSafe(targetUid)) {
        return res.status(400).json({ error: "Invalid params" });
      }
      const teamRef = db.collection("teams").doc(teamId);
      const inviteRef = teamRef.collection("invites").doc(uid);

      const outcome = await db.runTransaction(async (tx) => {
        const [teamSnap, inviteSnap] = await Promise.all([tx.get(teamRef), tx.get(inviteRef)]);
        if (!teamSnap.exists) return { status: 404, error: "Team not found" };
        if (!inviteSnap.exists) return { status: 404, error: "Invite not found" };
        const activeRegistrationInTx = await findActiveTeamTournamentRegistration({
          db,
          admin,
          teamId,
          team: teamSnap.data() || {},
          teamRef,
          tx,
          logger,
        });
        if (activeRegistrationInTx) {
          return {
            status: 409,
            error: "Cannot join team while it is registered in upcoming/ongoing tournament",
          };
        }
        const invite = inviteSnap.data() || {};
        if (invite.status !== "pending") return { status: 409, error: "Invite is not pending" };

        const team = teamSnap.data() || {};
        const members = normalizeUidList(team.memberUids || []);
        const roster = getTeamRosterConfig(team);
        const maxMembers = roster.maxMembers;
        if (!members.includes(uid) && members.length >= maxMembers) {
          return { status: 409, error: "Team is full" };
        }
        const sameFormatConflict = await findUserTeamInFormat({
          uid,
          teamFormat: roster.teamFormat,
          excludeTeamId: teamId,
          tx,
        });
        if (sameFormatConflict) {
          return { status: 409, error: "You are already in another team of this format" };
        }

        tx.set(
          teamRef,
          {
            memberUids: members.includes(uid) ? members : [...members, uid],
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        tx.set(inviteRef, { status: "accepted" }, { merge: true });
        tx.delete(userInviteRef(uid, teamId));
        return {
          ok: true,
          memberUids: members.includes(uid) ? members : [...members, uid],
          activeTournamentIds: normalizeUidList(team.activeTournamentIds || []),
        };
      });
      if (outcome?.ok && typeof userTournamentContextRef === "function") {
        const activeTournamentIds = normalizeUidList(outcome.activeTournamentIds || []);
        const canUnion = typeof admin?.firestore?.FieldValue?.arrayUnion === "function";
        if (activeTournamentIds.length && canUnion) {
          const unionOp = admin.firestore.FieldValue.arrayUnion(...activeTournamentIds);
          try {
            await userTournamentContextRef(uid).set(
              {
                uid,
                tournamentIds: unionOp,
                "payload.tournamentIds": unionOp,
                updatedAt: Date.now(),
              },
              { merge: true }
            );
          } catch (err) {
            logger.warn("TEAM INVITE CONTEXT UPSERT ERROR:", err?.message || err);
          }
        }
      }
      if (outcome?.ok) invalidateUserTeamDerivedCaches(outcome.memberUids || [uid]);
      return respondWithOutcome(res, outcome);
    } catch (err) {
      return respondServerError(
        res,
        logger,
        "TEAM INVITE ACCEPT ERROR",
        "Failed to accept invite",
        err
      );
    }
  });

  app.post("/teams/:id/invites/:uid/reject", authLimiter, requireAuth, async (req, res) => {
    try {
      const teamId = String(req.params.id || "");
      const targetUid = String(req.params.uid || "");
      const uid = req.user?.uid;
      if (!teamId || !targetUid || uid !== targetUid || !isValidUidSafe(targetUid)) {
        return res.status(400).json({ error: "Invalid params" });
      }
      const teamRef = db.collection("teams").doc(teamId);
      const inviteRef = teamRef.collection("invites").doc(uid);
      const [teamSnap, inviteSnap] = await Promise.all([teamRef.get(), inviteRef.get()]);
      if (!teamSnap.exists) return res.status(404).json({ error: "Team not found" });
      if (!inviteSnap.exists) return res.status(404).json({ error: "Invite not found" });
      const invite = inviteSnap.data() || {};
      if (String(invite.status || "") !== "pending") {
        return res.status(409).json({ error: "Invite is not pending" });
      }

      await inviteRef.set({ status: "rejected" }, { merge: true });
      await userInviteRef(uid, teamId).delete().catch(() => {});
      return res.json({ ok: true });
    } catch (err) {
      return respondServerError(res, logger, "TEAM INVITE REJECT ERROR", "Failed to reject invite", err);
    }
  });
}
