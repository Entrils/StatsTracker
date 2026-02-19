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
  app.post("/teams/:id/invite", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      const teamId = String(req.params.id || "");
      const targetUid = String(req.body?.uid || "").trim();
      if (!uid || !teamId || !targetUid || !isValidUid(targetUid)) {
        return res.status(400).json({ error: "Invalid params" });
      }
      if (uid === targetUid) {
        return res.status(400).json({ error: "Cannot invite yourself" });
      }

      const teamRef = db.collection("teams").doc(teamId);
      const inviteRef = teamRef.collection("invites").doc(targetUid);
      const teamSnap = await teamRef.get();
      if (!teamSnap.exists) return res.status(404).json({ error: "Team not found" });
      const team = teamSnap.data() || {};
      if (team.captainUid !== uid) return res.status(403).json({ error: "Only captain can invite" });
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
      return res.json({ ok: true });
    } catch (err) {
      return respondServerError(res, logger, "TEAM INVITE ERROR", "Failed to invite player", err);
    }
  });



  app.get("/teams/invites/my", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      let snap = null;
      try {
        snap = await db
          .collectionGroup("invites")
          .where("uid", "==", uid)
          .where("status", "==", "pending")
          .limit(50)
          .get();
      } catch {
        // Fallback for environments without composite index support.
        snap = await db
          .collectionGroup("invites")
          .where("uid", "==", uid)
          .limit(200)
          .get();
      }

      const rows = snap.docs
        .map((doc) => {
          const data = doc.data() || {};
          if (String(data.status || "") !== "pending") return null;
          const teamId = doc.ref.parent.parent?.id || data.teamId || "";
          return {
            id: `${teamId}:${uid}`,
            teamId,
            teamName: data.teamName || "Team",
            captainUid: data.captainUid || "",
            createdAt: data.createdAt || null,
          };
        })
        .filter(Boolean)
        .slice(0, 50);
      return res.json({ rows });
    } catch (err) {
      return respondServerError(res, logger, "TEAM MY INVITES ERROR", "Failed to load invites", err);
    }
  });

  app.post("/teams/:id/invites/:uid/accept", authLimiter, requireAuth, async (req, res) => {
    try {
      const teamId = String(req.params.id || "");
      const targetUid = String(req.params.uid || "");
      const uid = req.user?.uid;
      if (!teamId || !targetUid || uid !== targetUid) {
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
      if (!teamId || !targetUid || uid !== targetUid) {
        return res.status(400).json({ error: "Invalid params" });
      }
      await db
        .collection("teams")
        .doc(teamId)
        .collection("invites")
        .doc(uid)
        .set({ status: "rejected" }, { merge: true });
      return res.json({ ok: true });
    } catch (err) {
      return respondServerError(res, logger, "TEAM INVITE REJECT ERROR", "Failed to reject invite", err);
    }
  });
}
