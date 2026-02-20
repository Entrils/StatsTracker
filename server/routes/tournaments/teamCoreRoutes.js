import crypto from "crypto";
import {
  toInt,
  toAnyMillis,
  normalizeUidList,
  normalizeTeamCountry,
  TEAM_ROSTER_FORMATS,
  normalizeTeamFormat,
  getTeamMaxMembersForFormat,
  resolveProfileAvatarUrl,
  getProfileFragpunkId,
  getTournamentStatus,
  findActiveTeamTournamentRegistration,
  serializeTeam,
  MAX_TEAM_AVATAR_URL_LENGTH,
} from "./helpers.js";
import { respondServerError, respondWithOutcome } from "./routeHelpers.js";
export function registerTeamCoreRoutes(app, ctx) {
  const {
    admin,
    db,
    logger,
    authLimiter,
    statsLimiter,
    requireAuth,
    findUserTeamInFormat,
    isValidUid,
    teamsCache,
    invalidateTeamsCaches,
    invalidateTournamentCaches,
    userTournamentContextRef,
  } = ctx;
  const TEAMS_MY_CACHE_TTL_MS = 60 * 1000;
  const TEAM_PUBLIC_DETAILS_CACHE_TTL_MS = 30 * 1000;
  const normalizeReserveUid = (team = {}, members = null, captainUid = "") => {
    const memberList = Array.isArray(members)
      ? normalizeUidList(members)
      : normalizeUidList(team?.memberUids || []);
    const captain = String(captainUid || team?.captainUid || "");
    const reserveUid = String(team?.reserveUid || "").trim();
    if (!reserveUid || reserveUid === captain) return "";
    return memberList.includes(reserveUid) ? reserveUid : "";
  };
  const teamsMyCache = teamsCache?.my || new Map();
  const teamsPublicDetailsCache = teamsCache?.publicDetails || new Map();
  const teamPublicStatsRef = (teamId = "") => db.collection("team_public_stats").doc(String(teamId || ""));
  const normalizeTeamNameLower = (value = "") => String(value || "").trim().toLowerCase();
  const makeRandomId = (prefix = "id") => {
    if (typeof crypto.randomUUID === "function") return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  };
  const teamNameLockRef = (nameLower = "") =>
    db.collection("team_name_locks").doc(encodeURIComponent(String(nameLower || "").trim()));
  const buildEtag = (payload) => {
    try {
      const hash = crypto.createHash("sha1").update(JSON.stringify(payload ?? null)).digest("hex");
      return `"${hash}"`;
    } catch {
      return null;
    }
  };
  const requestHasEtag = (req, etag) => {
    if (!etag) return false;
    const raw = String(req.headers["if-none-match"] || "").trim();
    if (!raw) return false;
    if (raw === "*") return true;
    return raw
      .split(",")
      .map((v) => String(v || "").trim())
      .includes(etag);
  };
  const setPublicCacheHeaders = (res, { etag = null, maxAge = 90, swr = 180 } = {}) => {
    res.set("Cache-Control", `public, max-age=${Math.max(0, maxAge)}, stale-while-revalidate=${Math.max(0, swr)}`);
    if (etag) res.set("ETag", etag);
  };
  const invalidateUserTeamDerivedCaches = (uids = []) => {
    const uniq = [...new Set((uids || []).map((v) => String(v || "")).filter(Boolean))];
    if (!uniq.length) {
      if (typeof invalidateTeamsCaches === "function") invalidateTeamsCaches();
      if (typeof invalidateTournamentCaches === "function") invalidateTournamentCaches();
      return;
    }
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
          .catch((err) => logger.warn("TEAM CONTEXT MATERIALIZED INVALIDATE ERROR:", err?.message || err));
      }
    });
  };
  const deleteCollectionInChunks = async (
    collectionRef,
    chunkSize = 200,
    collectionName = "collection"
  ) => {
    if (!collectionRef || typeof collectionRef.limit !== "function") return 0;
    let totalDeleted = 0;
    while (true) {
      let snap = null;
      try {
        snap = await collectionRef.limit(chunkSize).get();
      } catch (err) {
        const wrapped = new Error(
          `Failed to read ${collectionName} chunk: ${String(err?.message || err)}`
        );
        wrapped.cause = err;
        wrapped.deletedCount = totalDeleted;
        throw wrapped;
      }
      const docs = Array.isArray(snap?.docs) ? snap.docs : [];
      if (!docs.length) break;
      try {
        if (typeof db.batch === "function") {
          const batch = db.batch();
          docs.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();
        } else {
          await Promise.all(docs.map((doc) => doc.ref.delete()));
        }
      } catch (err) {
        const wrapped = new Error(
          `Failed to delete ${collectionName} chunk: ${String(err?.message || err)}`
        );
        wrapped.cause = err;
        wrapped.deletedCount = totalDeleted;
        throw wrapped;
      }
      totalDeleted += docs.length;
      if (docs.length < chunkSize) break;
    }
    return totalDeleted;
  };
  const loadMyTeamsRows = async (uid) => {
    const snap = await db
      .collection("teams")
      .where("memberUids", "array-contains", uid)
      .limit(50)
      .get();
    const baseRows = snap.docs.map((doc) => serializeTeam(doc, uid));
    const uniqueMemberUids = [...new Set(baseRows.flatMap((team) => team.memberUids || []))];
    const memberStatsByUid = new Map();
    if (uniqueMemberUids.length) {
      const refs = uniqueMemberUids.map((memberUid) =>
        db.collection("leaderboard_users").doc(memberUid)
      );
      const statSnaps =
        typeof db.getAll === "function"
          ? await db.getAll(...refs)
          : await Promise.all(refs.map((ref) => ref.get()));
      for (let i = 0; i < statSnaps.length; i += 1) {
        const statSnap = statSnaps[i];
        const data = statSnap.exists ? statSnap.data() || {} : {};
        memberStatsByUid.set(uniqueMemberUids[i], {
          uid: uniqueMemberUids[i],
          elo: toInt(data.hiddenElo ?? data.elo, 500),
          matches: toInt(data.matches, 0),
          fragpunkId: getProfileFragpunkId(data),
        });
      }
    }
    return baseRows.map((team) => ({
      ...team,
      membersStats: (team.memberUids || []).map(
        (memberUid) =>
          memberStatsByUid.get(memberUid) || {
            uid: memberUid,
            elo: 500,
            matches: 0,
            fragpunkId: "",
          }
      ),
    }));
  };
  const loadTeamDetails = async ({ teamId = "", viewerUid = "", requireMembership = false }) => {
    const safeTeamId = String(teamId || "");
    const safeViewerUid = String(viewerUid || "");
    if (!safeTeamId) return { status: 400, error: "Invalid params" };
    const now = Date.now();
    const publicCacheKey = safeTeamId;
    if (!requireMembership) {
      const cached = teamsPublicDetailsCache.get(publicCacheKey);
      if (cached && now - cached.ts < TEAM_PUBLIC_DETAILS_CACHE_TTL_MS) {
        return { ok: true, payload: cached.payload, etag: cached.etag || null, cached: true };
      }
    }

    const snap = await db.collection("teams").doc(safeTeamId).get();
    if (!snap.exists) return { status: 404, error: "Team not found" };
    const team = snap.data() || {};
    const members = normalizeUidList(team.memberUids || []);
    if (requireMembership && !members.includes(safeViewerUid)) {
      return { status: 403, error: "Forbidden" };
    }

    const row = serializeTeam(snap, safeViewerUid);
    const profileRefs = members.map((memberUid) => db.collection("leaderboard_users").doc(memberUid));
    const profileSnaps =
      typeof db.getAll === "function"
        ? await db.getAll(...profileRefs)
        : await Promise.all(profileRefs.map((ref) => ref.get()));
    const reserveUid = normalizeReserveUid(team, members, row.captainUid);
    const roster = members.map((memberUid, idx) => {
      const profile = profileSnaps[idx]?.exists ? profileSnaps[idx].data() || {} : {};
      return {
        uid: memberUid,
        name: profile.name || memberUid,
        avatarUrl: resolveProfileAvatarUrl(profile, memberUid),
        elo: toInt(profile.hiddenElo ?? profile.elo, 500),
        matches: toInt(profile.matches, 0),
        fragpunkId: getProfileFragpunkId(profile),
        role:
          memberUid === row.captainUid
            ? "captain"
            : memberUid === reserveUid
            ? "reserve"
            : "player",
      };
    });

    const readMaterializedTeamStats = async () => {
      try {
        const statsSnap = await teamPublicStatsRef(safeTeamId).get();
        if (!statsSnap?.exists) return null;
        const statsData = statsSnap.data() || {};
        if (statsData?.stale === true) return null;
        const wins = toInt(statsData?.stats?.wins, 0);
        const losses = toInt(statsData?.stats?.losses, 0);
        const matchesPlayed = toInt(statsData?.stats?.matchesPlayed, wins + losses);
        const winRate = toInt(
          statsData?.stats?.winRate,
          matchesPlayed > 0 ? Math.round((wins / Math.max(1, matchesPlayed)) * 100) : 0
        );
        const recentTournaments = Array.isArray(statsData?.recentTournaments)
          ? statsData.recentTournaments.slice(0, 8)
          : [];
        const matchHistory = Array.isArray(statsData?.matchHistory)
          ? statsData.matchHistory.slice(0, 40)
          : [];
        return {
          stats: { wins, losses, matchesPlayed, winRate },
          recentTournaments,
          matchHistory,
        };
      } catch (err) {
        logger.warn("TEAM PUBLIC STATS READ ERROR:", err?.message || err);
        return null;
      }
    };
    const recomputeTeamPublicStats = async () => {
      let recentTournaments = [];
      let matchHistory = [];
      let wins = 0;
      let losses = 0;
      let matchesPlayed = 0;
      let winRate = 0;
      try {
      const regsSnap = await db
        .collectionGroup("registrations")
        .where("teamId", "==", safeTeamId)
        .limit(100)
        .get();
      const tournamentIds = [];
      for (const doc of regsSnap.docs) {
        const tId = String(doc.ref.parent?.parent?.id || "");
        if (!tId || tournamentIds.includes(tId)) continue;
        tournamentIds.push(tId);
      }
      const tournamentRefs = tournamentIds.map((tId) => db.collection("tournaments").doc(tId));
      const tournamentSnaps =
        tournamentRefs.length === 0
          ? []
          : typeof db.getAll === "function"
            ? await db.getAll(...tournamentRefs)
            : await Promise.all(tournamentRefs.map((ref) => ref.get()));

      const tournamentMap = new Map();
      for (const tSnap of tournamentSnaps) {
        if (!tSnap?.exists) continue;
        const data = tSnap.data() || {};
        tournamentMap.set(tSnap.id, {
          id: tSnap.id,
          title: data.title || "Tournament",
          startsAt: toAnyMillis(data.startsAt, 0),
          status: getTournamentStatus(data, Date.now()),
          champion: data.champion || null,
        });
      }

      const matchBuckets = await Promise.all(
        tournamentIds.map(async (tId) => {
          const tMeta = tournamentMap.get(tId);
          if (!tMeta) return [];
          const mSnap = await db.collection("tournaments").doc(tId).collection("matches").limit(500).get();
          return mSnap.docs
            .map((doc) => {
              const d = doc.data() || {};
              const teamAId = String(d?.teamA?.teamId || "");
              const teamBId = String(d?.teamB?.teamId || "");
              if (teamAId !== safeTeamId && teamBId !== safeTeamId) return null;
              const isA = teamAId === safeTeamId;
              const opponent = isA ? d.teamB || null : d.teamA || null;
              const winnerTeamId = String(d.winnerTeamId || "");
              let result = "pending";
              if (winnerTeamId) result = winnerTeamId === safeTeamId ? "win" : "loss";
              return {
                id: doc.id,
                tournamentId: tMeta.id,
                tournamentTitle: tMeta.title,
                round: toInt(d.round, 1),
                stage: d.stage || "single",
                status: d.status || "pending",
                result,
                teamAScore: toInt(d.teamAScore, 0),
                teamBScore: toInt(d.teamBScore, 0),
                scoreFor: isA ? toInt(d.teamAScore, 0) : toInt(d.teamBScore, 0),
                scoreAgainst: isA ? toInt(d.teamBScore, 0) : toInt(d.teamAScore, 0),
                opponent: {
                  teamId: String(opponent?.teamId || ""),
                  teamName: opponent?.teamName || "TBD",
                  avatarUrl: opponent?.avatarUrl || "",
                },
                playedAt: toAnyMillis(d.updatedAt, toAnyMillis(d.createdAt, tMeta.startsAt || Date.now())),
              };
            })
            .filter(Boolean);
        })
      );

      matchHistory = matchBuckets
        .flat()
        .sort((a, b) => Number(b.playedAt || 0) - Number(a.playedAt || 0))
        .slice(0, 40);

      for (const m of matchHistory) {
        if (m.status !== "completed") continue;
        if (m.result === "win") wins += 1;
        if (m.result === "loss") losses += 1;
      }
      matchesPlayed = wins + losses;
      winRate = matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0;

        recentTournaments = tournamentIds
        .map((tId) => tournamentMap.get(tId))
        .filter(Boolean)
        .sort((a, b) => Number(b.startsAt || 0) - Number(a.startsAt || 0))
        .slice(0, 8)
        .map((t) => ({
          ...t,
          placement:
            String(
              (t?.champion && typeof t.champion === "object" ? t.champion.teamId : t?.champion) || ""
            ) === safeTeamId
              ? 1
              : null,
        }));
      } catch (analyticsErr) {
        logger.warn("TEAM DETAILS ANALYTICS ERROR:", analyticsErr);
      }
      return {
        stats: {
          wins,
          losses,
          matchesPlayed,
          winRate,
        },
        recentTournaments,
        matchHistory,
      };
    };
    let computed = await readMaterializedTeamStats();
    if (!computed) {
      computed = await recomputeTeamPublicStats();
      teamPublicStatsRef(safeTeamId)
        .set(
          {
            teamId: safeTeamId,
            stale: false,
            stats: computed.stats,
            recentTournaments: computed.recentTournaments,
            matchHistory: computed.matchHistory,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch((err) => logger.warn("TEAM PUBLIC STATS WRITE ERROR:", err?.message || err));
    }

    const payload = {
      row,
      roster,
      stats: computed?.stats || { wins: 0, losses: 0, matchesPlayed: 0, winRate: 0 },
      recentTournaments: computed?.recentTournaments || [],
      matchHistory: computed?.matchHistory || [],
    };
    if (!requireMembership) {
      const etag = buildEtag(payload);
      teamsPublicDetailsCache.set(publicCacheKey, { ts: now, payload, etag });
      return { ok: true, payload, etag };
    }

    return {
      ok: true,
      payload,
    };
  };
  app.get("/teams/my", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      const now = Date.now();
      const cached = teamsMyCache.get(uid);
      if (cached && now - cached.ts < TEAMS_MY_CACHE_TTL_MS) {
        return res.json({ rows: cached.rows, cached: true });
      }
      const rows = await loadMyTeamsRows(uid);
      teamsMyCache.set(uid, { ts: now, rows });
      return res.json({ rows });
    } catch (err) {
      logger.error("TEAMS MY ERROR:", err);
      return res.json({ rows: [] });
    }
  });

  app.post("/teams", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ error: "Team name is required" });
      const safeName = name.slice(0, 60);
      const safeNameLower = normalizeTeamNameLower(safeName);

      const legacyMaxMembers = Math.min(Math.max(toInt(req.body?.maxMembers, 5), 1), 6);
      const requestedFormat = String(req.body?.teamFormat || "").trim();
      if (requestedFormat && !TEAM_ROSTER_FORMATS.has(requestedFormat.toLowerCase())) {
        return res.status(400).json({ error: "Invalid team format" });
      }
      const teamFormat = requestedFormat
        ? normalizeTeamFormat(requestedFormat, "5x5")
        : legacyMaxMembers <= 2
        ? "2x2"
        : legacyMaxMembers <= 3
        ? "3x3"
        : "5x5";
      const maxMembers = getTeamMaxMembersForFormat(teamFormat);
      const ownTeamSameFormat = await findUserTeamInFormat({ uid, teamFormat });
      if (ownTeamSameFormat) {
        return res.status(409).json({ error: "You can be in only one team per format" });
      }
      const avatarUrl = String(req.body?.avatarUrl || "").trim();
      if (avatarUrl.length > MAX_TEAM_AVATAR_URL_LENGTH) {
        return res.status(400).json({ error: "Team avatar is too large" });
      }
      const country = normalizeTeamCountry(req.body?.country);
      const teamRef = db.collection("teams").doc(makeRandomId("team"));
      const lockRef = teamNameLockRef(safeNameLower);
      const outcome = await db.runTransaction(async (tx) => {
        const [teamSnap, lockSnap] = await Promise.all([tx.get(teamRef), tx.get(lockRef)]);
        if (teamSnap.exists) return { status: 409, error: "Try again" };
        const lockData = lockSnap.exists ? lockSnap.data() || {} : {};
        const lockTeamId = String(lockData.teamId || "");
        if (lockTeamId && lockTeamId !== teamRef.id) {
          return { status: 409, error: "Team name already exists" };
        }

        tx.set(teamRef, {
          name: safeName,
          nameLower: safeNameLower,
          teamFormat,
          captainUid: uid,
          reserveUid: "",
          memberUids: [uid],
          maxMembers,
          avatarUrl,
          country,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.set(
          lockRef,
          {
            nameLower: safeNameLower,
            teamId: teamRef.id,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        return { ok: true, id: teamRef.id };
      });
      if (outcome?.error) {
        return res.status(outcome.status || 400).json({ error: outcome.error });
      }
      invalidateUserTeamDerivedCaches([uid]);
      return res.json({ ok: true, id: outcome.id });
    } catch (err) {
      return respondServerError(res, logger, "TEAM CREATE ERROR", "Failed to create team", err);
    }
  });

  app.patch("/teams/:id", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      const teamId = String(req.params.id || "");
      if (!uid || !teamId) return res.status(400).json({ error: "Invalid params" });

      const teamRef = db.collection("teams").doc(teamId);
      const nextNameRaw = String(req.body?.name ?? "").trim();
      const nextAvatarRaw = String(req.body?.avatarUrl ?? "").trim();
      if (nextAvatarRaw) {
        if (nextAvatarRaw.length > MAX_TEAM_AVATAR_URL_LENGTH) {
          return res.status(400).json({ error: "Team avatar is too large" });
        }
      }
      const outcome = await db.runTransaction(async (tx) => {
        const snap = await tx.get(teamRef);
        if (!snap.exists) return { status: 404, error: "Team not found" };
        const team = snap.data() || {};
        if (team.captainUid !== uid) {
          return { status: 403, error: "Only captain can edit team" };
        }
        const patch = {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (nextNameRaw) {
          const safeName = nextNameRaw.slice(0, 60);
          const safeNameLower = normalizeTeamNameLower(safeName);
          const currentNameLower = normalizeTeamNameLower(team.nameLower || team.name || "");
          if (safeNameLower !== currentNameLower) {
            const newLockRef = teamNameLockRef(safeNameLower);
            const newLockSnap = await tx.get(newLockRef);
            const lockTeamId = String((newLockSnap.exists ? newLockSnap.data() || {} : {}).teamId || "");
            if (lockTeamId && lockTeamId !== teamId) {
              return { status: 409, error: "Team name already exists" };
            }

            tx.set(
              newLockRef,
              {
                nameLower: safeNameLower,
                teamId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );

            if (currentNameLower) {
              const oldLockRef = teamNameLockRef(currentNameLower);
              const oldLockSnap = await tx.get(oldLockRef);
              const oldLockTeamId = String((oldLockSnap.exists ? oldLockSnap.data() || {} : {}).teamId || "");
              if (!oldLockTeamId || oldLockTeamId === teamId) {
                tx.delete(oldLockRef);
              }
            }
          }
          patch.name = safeName;
          patch.nameLower = safeNameLower;
        }

        if (nextAvatarRaw) {
          patch.avatarUrl = nextAvatarRaw;
        }

        tx.set(teamRef, patch, { merge: true });
        return { ok: true, affectedUids: normalizeUidList(team.memberUids || []) };
      });
      if (outcome?.error) {
        return res.status(outcome.status || 400).json({ error: outcome.error });
      }
      const affectedUids = normalizeUidList(outcome?.affectedUids || []);
      invalidateUserTeamDerivedCaches(affectedUids);
      return res.json({ ok: true });
    } catch (err) {
      return respondServerError(res, logger, "TEAM UPDATE ERROR", "Failed to update team", err);
    }
  });

  app.post("/teams/:id/kick", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      const teamId = String(req.params.id || "");
      const targetUid = String(req.body?.uid || "").trim();
      if (!uid || !teamId || !targetUid || !isValidUid(targetUid)) {
        return res.status(400).json({ error: "Invalid params" });
      }

      const teamRef = db.collection("teams").doc(teamId);
      const outcome = await db.runTransaction(async (tx) => {
        const snap = await tx.get(teamRef);
        if (!snap.exists) return { status: 404, error: "Team not found" };
        const team = snap.data() || {};
        if (team.captainUid !== uid) return { status: 403, error: "Only captain can kick players" };
        const activeRegistrationInTx = await findActiveTeamTournamentRegistration({
          db,
          admin,
          teamId,
          team,
          teamRef,
          tx,
        });
        if (activeRegistrationInTx) {
          return {
            status: 409,
            error: "Cannot change roster while team is registered in upcoming/ongoing tournament",
          };
        }
        if (targetUid === uid) {
          return { status: 409, error: "Captain cannot kick self" };
        }

        const members = normalizeUidList(team.memberUids || []);
        if (!members.includes(targetUid)) {
          return { status: 404, error: "Player is not in this team" };
        }

        tx.set(
          teamRef,
          {
            memberUids: members.filter((memberUid) => memberUid !== targetUid),
            reserveUid: normalizeReserveUid(
              team,
              members.filter((memberUid) => memberUid !== targetUid),
              team.captainUid
            ),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        return {
          ok: true,
          affectedUids: normalizeUidList([...members.filter((memberUid) => memberUid !== targetUid), targetUid]),
        };
      });
      if (outcome?.ok) {
        invalidateUserTeamDerivedCaches(outcome.affectedUids || [uid, targetUid]);
      }
      return respondWithOutcome(res, outcome);
    } catch (err) {
      return respondServerError(res, logger, "TEAM KICK ERROR", "Failed to kick player", err);
    }
  });

  app.post("/teams/:id/transfer-captain", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      const teamId = String(req.params.id || "");
      const targetUid = String(req.body?.uid || "").trim();
      if (!uid || !teamId || !targetUid || !isValidUid(targetUid)) {
        return res.status(400).json({ error: "Invalid params" });
      }

      const teamRef = db.collection("teams").doc(teamId);
      const outcome = await db.runTransaction(async (tx) => {
        const snap = await tx.get(teamRef);
        if (!snap.exists) return { status: 404, error: "Team not found" };
        const team = snap.data() || {};
        if (team.captainUid !== uid) return { status: 403, error: "Only captain can transfer captain role" };
        const activeRegistrationInTx = await findActiveTeamTournamentRegistration({
          db,
          admin,
          teamId,
          team,
          teamRef,
          tx,
        });
        if (activeRegistrationInTx) {
          return {
            status: 409,
            error: "Cannot change captain while team is registered in upcoming/ongoing tournament",
          };
        }
        if (targetUid === uid) return { status: 409, error: "User is already captain" };

        const members = normalizeUidList(team.memberUids || []);
        if (!members.includes(targetUid)) {
          return { status: 404, error: "Player is not in this team" };
        }

        tx.set(
          teamRef,
          {
            captainUid: targetUid,
            reserveUid: normalizeReserveUid(team, members, targetUid),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        return { ok: true, affectedUids: members };
      });
      if (outcome?.ok) {
        invalidateUserTeamDerivedCaches(outcome.affectedUids || [uid, targetUid]);
      }
      return respondWithOutcome(res, outcome);
    } catch (err) {
      return respondServerError(
        res,
        logger,
        "TEAM TRANSFER CAPTAIN ERROR",
        "Failed to transfer captain role",
        err
      );
    }
  });

  app.post("/teams/:id/set-role", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      const teamId = String(req.params.id || "");
      const targetUid = String(req.body?.uid || "").trim();
      const role = String(req.body?.role || "").trim().toLowerCase();
      if (!uid || !teamId || !targetUid || !isValidUid(targetUid)) {
        return res.status(400).json({ error: "Invalid params" });
      }
      if (!["captain", "reserve", "player"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      const teamRef = db.collection("teams").doc(teamId);
      const outcome = await db.runTransaction(async (tx) => {
        const snap = await tx.get(teamRef);
        if (!snap.exists) return { status: 404, error: "Team not found" };
        const team = snap.data() || {};
        if (team.captainUid !== uid) {
          return { status: 403, error: "Only captain can change roles" };
        }
        const activeRegistrationInTx = await findActiveTeamTournamentRegistration({
          db,
          admin,
          teamId,
          team,
          teamRef,
          tx,
        });
        if (activeRegistrationInTx) {
          return {
            status: 409,
            error: "Cannot change roles while team is registered in upcoming/ongoing tournament",
          };
        }

        const members = normalizeUidList(team.memberUids || []);
        if (!members.includes(targetUid)) {
          return { status: 404, error: "Player is not in this team" };
        }

        let captainUid = String(team.captainUid || "");
        let reserveUid = normalizeReserveUid(team, members, captainUid);

        if (role === "captain") {
          captainUid = targetUid;
          if (reserveUid === targetUid) reserveUid = "";
        } else if (role === "reserve") {
          if (targetUid === captainUid) {
            return { status: 409, error: "Captain cannot be reserve" };
          }
          reserveUid = targetUid;
        } else if (role === "player") {
          if (targetUid === captainUid) {
            return { status: 409, error: "Captain role cannot be removed" };
          }
          if (reserveUid === targetUid) reserveUid = "";
        }

        tx.set(
          teamRef,
          {
            captainUid,
            reserveUid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return { ok: true, affectedUids: members };
      });

      if (outcome?.ok) {
        invalidateUserTeamDerivedCaches(outcome.affectedUids || [uid, targetUid]);
      }
      return respondWithOutcome(res, outcome);
    } catch (err) {
      return respondServerError(res, logger, "TEAM SET ROLE ERROR", "Failed to change player role", err);
    }
  });

  app.delete("/teams/:id", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      const teamId = String(req.params.id || "");
      if (!uid || !teamId) return res.status(400).json({ error: "Invalid params" });

      const teamRef = db.collection("teams").doc(teamId);
      const teamSnap = await teamRef.get();
      if (!teamSnap.exists) return res.status(404).json({ error: "Team not found" });
      const team = teamSnap.data() || {};
      if (team.captainUid !== uid) {
        return res.status(403).json({ error: "Only captain can delete team" });
      }
      const teamRegistrationIds = Array.isArray(team.activeTournamentIds)
        ? normalizeUidList(team.activeTournamentIds)
        : null;

      let hasTournamentRegistration = false;
      if (typeof db.collectionGroup === "function") {
        const activeRegistration = await findActiveTeamTournamentRegistration({
          db,
          admin,
          teamId,
          team,
        });
        hasTournamentRegistration = Boolean(activeRegistration);
      } else {
        // Fallback for non-Firestore test doubles without collectionGroup support.
        if (Array.isArray(teamRegistrationIds)) {
          const activeRegistration = await findActiveTeamTournamentRegistration({
            db,
            admin,
            teamId,
            team,
          });
          hasTournamentRegistration = Boolean(activeRegistration);
        } else {
          const tournamentsRef = db.collection("tournaments");
          const canPaginate =
            typeof tournamentsRef.orderBy === "function" &&
            typeof admin?.firestore?.FieldPath?.documentId === "function";
          if (canPaginate) {
            let lastDoc = null;
            while (true) {
              let query = tournamentsRef
                .orderBy(admin.firestore.FieldPath.documentId())
                .limit(200);
              if (lastDoc && typeof query.startAfter === "function") {
                query = query.startAfter(lastDoc);
              }
              const tournamentsSnap = await query.get();
              const docs = Array.isArray(tournamentsSnap?.docs) ? tournamentsSnap.docs : [];
              if (!docs.length) break;
              for (const tournamentDoc of docs) {
                const tournamentData = tournamentDoc.data ? tournamentDoc.data() || {} : {};
                const tournamentStatus = getTournamentStatus(tournamentData, Date.now());
                if (!["upcoming", "ongoing"].includes(tournamentStatus)) continue;
                const regDoc = await tournamentDoc.ref.collection("registrations").doc(teamId).get();
                if (regDoc.exists) {
                  hasTournamentRegistration = true;
                  break;
                }
              }
              if (hasTournamentRegistration || docs.length < 200) break;
              lastDoc = docs[docs.length - 1];
            }
          } else {
            const tournamentsSnap = await tournamentsRef.get();
            for (const tournamentDoc of tournamentsSnap.docs || []) {
              const tournamentData = tournamentDoc.data ? tournamentDoc.data() || {} : {};
              const tournamentStatus = getTournamentStatus(tournamentData, Date.now());
              if (!["upcoming", "ongoing"].includes(tournamentStatus)) continue;
              const regDoc = await tournamentDoc.ref.collection("registrations").doc(teamId).get();
              if (regDoc.exists) {
                hasTournamentRegistration = true;
                break;
              }
            }
          }
        }
      }
      if (hasTournamentRegistration) {
        return res.status(409).json({
          error: "Team is registered in a tournament and cannot be deleted",
        });
      }

      await deleteCollectionInChunks(teamRef.collection("invites"), 200, "team invites");
      await teamRef.delete();
      const teamNameLower = normalizeTeamNameLower(team.nameLower || team.name || "");
      if (teamNameLower) {
        const lockRef = teamNameLockRef(teamNameLower);
        try {
          const lockSnap = await lockRef.get();
          const lockTeamId = String((lockSnap.exists ? lockSnap.data() || {} : {}).teamId || "");
          if (!lockTeamId || lockTeamId === teamId) {
            await lockRef.delete();
          }
        } catch (lockErr) {
          logger.warn("TEAM NAME LOCK DELETE ERROR:", lockErr?.message || lockErr);
        }
      }
      const affectedUids = normalizeUidList(team.memberUids || []);
      invalidateUserTeamDerivedCaches(affectedUids);
      return res.json({ ok: true });
    } catch (err) {
      return respondServerError(res, logger, "TEAM DELETE ERROR", "Failed to delete team", err);
    }
  });

  app.post("/teams/:id/leave", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      const teamId = String(req.params.id || "");
      if (!uid || !teamId) return res.status(400).json({ error: "Invalid params" });

      const teamRef = db.collection("teams").doc(teamId);
      const outcome = await db.runTransaction(async (tx) => {
        const snap = await tx.get(teamRef);
        if (!snap.exists) return { status: 404, error: "Team not found" };
        const team = snap.data() || {};
        const activeRegistrationInTx = await findActiveTeamTournamentRegistration({
          db,
          admin,
          teamId,
          team,
          teamRef,
          tx,
        });
        if (activeRegistrationInTx) {
          return {
            status: 409,
            error: "Cannot leave team while it is registered in upcoming/ongoing tournament",
          };
        }
        const members = normalizeUidList(team.memberUids || []);
        if (!members.includes(uid)) return { status: 409, error: "You are not in this team" };
        if (team.captainUid === uid) {
          return { status: 409, error: "Captain cannot leave team. Delete team instead" };
        }

        tx.set(
          teamRef,
          {
            memberUids: members.filter((memberUid) => memberUid !== uid),
            reserveUid: normalizeReserveUid(
              team,
              members.filter((memberUid) => memberUid !== uid),
              team.captainUid
            ),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        return {
          ok: true,
          affectedUids: normalizeUidList([...members.filter((memberUid) => memberUid !== uid), uid]),
        };
      });
      if (outcome?.ok) {
        invalidateUserTeamDerivedCaches(outcome.affectedUids || [uid]);
      }
      return respondWithOutcome(res, outcome);
    } catch (err) {
      return respondServerError(res, logger, "TEAM LEAVE ERROR", "Failed to leave team", err);
    }
  });

  app.get("/teams/:id", authLimiter, requireAuth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      const teamId = String(req.params.id || "");
      const details = await loadTeamDetails({
        teamId,
        viewerUid: uid,
        requireMembership: true,
      });
      if (!details?.ok) {
        return res.status(details?.status || 500).json({ error: details?.error || "Failed to load team" });
      }
      return res.json(details.payload);
    } catch (err) {
      return respondServerError(res, logger, "TEAM DETAILS ERROR", "Failed to load team", err);
    }
  });

  app.get("/teams/:id/public", statsLimiter, async (req, res) => {
    try {
      const teamId = String(req.params.id || "");
      const details = await loadTeamDetails({
        teamId,
        viewerUid: "",
        requireMembership: false,
      });
      if (!details?.ok) {
        return res.status(details?.status || 500).json({ error: details?.error || "Failed to load team" });
      }
      const etag = details?.etag || buildEtag(details.payload);
      setPublicCacheHeaders(res, { etag, maxAge: 90, swr: 180 });
      if (requestHasEtag(req, etag)) {
        return res.status(304).end();
      }
      return res.json(details.payload);
    } catch (err) {
      return respondServerError(res, logger, "TEAM PUBLIC DETAILS ERROR", "Failed to load team", err);
    }
  });
}
