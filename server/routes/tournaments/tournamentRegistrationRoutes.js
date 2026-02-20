import {
  toInt,
  teamSizeByFormat,
  normalizeUidList,
  normalizeTeamCountry,
  getTeamRosterConfig,
  resolveProfileAvatarUrl,
  getProfileFragpunkId,
  getTournamentStatus,
} from "./helpers.js";
import { respondServerError, respondWithOutcome } from "./routeHelpers.js";
export function registerTournamentRegistrationRoutes(app, ctx) {
  const {
    admin,
    db,
    logger,
    authLimiter,
    requireAuth,
    findUserTeamInFormat,
    invalidateTournamentCaches,
    invalidateTeamsCaches,
    userTournamentContextRef,
    clearTournamentPublicView,
  } = ctx;
  app.post("/tournaments/:id/register-team", authLimiter, requireAuth, async (req, res) => {
    try {
      const tournamentId = String(req.params.id || "");
      const uid = req.user?.uid;
      if (!tournamentId || !uid) {
        return res.status(400).json({ error: "Tournament id is required" });
      }
      const tournamentRef = db.collection("tournaments").doc(tournamentId);

      const outcome = await db.runTransaction(async (tx) => {
        const tournamentSnap = await tx.get(tournamentRef);

        if (!tournamentSnap.exists) return { status: 404, error: "Tournament not found" };
        const tournament = tournamentSnap.data() || {};
        const status = getTournamentStatus(tournament, Date.now());
        if (status !== "upcoming") return { status: 409, error: "Registration is closed" };
        const maxTeams = toInt(tournament.maxTeams, 0);
        const registeredTeams = toInt(tournament.registeredTeams, 0);
        if (registeredTeams >= maxTeams) return { status: 409, error: "Tournament is full" };

        const isSolo = String(tournament.teamFormat || "") === "1x1";
        if (isSolo) {
          const registrationRef = tournamentRef.collection("registrations").doc(uid);
          const regSnap = await tx.get(registrationRef);
          if (regSnap.exists) return { ok: true, alreadyRegistered: true };

          const duplicateSnap = await tx.get(
            tournamentRef.collection("registrations").where("memberUids", "array-contains", uid).limit(1)
          );
          if (!duplicateSnap.empty) {
            return { status: 409, error: "Player already registered" };
          }

          const profileSnap = await tx.get(db.collection("leaderboard_users").doc(uid));
          const p = profileSnap.exists ? profileSnap.data() || {} : {};
          const elo = toInt(p.hiddenElo ?? p.elo, 500);
          const matches = toInt(p.matches, 0);
          const fragpunkId = getProfileFragpunkId(p);
          if (!fragpunkId) {
            return { status: 409, error: "FragPunk ID is required. Set it in profile settings." };
          }
          const reqMinElo = toInt(tournament?.requirements?.minElo, 0);
          const reqMinMatches = toInt(tournament?.requirements?.minMatches, 0);
          if (elo < reqMinElo || matches < reqMinMatches) {
            return { status: 409, error: "Requirements not met" };
          }

          tx.set(registrationRef, {
            teamId: uid,
            teamName: p.name || "Player",
            avatarUrl: resolveProfileAvatarUrl(p, uid),
            captainUid: uid,
            memberUids: [uid],
            membersSnapshot: [
              {
                uid,
                name: String(p.name || uid || "Player"),
                avatarUrl: resolveProfileAvatarUrl(p, uid),
                fragpunkId,
                elo,
              },
            ],
            fragpunkIdSnapshot: fragpunkId,
            avgEloSnapshot: elo,
            matchesSnapshot: matches,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          tx.update(tournamentRef, {
            registeredTeams: registeredTeams + 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          return { ok: true, alreadyRegistered: false, memberUids: [uid] };
        }

        const teamId = String(req.body?.teamId || "").trim();
        if (!teamId) return { status: 400, error: "Team id is required for team formats" };

        const teamRef = db.collection("teams").doc(teamId);
        const registrationRef = tournamentRef.collection("registrations").doc(teamId);
        const [teamSnap, regSnap] = await Promise.all([tx.get(teamRef), tx.get(registrationRef)]);

        if (!teamSnap.exists) return { status: 404, error: "Team not found" };
        if (regSnap.exists) return { ok: true, alreadyRegistered: true };

        const team = teamSnap.data() || {};
        if (team.captainUid !== uid) return { status: 403, error: "Only captain can register team" };
        const roster = getTeamRosterConfig(team);
        if (roster.teamFormat !== String(tournament.teamFormat || "").toLowerCase()) {
          return {
            status: 409,
            error: `Team format ${roster.teamFormat} does not match tournament format ${tournament.teamFormat}`,
          };
        }

        const memberUids = normalizeUidList(team.memberUids || []);
        const needSize = teamSizeByFormat(tournament.teamFormat);
        if (memberUids.length < needSize || memberUids.length > needSize + 1) {
          return {
            status: 409,
            error: `Team must have ${needSize} main players (+ optional 1 reserve) for ${tournament.teamFormat}`,
          };
        }

        const conflictSnap = await tx.get(
          tournamentRef
            .collection("registrations")
            .where("memberUids", "array-contains-any", memberUids.slice(0, 10))
            .limit(1)
        );
        if (!conflictSnap.empty) {
          return { status: 409, error: "One or more team members already registered" };
        }

        const profileRefs = memberUids.map((id) => db.collection("leaderboard_users").doc(id));
        const profileSnaps = await tx.getAll(...profileRefs);
        const stats = profileSnaps.map((snap, idx) => {
          const p = snap.exists ? snap.data() || {} : {};
          const memberUid = memberUids[idx];
          return {
            uid: memberUid,
            name: String(p.name || memberUid || "Player"),
            avatarUrl: resolveProfileAvatarUrl(p, memberUid),
            elo: toInt(p.hiddenElo ?? p.elo, 500),
            matches: toInt(p.matches, 0),
            fragpunkId: getProfileFragpunkId(p),
          };
        });
        const totalElo = stats.reduce((acc, s) => acc + s.elo, 0);
        const totalMatches = stats.reduce((acc, s) => acc + s.matches, 0);
        const avgElo = Math.round(totalElo / Math.max(1, memberUids.length));
        const avgMatches = Math.round(totalMatches / Math.max(1, memberUids.length));

        const reqMinElo = toInt(tournament?.requirements?.minElo, 0);
        const reqMinMatches = toInt(tournament?.requirements?.minMatches, 0);
        const missingFragpunkMember = stats.find((s) => !s.fragpunkId);
        if (missingFragpunkMember) {
          return {
            status: 409,
            error: `Member ${missingFragpunkMember.uid} must link FragPunk ID in profile settings`,
          };
        }
        const failedMember = stats.find((s) => s.elo < reqMinElo || s.matches < reqMinMatches);
        if (failedMember) {
          return {
            status: 409,
            error: `Member ${failedMember.uid} does not meet requirements`,
          };
        }

        tx.set(registrationRef, {
          teamId,
          teamName: team.name || "Team",
          avatarUrl: team.avatarUrl || "",
          country: normalizeTeamCountry(team.country),
          captainUid: team.captainUid || uid,
          memberUids,
          membersSnapshot: stats.map((s) => ({
            uid: s.uid,
            name: s.name,
            avatarUrl: s.avatarUrl,
            fragpunkId: s.fragpunkId,
            elo: s.elo,
          })),
          avgEloSnapshot: avgElo,
          matchesSnapshot: avgMatches,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.set(
          teamRef,
          {
            activeTournamentIds: admin.firestore.FieldValue.arrayUnion(tournamentId),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        tx.update(tournamentRef, {
          registeredTeams: registeredTeams + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { ok: true, alreadyRegistered: false, memberUids, teamId };
      });

      if (outcome?.ok && typeof invalidateTournamentCaches === "function") {
        invalidateTournamentCaches({ tournamentId });
      }
      if (outcome?.ok && String(outcome?.teamId || "").trim() && typeof invalidateTeamsCaches === "function") {
        invalidateTeamsCaches({ teamId: String(outcome.teamId) });
      }
      if (outcome?.ok && String(outcome?.teamId || "").trim()) {
        db.collection("team_public_stats")
          .doc(String(outcome.teamId))
          .set(
            {
              teamId: String(outcome.teamId),
              stale: true,
              updatedAt: 0,
            },
            { merge: true }
          )
          .catch((err) => logger.warn("TEAM PUBLIC STATS STALE MARK ERROR:", err?.message || err));
      }
      const memberUids = Array.isArray(outcome?.memberUids)
        ? normalizeUidList(outcome.memberUids)
        : [uid];
      if (typeof userTournamentContextRef === "function") {
        await Promise.all(
          memberUids.map(async (memberUid) => {
            try {
              const updatedAt = Date.now();
              await userTournamentContextRef(memberUid).set(
                {
                  uid: memberUid,
                  // Keep root field for backward compatibility, but write canonical
                  // materialized shape under payload for read fast-path.
                  tournamentIds: admin.firestore.FieldValue.arrayUnion(tournamentId),
                  "payload.tournamentIds": admin.firestore.FieldValue.arrayUnion(tournamentId),
                  updatedAt,
                },
                { merge: true }
              );
            } catch (err) {
              logger.warn("TOURNAMENT USER CONTEXT UPSERT ERROR:", err?.message || err);
            }
          })
        );
      }
      if (typeof clearTournamentPublicView === "function") {
        await clearTournamentPublicView(tournamentId);
      }
      return respondWithOutcome(res, outcome, {
        ok: true,
        alreadyRegistered: Boolean(outcome?.alreadyRegistered),
      });
    } catch (err) {
      return respondServerError(
        res,
        logger,
        "TOURNAMENT REGISTER TEAM ERROR",
        "Failed to register team",
        err
      );
    }
  });
}
