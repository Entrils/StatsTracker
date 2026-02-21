import {
  ALLOWED_TEAM_FORMATS,
  ALLOWED_BRACKET_TYPES,
  ALLOWED_MAX_TEAMS,
  DEFAULT_MAP_POOL,
  VETO_READY_DELAY_MS,
  toInt,
  toMillis,
  isAdminUser,
  normalizeUidList,
  normalizeMapPool,
  normalizeTeamFromRegistration,
  buildEliminationTreeMatches,
  buildGroups,
  rankGroup,
  advanceTreeMatch,
  getTournamentStatus,
  parseRoundAndIndex,
  advanceTimedVeto,
  applyManualVetoMove,
} from "./helpers.js";
import { respondServerError, respondWithOutcome } from "./routeHelpers.js";

const READY_CONFIRM_WINDOW_MS = 5 * 60 * 1000;
const normalizeMapScores = (input = [], maxLen = 5) => {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, Math.max(1, toInt(maxLen, 5)))
    .map((row) => ({
      teamAScore: Math.max(0, toInt(row?.teamAScore, 0)),
      teamBScore: Math.max(0, toInt(row?.teamBScore, 0)),
    }))
    .filter((row) => row.teamAScore !== row.teamBScore);
};

const buildSeriesOutcome = ({ mapScores = [], bestOf = 1, winnerTeamId = "", teamAId = "", teamBId = "" } = {}) => {
  const effectiveBestOf = [1, 3, 5].includes(toInt(bestOf, 1)) ? toInt(bestOf, 1) : 1;
  const requiredWins = Math.floor(effectiveBestOf / 2) + 1;
  const safeMaps = normalizeMapScores(mapScores, effectiveBestOf);
  if (!safeMaps.length) return { ok: false, error: "Map scores are required" };
  if (safeMaps.length > effectiveBestOf) return { ok: false, error: "Too many maps for selected bestOf" };

  let teamAScore = 0;
  let teamBScore = 0;
  safeMaps.forEach((row) => {
    if (row.teamAScore > row.teamBScore) teamAScore += 1;
    else if (row.teamBScore > row.teamAScore) teamBScore += 1;
  });

  if (teamAScore < requiredWins && teamBScore < requiredWins) {
    return { ok: false, error: "Series winner is not determined by map scores" };
  }
  if (teamAScore >= requiredWins && teamBScore >= requiredWins) {
    return { ok: false, error: "Invalid series score" };
  }

  const expectedWinnerId = teamAScore > teamBScore ? teamAId : teamBId;
  if (!expectedWinnerId || String(expectedWinnerId) !== String(winnerTeamId || "")) {
    return { ok: false, error: "Winner does not match map scores" };
  }

  return {
    ok: true,
    teamAScore,
    teamBScore,
    mapScores: safeMaps,
  };
};

function buildReadyTimeoutOutcome(match = {}, ready = {}, now = Date.now()) {
  const teamAReady = ready.teamAReady === true;
  const teamBReady = ready.teamBReady === true;
  if (teamAReady && teamBReady) return null;
  const teamA = match.teamA || null;
  const teamB = match.teamB || null;
  if (teamAReady !== teamBReady) {
    const winnerSide = teamAReady ? "A" : "B";
    const winner = winnerSide === "A" ? teamA : teamB;
    const loser = winnerSide === "A" ? teamB : teamA;
    return {
      payload: {
        status: "completed",
        winnerTeamId: winner?.teamId || null,
        teamAScore: winnerSide === "A" ? 1 : 0,
        teamBScore: winnerSide === "B" ? 1 : 0,
        winner: winner || null,
        loser: loser || null,
        forfeit: {
          type: "ready_timeout",
          loserTeamId: loser?.teamId || null,
          at: now,
        },
        readyCheck: {
          ...ready,
          status: "expired",
          updatedAt: now,
        },
      },
      error: "Ready check window expired. Technical defeat assigned.",
    };
  }
  return {
    payload: {
      status: "completed",
      winnerTeamId: null,
      teamAScore: 0,
      teamBScore: 0,
      winner: null,
      loser: null,
      forfeit: {
        type: "ready_timeout_both",
        at: now,
      },
      readyCheck: {
        ...ready,
        status: "expired_both",
        updatedAt: now,
      },
    },
    error: "Ready check window expired. Both teams received technical defeat.",
  };
}

export function registerTournamentAdminRoutes(app, ctx) {
  const {
    admin,
    db,
    logger,
    authLimiter,
    requireAuth,
    invalidateTournamentCaches,
    invalidateTeamsCaches,
    clearTournamentPublicView,
    userTournamentContextRef,
  } = ctx;
  const invalidateForTournament = (tournamentId = "") => {
    if (typeof invalidateTournamentCaches !== "function") return;
    invalidateTournamentCaches({ tournamentId: String(tournamentId || "") });
  };
  const clearPublicViewForTournament = async (tournamentId = "") => {
    if (typeof clearTournamentPublicView !== "function") return;
    await clearTournamentPublicView(String(tournamentId || ""));
  };
  const removeTournamentFromUserContexts = async (uids = [], tournamentId = "") => {
    const safeTournamentId = String(tournamentId || "").trim();
    if (!safeTournamentId || typeof userTournamentContextRef !== "function") return;
    const uniqueUids = [...new Set((uids || []).map((v) => String(v || "").trim()).filter(Boolean))];
    if (!uniqueUids.length) return;
    const removeOp = admin.firestore.FieldValue.arrayRemove(safeTournamentId);
    for (let i = 0; i < uniqueUids.length; i += 400) {
      const chunk = uniqueUids.slice(i, i + 400);
      const batch = db.batch();
      chunk.forEach((uid) => {
        batch.set(
          userTournamentContextRef(uid),
          {
            tournamentIds: removeOp,
            "payload.tournamentIds": removeOp,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      });
      await batch.commit();
    }
  };
  const syncTournamentTeamActiveLocks = async (tournamentId = "", { force = false } = {}) => {
    try {
      const safeTournamentId = String(tournamentId || "").trim();
      if (!safeTournamentId) return;
      const tournamentRef = db.collection("tournaments").doc(safeTournamentId);
      const [tournamentSnap, regsSnap] = await Promise.all([
        tournamentRef.get().catch(() => null),
        tournamentRef.collection("registrations").get().catch(() => ({ docs: [] })),
      ]);
      if (!tournamentSnap?.exists) return;
      const tournament = tournamentSnap.data() || {};
      const status = getTournamentStatus(tournament, Date.now());
      const shouldBeActive = status === "upcoming" || status === "ongoing";
      if (!force && shouldBeActive) return;

      const teamIds = [
        ...new Set(
          (regsSnap?.docs || [])
            .map((doc) => {
              const data = doc.data ? doc.data() || {} : {};
              return String(data.teamId || doc.id || "").trim();
            })
            .filter(Boolean)
        ),
      ];
      if (!teamIds.length) return;

      const opFactory = shouldBeActive
        ? admin?.firestore?.FieldValue?.arrayUnion
        : admin?.firestore?.FieldValue?.arrayRemove;
      if (typeof opFactory !== "function") return;
      const applyOp = opFactory(safeTournamentId);
      for (let i = 0; i < teamIds.length; i += 400) {
        const chunk = teamIds.slice(i, i + 400);
        const batch = db.batch();
        chunk.forEach((teamId) => {
          batch.set(
            db.collection("teams").doc(teamId),
            {
              activeTournamentIds: applyOp,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        });
        await batch.commit();
      }
    } catch (err) {
      logger?.warn?.("TOURNAMENT TEAM LOCK SYNC ERROR:", err?.message || err);
    }
  };
  const markTeamPublicStatsStale = async (teamIds = []) => {
    const safeTeamIds = [...new Set((teamIds || []).map((v) => String(v || "").trim()).filter(Boolean))];
    if (!safeTeamIds.length) return;
    for (let i = 0; i < safeTeamIds.length; i += 400) {
      const chunk = safeTeamIds.slice(i, i + 400);
      const batch = db.batch();
      chunk.forEach((teamId) => {
        batch.set(
          db.collection("team_public_stats").doc(teamId),
          {
            teamId,
            stale: true,
            updatedAt: 0,
          },
          { merge: true }
        );
      });
      await batch.commit();
    }
  };
  const reconcileTournamentCompletion = async (tournamentId = "") => {
    const safeTournamentId = String(tournamentId || "").trim();
    if (!safeTournamentId) return;
    try {
      const tournamentRef = db.collection("tournaments").doc(safeTournamentId);
      const [tournamentSnap, matchesSnap] = await Promise.all([
        tournamentRef.get().catch(() => null),
        tournamentRef.collection("matches").get().catch(() => ({ docs: [] })),
      ]);
      if (!tournamentSnap?.exists) return;
      const tournament = tournamentSnap.data() || {};
      if (tournament?.champion) return;

      const bracketType = String(tournament?.bracketType || "");
      const allMatches = Array.isArray(matchesSnap?.docs)
        ? matchesSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
        : [];
      if (!allMatches.length) return;

      let stageMatches = [];
      if (bracketType === "group_playoff") {
        stageMatches = allMatches.filter((m) => String(m?.stage || "") === "playoff");
      } else if (bracketType === "single_elimination") {
        stageMatches = allMatches.filter((m) => String(m?.stage || "single") === "single");
      } else if (bracketType === "double_elimination") {
        stageMatches = allMatches.filter((m) => String(m?.stage || "") === "grand_final");
      }
      if (!stageMatches.length) return;

      const allCompleted = stageMatches.every((m) => String(m?.status || "") === "completed");
      if (!allCompleted) return;

      const maxRound = stageMatches.reduce((acc, m) => Math.max(acc, toInt(m?.round, 0)), 0);
      const finalCandidates = stageMatches.filter((m) => toInt(m?.round, 0) === maxRound);
      if (finalCandidates.length !== 1) return;

      const finalMatch = finalCandidates[0] || {};
      const champion = finalMatch?.winner || null;
      const championTeamId = String(finalMatch?.winnerTeamId || champion?.teamId || "").trim();
      if (!championTeamId) return;

      await tournamentRef.set(
        {
          champion: champion || { teamId: championTeamId },
          endsAt: Date.now(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      logger?.warn?.("TOURNAMENT COMPLETION RECONCILE ERROR:", err?.message || err);
    }
  };
  const deleteCollectionInChunks = async (
    collectionRef,
    chunkSize = 400,
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

  const progressCompletedMatch = async ({
    tx,
    matchesRef,
    tournamentRef,
    tournament,
    matchId,
    match,
    winner,
  }) => {
    const stage = String(match.stage || "single");
    let nextMatchId = null;

    if (stage === "group") {
      return { nextMatchId };
    }

    if (stage === "single" || stage === "playoff") {
      const prefix = stage === "playoff" ? "p" : "r";
      nextMatchId = await advanceTreeMatch(
        tx,
        matchesRef,
        matchId,
        winner,
        toInt(match.round, 1),
        prefix
      );
      if (!nextMatchId) {
        tx.set(
          tournamentRef,
          {
            champion: winner,
            endsAt: Date.now(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    } else if (stage === "upper") {
      nextMatchId = await advanceTreeMatch(
        tx,
        matchesRef,
        matchId,
        winner,
        toInt(match.round, 1),
        "u"
      );

      const currentRound = toInt(match.round, 1);
      const lowerQuery = await tx.get(
        matchesRef
          .where("stage", "==", "lower")
          .where("round", "==", currentRound)
          .limit(200)
      );
      const loser = match.loser || null;
      const lowerWaiting = lowerQuery.docs
        .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
        .find((m) => !m.teamA || !m.teamB);

      if (lowerWaiting) {
        const slot = lowerWaiting.teamA ? "teamB" : "teamA";
        tx.set(
          matchesRef.doc(lowerWaiting.id),
          {
            [slot]: loser,
            status: lowerWaiting.teamA && slot === "teamB" ? "pending" : "waiting",
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      } else if (loser?.teamId) {
        const existingCount = lowerQuery.docs.length;
        const id = `l${currentRound}_m${existingCount + 1}`;
        tx.set(matchesRef.doc(id), {
          id,
          round: currentRound,
          stage: "lower",
          status: "waiting",
          teamA: loser,
          teamB: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      if (!nextMatchId) {
        tx.set(
          tournamentRef,
          {
            upperChampion: winner,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    } else if (stage === "lower") {
      nextMatchId = await advanceTreeMatch(
        tx,
        matchesRef,
        matchId,
        winner,
        toInt(match.round, 1),
        "l"
      );
      if (!nextMatchId) {
        tx.set(
          tournamentRef,
          {
            lowerChampion: winner,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    } else if (stage === "grand_final") {
      tx.set(
        tournamentRef,
        {
          champion: winner,
          endsAt: Date.now(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    if (tournament.bracketType === "double_elimination") {
      const upperChampion =
        stage === "upper" && !nextMatchId ? winner : tournament.upperChampion || null;
      const lowerChampion =
        stage === "lower" && !nextMatchId ? winner : tournament.lowerChampion || null;

      if (upperChampion && lowerChampion) {
        const gfRef = matchesRef.doc("gf1_m1");
        const gfSnap = await tx.get(gfRef);
        if (!gfSnap.exists) {
          tx.set(gfRef, {
            id: "gf1_m1",
            round: 1,
            stage: "grand_final",
            status: "pending",
            teamA: upperChampion,
            teamB: lowerChampion,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }
    }

    return { nextMatchId };
  };
  const progressDoubleForfeitMatch = async ({
    tx,
    matchesRef,
    tournamentRef,
    tournament,
    matchId,
    match,
    now = Date.now(),
  }) => {
    const stage = String(match?.stage || "single");
    if (stage === "group") return { nextMatchId: null };
    if (stage === "grand_final") {
      tx.set(
        tournamentRef,
        {
          champion: null,
          endsAt: now,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return { nextMatchId: null };
    }

    const prefix =
      stage === "playoff"
        ? "p"
        : stage === "single"
        ? "r"
        : stage === "upper"
        ? "u"
        : stage === "lower"
        ? "l"
        : "";
    if (!prefix) return { nextMatchId: null };

    const parsed = parseRoundAndIndex(matchId, toInt(match?.round, 1));
    const round = toInt(parsed?.round, toInt(match?.round, 1));
    const index = toInt(parsed?.index, 1);
    const nextRound = round + 1;
    const nextIndex = Math.ceil(index / 2);
    const nextMatchId = `${prefix}${nextRound}_m${nextIndex}`;
    const slot = index % 2 === 1 ? "teamA" : "teamB";
    const otherSlot = slot === "teamA" ? "teamB" : "teamA";

    const nextMatchRef = matchesRef.doc(nextMatchId);
    const nextMatchSnap = await tx.get(nextMatchRef);
    if (!nextMatchSnap.exists) {
      // Terminal match in single/playoff can end with double forfeit and no champion.
      if (stage === "single" || stage === "playoff") {
        tx.set(
          tournamentRef,
          {
            champion: null,
            endsAt: now,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      return { nextMatchId: null };
    }
    const nextMatch = nextMatchSnap.data() || {};
    if (String(nextMatch.status || "") === "completed") return { nextMatchId };

    const sideFromThisMatch = nextMatch?.[slot] || null;
    const opponentSide = nextMatch?.[otherSlot] || null;
    if (sideFromThisMatch?.teamId || !opponentSide?.teamId) {
      const hasOpponent = Boolean(opponentSide?.teamId);
      if (hasOpponent) return { nextMatchId };

      const siblingIndex = index % 2 === 1 ? index + 1 : index - 1;
      const siblingMatchId = `${prefix}${round}_m${siblingIndex}`;
      const siblingSnap = await tx.get(matchesRef.doc(siblingMatchId));
      const sibling = siblingSnap.exists ? siblingSnap.data() || {} : null;
      const siblingCompletedWithoutWinner =
        Boolean(sibling) &&
        String(sibling.status || "") === "completed" &&
        !String(sibling.winnerTeamId || "").trim();
      const currentCompletedWithoutWinner =
        String(match?.status || "") === "completed" &&
        !String(match?.winnerTeamId || "").trim();

      if (!siblingCompletedWithoutWinner || !currentCompletedWithoutWinner) {
        return { nextMatchId };
      }

      tx.set(
        nextMatchRef,
        {
          status: "completed",
          winnerTeamId: null,
          teamAScore: 0,
          teamBScore: 0,
          winner: null,
          loser: null,
          forfeit: {
            type: "double_forfeit_both_sources",
            sourceMatchIds: [String(matchId || ""), String(siblingMatchId || "")],
            at: now,
          },
          finishedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      const progressed = await progressDoubleForfeitMatch({
        tx,
        matchesRef,
        tournamentRef,
        tournament,
        matchId: nextMatchId,
        match: {
          ...nextMatch,
          status: "completed",
          winnerTeamId: null,
          winner: null,
          loser: null,
        },
        now,
      });
      return { nextMatchId: progressed?.nextMatchId || nextMatchId };
    }

    const winner = opponentSide;
    const loser = null;
    tx.set(
      nextMatchRef,
      {
        status: "completed",
        winnerTeamId: winner.teamId || null,
        teamAScore: otherSlot === "teamA" ? 1 : 0,
        teamBScore: otherSlot === "teamB" ? 1 : 0,
        winner,
        loser,
        forfeit: {
          type: "opponent_absent",
          sourceMatchId: String(matchId || ""),
          at: now,
        },
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const progressed = await progressCompletedMatch({
      tx,
      matchesRef,
      tournamentRef,
      tournament,
      matchId: nextMatchId,
      match: {
        ...nextMatch,
        status: "completed",
        winnerTeamId: winner.teamId || null,
        winner,
        loser,
      },
      winner,
    });
    return { nextMatchId: progressed?.nextMatchId || nextMatchId };
  };

  app.post("/tournaments", authLimiter, requireAuth, async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return res.status(403).json({ error: "Forbidden" });

      const {
        title,
        description = "",
        rules = "",
        prizePool = "",
        logoUrl = "",
        teamFormat = "5x5",
        bracketType = "single_elimination",
        maxTeams = 8,
        requirements = {},
        startsAt,
      } = req.body || {};

      const cleanTitle = String(title || "").trim();
      if (!cleanTitle) return res.status(400).json({ error: "Title is required" });
      if (!ALLOWED_TEAM_FORMATS.has(teamFormat)) {
        return res.status(400).json({ error: "Invalid team format" });
      }
      if (!ALLOWED_BRACKET_TYPES.has(bracketType)) {
        return res.status(400).json({ error: "Invalid bracket type" });
      }
      const cleanLogoUrl = String(logoUrl || "").trim();
      if (cleanLogoUrl && cleanLogoUrl.length > 1_500_000) {
        return res.status(400).json({ error: "Logo is too large" });
      }
      const maxTeamsNum = toInt(maxTeams, 0);
      if (!ALLOWED_MAX_TEAMS.has(maxTeamsNum)) {
        return res.status(400).json({ error: "Invalid max teams value" });
      }
      const startsAtNum = toMillis(startsAt, null);
      if (!startsAtNum) {
        return res.status(400).json({ error: "Invalid tournament start date" });
      }

      const payload = {
        title: cleanTitle,
        description: String(description || "").trim(),
        rules: String(rules || "").trim(),
        prizePool: String(prizePool || "").trim(),
        logoUrl: cleanLogoUrl,
        teamFormat,
        bracketType,
        maxTeams: maxTeamsNum,
        registeredTeams: 0,
        requirements: {
          minElo: Math.max(0, toInt(requirements?.minElo, 0)),
          minMatches: Math.max(0, toInt(requirements?.minMatches, 0)),
        },
        startsAt: startsAtNum,
        createdBy: req.user.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const ref = await db.collection("tournaments").add(payload);
      if (typeof invalidateTournamentCaches === "function") invalidateTournamentCaches();
      await clearPublicViewForTournament(ref.id);
      return res.json({ ok: true, id: ref.id });
    } catch (err) {
      return respondServerError(
        res,
        logger,
        "TOURNAMENT CREATE ERROR",
        "Failed to create tournament",
        err
      );
    }
  });

  app.delete("/tournaments/:id", authLimiter, requireAuth, async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return res.status(403).json({ error: "Forbidden" });
      const tournamentId = String(req.params.id || "");
      if (!tournamentId) return res.status(400).json({ error: "Tournament id is required" });

      const tournamentRef = db.collection("tournaments").doc(tournamentId);
      const tournamentSnap = await tournamentRef.get().catch(() => null);
      if (!tournamentSnap?.exists) {
        return res.json({
          ok: true,
          alreadyDeleted: true,
          deletedMatches: 0,
          deletedRegistrations: 0,
        });
      }

      let deletedMatches = 0;
      let deletedRegistrations = 0;
      const affectedUserUids = new Set();
      const affectedTeamIds = new Set();
      try {
        const regsSnap = await tournamentRef.collection("registrations").get();
        regsSnap.docs.forEach((doc) => {
          const reg = doc.data() || {};
          const teamId = String(reg.teamId || doc.id || "").trim();
          if (teamId) affectedTeamIds.add(teamId);
          const members = Array.isArray(reg.memberUids) ? reg.memberUids : [];
          members.forEach((memberUid) => {
            const safeUid = String(memberUid || "").trim();
            if (safeUid) affectedUserUids.add(safeUid);
          });
        });
      } catch (err) {
        logger.warn("TOURNAMENT DELETE CONTEXT PRELOAD ERROR:", err?.message || err);
      }
      try {
        deletedMatches = await deleteCollectionInChunks(
          tournamentRef.collection("matches"),
          400,
          "matches"
        );
        deletedRegistrations = await deleteCollectionInChunks(
          tournamentRef.collection("registrations"),
          400,
          "registrations"
        );
      } catch (err) {
        logger.error("TOURNAMENT DELETE SUBCOLLECTION ERROR:", err);
        return res.status(500).json({
          ok: false,
          error: "Failed to delete tournament data",
          deletedMatches,
          deletedRegistrations,
        });
      }

      try {
        await tournamentRef.delete();
      } catch (err) {
        logger.error("TOURNAMENT DELETE DOC ERROR:", err);
        return res.status(500).json({
          ok: false,
          error: "Failed to delete tournament",
          deletedMatches,
          deletedRegistrations,
        });
      }
      try {
        await removeTournamentFromUserContexts([...affectedUserUids], tournamentId);
      } catch (err) {
        logger.warn("TOURNAMENT DELETE CONTEXT CLEANUP ERROR:", err);
      }
      try {
        const removeOp = admin.firestore.FieldValue.arrayRemove(tournamentId);
        const teamIds = [...affectedTeamIds];
        for (let i = 0; i < teamIds.length; i += 400) {
          const chunk = teamIds.slice(i, i + 400);
          const batch = db.batch();
          chunk.forEach((teamId) => {
            batch.set(
              db.collection("teams").doc(teamId),
              {
                activeTournamentIds: removeOp,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          });
          await batch.commit();
        }
      } catch (err) {
        logger.warn("TOURNAMENT DELETE TEAM LOCK CLEANUP ERROR:", err);
      }
      try {
        const teamIds = [...affectedTeamIds];
        if (teamIds.length) {
          await markTeamPublicStatsStale(teamIds);
          if (typeof invalidateTeamsCaches === "function") {
            teamIds.forEach((teamId) => invalidateTeamsCaches({ teamId }));
          }
        }
      } catch (err) {
        logger.warn("TOURNAMENT DELETE TEAM PUBLIC STATS STALE ERROR:", err);
      }
      invalidateForTournament(tournamentId);
      await clearPublicViewForTournament(tournamentId);
      return res.json({
        ok: true,
        deletedMatches,
        deletedRegistrations,
      });
    } catch (err) {
      return respondServerError(
        res,
        logger,
        "TOURNAMENT DELETE ERROR",
        "Failed to delete tournament",
        err
      );
    }
  });
  app.post(
    "/tournaments/:id/generate-bracket",
    authLimiter,
    requireAuth,
    async (req, res) => {
      try {
        if (!isAdminUser(req.user)) return res.status(403).json({ error: "Forbidden" });
        const tournamentId = String(req.params.id || "");
        if (!tournamentId) return res.status(400).json({ error: "Tournament id is required" });
        const tournamentRef = db.collection("tournaments").doc(tournamentId);
        const matchesRef = tournamentRef.collection("matches");

        const tournamentSnap = await tournamentRef.get();
        if (!tournamentSnap.exists) return res.status(404).json({ error: "Tournament not found" });
        const tournament = tournamentSnap.data() || {};

        const regsSnap = await tournamentRef.collection("registrations").get();
        const participants = regsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
        if (participants.length < 2) return res.status(409).json({ error: "Not enough participants" });

        const existingMatches = await matchesRef.get();
        if (!existingMatches.empty) {
          const delBatch = db.batch();
          existingMatches.docs.forEach((doc) => delBatch.delete(doc.ref));
          await delBatch.commit();
        }

        const matches = [];

        if (tournament.bracketType === "group_playoff") {
          const groups = buildGroups(participants);
          groups.forEach((group) => {
            const teams = group.items.map((item) => normalizeTeamFromRegistration(item));
            let idx = 1;
            for (let i = 0; i < teams.length; i += 1) {
              for (let j = i + 1; j < teams.length; j += 1) {
                matches.push({
                  id: `g_${group.key}_m${idx}`,
                  round: 1,
                  stage: "group",
                  group: group.key,
                  status: "pending",
                  teamA: teams[i],
                  teamB: teams[j],
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                });
                idx += 1;
              }
            }
          });
        } else {
          const stage = tournament.bracketType === "double_elimination" ? "upper" : "single";
          const prefix = tournament.bracketType === "double_elimination" ? "u" : "r";
          const treeMatches = buildEliminationTreeMatches(participants, stage, prefix);
          matches.push(...treeMatches);
        }

        const batch = db.batch();
        matches.forEach((match) => {
          const ref = matchesRef.doc(match.id);
          batch.set(ref, match);
        });
        batch.update(tournamentRef, {
          bracketGeneratedAt: Date.now(),
          bracketGeneratedBy: req.user.uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await batch.commit();

        invalidateForTournament(tournamentId);
        await clearPublicViewForTournament(tournamentId);
        return res.json({ ok: true, matches: matches.length });
      } catch (err) {
        return respondServerError(
          res,
          logger,
          "TOURNAMENT BRACKET GENERATE ERROR",
          "Failed to generate bracket",
          err
        );
      }
    }
  );

  app.post(
    "/tournaments/:id/generate-playoff",
    authLimiter,
    requireAuth,
    async (req, res) => {
      try {
        if (!isAdminUser(req.user)) return res.status(403).json({ error: "Forbidden" });
        const tournamentId = String(req.params.id || "");
        if (!tournamentId) return res.status(400).json({ error: "Tournament id is required" });
        const tournamentRef = db.collection("tournaments").doc(tournamentId);
        const matchesRef = tournamentRef.collection("matches");

        const [tournamentSnap, regsSnap, matchesSnap] = await Promise.all([
          tournamentRef.get(),
          tournamentRef.collection("registrations").get(),
          matchesRef.get(),
        ]);
        if (!tournamentSnap.exists) return res.status(404).json({ error: "Tournament not found" });
        const tournament = tournamentSnap.data() || {};
        if (tournament.bracketType !== "group_playoff") {
          return res.status(409).json({ error: "Playoff is available only for group + playoff" });
        }

        const allMatches = matchesSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        const groupMatches = allMatches.filter((m) => m.stage === "group");
        if (!groupMatches.length) {
          return res.status(409).json({ error: "Group stage not generated" });
        }
        const incompleteGroup = groupMatches.find((m) => m.status !== "completed");
        if (incompleteGroup) {
          return res.status(409).json({ error: "Complete all group matches first" });
        }

        const byGroup = new Map();
        groupMatches.forEach((m) => {
          const key = m.group || "A";
          if (!byGroup.has(key)) byGroup.set(key, []);
          byGroup.get(key).push(m);
        });
        const regByTeamId = new Map(
          regsSnap.docs.map((doc) => [doc.id, { id: doc.id, ...(doc.data() || {}) }])
        );

        const qualifiers = [];
        [...byGroup.entries()]
          .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
          .forEach(([, matches]) => {
            const ranking = rankGroup(matches, regByTeamId);
            // Keep top-2 per group. The playoff tree builder below handles odd
            // qualifier counts via bye advancement, so no team is dropped.
            ranking.slice(0, 2).forEach((r) => {
              const reg = regByTeamId.get(r.teamId);
              if (!reg) return;
              qualifiers.push({
                id: reg.id,
                ...reg,
                avgEloSnapshot: toInt(reg.avgEloSnapshot, 0),
              });
            });
          });

        if (qualifiers.length < 2) {
          return res.status(409).json({ error: "Not enough playoff qualifiers" });
        }

        const existingPlayoff = allMatches.filter((m) => m.stage === "playoff");
        if (existingPlayoff.length) {
          const delBatch = db.batch();
          existingPlayoff.forEach((m) => delBatch.delete(matchesRef.doc(m.id)));
          await delBatch.commit();
        }

        const playoffMatches = buildEliminationTreeMatches(qualifiers, "playoff", "p");
        const batch = db.batch();
        playoffMatches.forEach((match) => {
          const id = String(match.id || "");
          if (!id) return;
          batch.set(matchesRef.doc(id), {
            ...match,
            id,
            stage: "playoff",
          });
        });
        batch.update(tournamentRef, {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await batch.commit();

        invalidateForTournament(tournamentId);
        await clearPublicViewForTournament(tournamentId);
        return res.json({ ok: true, matches: playoffMatches.length });
      } catch (err) {
        return respondServerError(
          res,
          logger,
          "TOURNAMENT PLAYOFF GENERATE ERROR",
          "Failed to generate playoff",
          err
        );
      }
    }
  );

  app.post(
    "/tournaments/:id/matches/:matchId/ready",
    authLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const tournamentId = String(req.params.id || "");
        const matchId = String(req.params.matchId || "");
        const uid = String(req.user?.uid || "");
        if (!uid || !tournamentId || !matchId) {
          return res.status(400).json({ error: "Invalid params" });
        }

        const tournamentRef = db.collection("tournaments").doc(tournamentId);
        const matchRef = tournamentRef.collection("matches").doc(matchId);
        const matchesRef = tournamentRef.collection("matches");
        const now = Date.now();

        const outcome = await db.runTransaction(async (tx) => {
          const [tournamentSnap, matchSnap] = await Promise.all([
            tx.get(tournamentRef),
            tx.get(matchRef),
          ]);
          if (!tournamentSnap.exists) return { status: 404, error: "Tournament not found" };
          if (!matchSnap.exists) return { status: 404, error: "Match not found" };

          const match = matchSnap.data() || {};
          const teamAId = String(match?.teamA?.teamId || "");
          const teamBId = String(match?.teamB?.teamId || "");
          if (!teamAId || !teamBId) return { status: 409, error: "Match teams are not ready" };
          if (String(match.status || "") === "completed") {
            return { status: 409, error: "Match already completed" };
          }

          const scheduledAt = toInt(match.scheduledAt, null);
          if (!scheduledAt) return { status: 409, error: "Match schedule is not set" };
          if (now < scheduledAt) {
            return { status: 409, error: "Ready check is locked until match start" };
          }

          const deadlineAt = scheduledAt + READY_CONFIRM_WINDOW_MS;
          const existingReady = match.readyCheck || {};
          const teamAReady = existingReady.teamAReady === true;
          const teamBReady = existingReady.teamBReady === true;
          if (now > deadlineAt && (!teamAReady || !teamBReady)) {
            const timeout = buildReadyTimeoutOutcome(match, existingReady, now);
            const timeoutPayload = timeout?.payload || {};
            tx.set(
              matchRef,
              {
                ...timeoutPayload,
                finishedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );

            let nextMatchId = null;
            const winnerTeamId = String(timeoutPayload.winnerTeamId || "");
            const winner = timeoutPayload.winner || null;
            if (winnerTeamId && winner?.teamId) {
              const progressed = await progressCompletedMatch({
                tx,
                matchesRef,
                tournamentRef,
                tournament: tournamentSnap.data() || {},
                matchId,
                match: {
                  ...match,
                  winner: timeoutPayload.winner || null,
                  loser: timeoutPayload.loser || null,
                },
                winner,
              });
              nextMatchId = progressed?.nextMatchId || null;
            } else if (String(timeoutPayload?.forfeit?.type || "") === "ready_timeout_both") {
              const progressed = await progressDoubleForfeitMatch({
                tx,
                matchesRef,
                tournamentRef,
                tournament: tournamentSnap.data() || {},
                matchId,
                match,
                now,
              });
              nextMatchId = progressed?.nextMatchId || null;
            }

            return {
              ok: true,
              technicalForfeit: true,
              doubleForfeit: String(timeoutPayload?.forfeit?.type || "") === "ready_timeout_both",
              readyCheck: timeoutPayload.readyCheck || null,
              nextMatchId,
            };
          }

          const [regASnap, regBSnap] = await Promise.all([
            tx.get(tournamentRef.collection("registrations").doc(teamAId)),
            tx.get(tournamentRef.collection("registrations").doc(teamBId)),
          ]);
          const regA = regASnap.exists ? regASnap.data() || {} : {};
          const regB = regBSnap.exists ? regBSnap.data() || {} : {};
          const captainA = String(regA.captainUid || teamAId);
          const captainB = String(regB.captainUid || teamBId);
          const isCaptainForA = uid === captainA;
          const isCaptainForB = uid === captainB;
          if (!isCaptainForA && !isCaptainForB) {
            return { status: 403, error: "Only captains can confirm readiness" };
          }

          const nextReady = {
            teamAReady,
            teamBReady,
            teamAReadyAt: toInt(existingReady.teamAReadyAt, null),
            teamBReadyAt: toInt(existingReady.teamBReadyAt, null),
          };

          if (isCaptainForA && !nextReady.teamAReady) {
            nextReady.teamAReady = true;
            nextReady.teamAReadyAt = now;
          }
          if (isCaptainForB && !nextReady.teamBReady) {
            nextReady.teamBReady = true;
            nextReady.teamBReadyAt = now;
          }

          const status = now > deadlineAt && (!nextReady.teamAReady || !nextReady.teamBReady)
            ? "expired"
            : nextReady.teamAReady && nextReady.teamBReady
            ? "ready"
            : "in_progress";
          const vetoOpensAt =
            nextReady.teamAReady && nextReady.teamBReady
              ? toInt(existingReady.vetoOpensAt, now + VETO_READY_DELAY_MS)
              : null;
          const readyCheck = {
            status,
            windowStartAt: scheduledAt,
            deadlineAt,
            vetoOpensAt,
            teamAReady: nextReady.teamAReady,
            teamBReady: nextReady.teamBReady,
            teamAReadyAt: nextReady.teamAReadyAt,
            teamBReadyAt: nextReady.teamBReadyAt,
            updatedAt: now,
          };

          tx.set(
            matchRef,
            {
              readyCheck,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          return { ok: true, readyCheck };
        });

        if (outcome?.ok) await syncTournamentTeamActiveLocks(tournamentId);
        if (outcome?.ok) invalidateForTournament(tournamentId);
        if (outcome?.ok) await clearPublicViewForTournament(tournamentId);
        return respondWithOutcome(res, outcome, {
          ok: true,
          readyCheck: outcome?.readyCheck || null,
          technicalForfeit: Boolean(outcome?.technicalForfeit),
          doubleForfeit: Boolean(outcome?.doubleForfeit),
          nextMatchId: outcome?.nextMatchId || null,
        });
      } catch (err) {
        return respondServerError(
          res,
          logger,
          "TOURNAMENT MATCH READY ERROR",
          "Failed to confirm readiness",
          err
        );
      }
    }
  );

  app.post(
    "/tournaments/:id/matches/:matchId/veto",
    authLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const tournamentId = String(req.params.id || "");
        const matchId = String(req.params.matchId || "");
        const action = String(req.body?.action || "").toLowerCase();
        const mapName = String(req.body?.map || "").trim();
        const uid = String(req.user?.uid || "");
        if (!uid || !tournamentId || !matchId || !mapName) {
          return res.status(400).json({ error: "Invalid params" });
        }

        const tournamentRef = db.collection("tournaments").doc(tournamentId);
        const matchRef = tournamentRef.collection("matches").doc(matchId);
        const matchesRef = tournamentRef.collection("matches");
        const now = Date.now();

        const outcome = await db.runTransaction(async (tx) => {
          const [tournamentSnap, matchSnap] = await Promise.all([
            tx.get(tournamentRef),
            tx.get(matchRef),
          ]);
          if (!tournamentSnap.exists) return { status: 404, error: "Tournament not found" };
          if (!matchSnap.exists) return { status: 404, error: "Match not found" };

          const tournament = tournamentSnap.data() || {};
          const match = matchSnap.data() || {};
          const teamAId = String(match?.teamA?.teamId || "");
          const teamBId = String(match?.teamB?.teamId || "");
          if (!teamAId || !teamBId) return { status: 409, error: "Match teams are not ready" };
          if (String(match.status || "") === "completed") {
            return { status: 409, error: "Match already completed" };
          }

          const scheduledAt = toInt(match.scheduledAt, null);
          if (!scheduledAt || now < scheduledAt) {
            return { status: 409, error: "Ban/pick is locked until match start" };
          }
          const deadlineAt = scheduledAt + READY_CONFIRM_WINDOW_MS;
          const ready = match.readyCheck || {};
          const teamAReady = ready.teamAReady === true;
          const teamBReady = ready.teamBReady === true;
          if (now > deadlineAt && (!teamAReady || !teamBReady)) {
            const timeout = buildReadyTimeoutOutcome(match, ready, now);
            const timeoutPayload = timeout?.payload || {};
            tx.set(
              matchRef,
              {
                ...timeoutPayload,
                finishedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );

            let nextMatchId = null;
            const winnerTeamId = String(timeoutPayload.winnerTeamId || "");
            const winner = timeoutPayload.winner || null;
            if (winnerTeamId && winner?.teamId) {
              const progressed = await progressCompletedMatch({
                tx,
                matchesRef,
                tournamentRef,
                tournament: tournamentSnap.data() || {},
                matchId,
                match: {
                  ...match,
                  winner: timeoutPayload.winner || null,
                  loser: timeoutPayload.loser || null,
                },
                winner,
              });
              nextMatchId = progressed?.nextMatchId || null;
            } else if (String(timeoutPayload?.forfeit?.type || "") === "ready_timeout_both") {
              const progressed = await progressDoubleForfeitMatch({
                tx,
                matchesRef,
                tournamentRef,
                tournament: tournamentSnap.data() || {},
                matchId,
                match,
                now,
              });
              nextMatchId = progressed?.nextMatchId || null;
            }

            return {
              ok: true,
              technicalForfeit: true,
              doubleForfeit: String(timeoutPayload?.forfeit?.type || "") === "ready_timeout_both",
              veto: match.veto || null,
              nextMatchId,
            };
          }
          if (!teamAReady || !teamBReady) {
            return { status: 409, error: "Both captains must confirm readiness first" };
          }
          const vetoOpensAt = toInt(ready.vetoOpensAt, null);
          if (!vetoOpensAt || now < vetoOpensAt) {
            return { status: 409, error: "Ban/pick will open in 30 seconds after readiness check" };
          }

          const [regASnap, regBSnap] = await Promise.all([
            tx.get(tournamentRef.collection("registrations").doc(teamAId)),
            tx.get(tournamentRef.collection("registrations").doc(teamBId)),
          ]);
          const regA = regASnap.exists ? regASnap.data() || {} : {};
          const regB = regBSnap.exists ? regBSnap.data() || {} : {};
          const captainA = String(regA.captainUid || teamAId);
          const captainB = String(regB.captainUid || teamBId);
          const captainTeamId = uid === captainA ? teamAId : uid === captainB ? teamBId : "";
          if (!captainTeamId) return { status: 403, error: "Only captains can use ban/pick" };

          const mapPool = normalizeMapPool(tournament.mapPool || DEFAULT_MAP_POOL);
          if (mapPool.length < 2) return { status: 409, error: "Map pool is not configured" };

          const evolved = advanceTimedVeto(
            {
              ...match,
              readyCheck: {
                ...ready,
                vetoOpensAt,
              },
            },
            mapPool,
            now
          );
          const existing = evolved.veto || {};
          if (evolved.changed) {
            tx.set(
              matchRef,
              {
                veto: existing,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }
          const nextAction = String(existing.nextAction || "").toLowerCase();
          if (!["ban", "pick"].includes(nextAction)) {
            return { status: 409, error: "Ban/pick already completed" };
          }
          if (action && action !== nextAction) {
            return { status: 409, error: `Expected action ${nextAction}` };
          }

          const manual = applyManualVetoMove(
            {
              ...match,
              veto: existing,
            },
            mapPool,
            {
              now,
              mapName,
              teamId: captainTeamId,
              uid,
              action: action || nextAction,
            }
          );
          if (!manual?.ok) {
            return { status: 409, error: manual?.error || "Failed to apply veto step" };
          }
          const nextVeto = manual.veto || existing;

          tx.set(
            matchRef,
            {
              veto: nextVeto,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          return { ok: true, veto: nextVeto };
        });

        if (outcome?.ok) await syncTournamentTeamActiveLocks(tournamentId);
        if (outcome?.ok) invalidateForTournament(tournamentId);
        if (outcome?.ok) await clearPublicViewForTournament(tournamentId);
        return respondWithOutcome(res, outcome, {
          ok: true,
          veto: outcome?.veto || null,
          technicalForfeit: Boolean(outcome?.technicalForfeit),
          doubleForfeit: Boolean(outcome?.doubleForfeit),
          nextMatchId: outcome?.nextMatchId || null,
        });
      } catch (err) {
        return respondServerError(
          res,
          logger,
          "TOURNAMENT MATCH VETO ERROR",
          "Failed to apply ban/pick",
          err
        );
      }
    }
  );

  app.post(
    "/tournaments/:id/matches/:matchId/result",
    authLimiter,
    requireAuth,
    async (req, res) => {
      try {
        if (!isAdminUser(req.user)) return res.status(403).json({ error: "Forbidden" });
        const tournamentId = String(req.params.id || "");
        const matchId = String(req.params.matchId || "");
        const winnerTeamId = String(req.body?.winnerTeamId || "").trim();
        const hasWinner = Boolean(winnerTeamId);
        const reset = req.body?.reset === true;
        const hasScheduledAtField = Object.prototype.hasOwnProperty.call(req.body || {}, "scheduledAt");
        const hasBestOfField = Object.prototype.hasOwnProperty.call(req.body || {}, "bestOf");
        const hasMapScoresField = Object.prototype.hasOwnProperty.call(req.body || {}, "mapScores");
        const scheduledAtRaw = req.body?.scheduledAt;
        const bestOfRaw = req.body?.bestOf;
        const mapScoresRaw = req.body?.mapScores;
        let scheduledAt = null;
        let bestOf = null;
        if (hasScheduledAtField) {
          if (scheduledAtRaw === null || scheduledAtRaw === "") {
            scheduledAt = null;
          } else {
            const parsed = Date.parse(String(scheduledAtRaw));
            if (!Number.isFinite(parsed)) {
              return res.status(400).json({ error: "Invalid match schedule date" });
            }
            scheduledAt = parsed;
          }
        }
        if (hasBestOfField) {
          const parsedBestOf = toInt(bestOfRaw, 0);
          if (![1, 3, 5].includes(parsedBestOf)) {
            return res.status(400).json({ error: "bestOf must be one of 1, 3, 5" });
          }
          bestOf = parsedBestOf;
        }
        const teamAScoreRaw = req.body?.teamAScore;
        const teamBScoreRaw = req.body?.teamBScore;
        if (!tournamentId || !matchId || (!reset && !hasWinner && !hasScheduledAtField && !hasBestOfField)) {
          return res.status(400).json({
            error: "Tournament id and match id required, plus winnerTeamId, scheduledAt or bestOf",
          });
        }

        const tournamentRef = db.collection("tournaments").doc(tournamentId);
        const matchRef = tournamentRef.collection("matches").doc(matchId);

        const outcome = await db.runTransaction(async (tx) => {
          const tournamentSnap = await tx.get(tournamentRef);
          if (!tournamentSnap.exists) return { status: 404, error: "Tournament not found" };
          const tournament = tournamentSnap.data() || {};
          const matchesRef = tournamentRef.collection("matches");

          const matchSnap = await tx.get(matchRef);
          if (!matchSnap.exists) return { status: 404, error: "Match not found" };
          const match = matchSnap.data() || {};

          if (reset) {
            const allMatches = [];
            // Read the full matches collection in pages to avoid truncating
            // reset propagation for large brackets.
            if (
              typeof matchesRef.orderBy === "function" &&
              typeof admin?.firestore?.FieldPath?.documentId === "function"
            ) {
              let lastDoc = null;
              while (true) {
                let query = matchesRef
                  .orderBy(admin.firestore.FieldPath.documentId())
                  .limit(500);
                if (lastDoc && typeof query.startAfter === "function") {
                  query = query.startAfter(lastDoc);
                }
                const pageSnap = await tx.get(query);
                if (!pageSnap || pageSnap.empty) break;
                pageSnap.docs.forEach((doc) => {
                  allMatches.push({ id: doc.id, ...(doc.data() || {}) });
                });
                lastDoc = pageSnap.docs[pageSnap.docs.length - 1];
              }
            } else {
              // Fallback for simplified test doubles.
              const allMatchesSnap = await tx.get(matchesRef.limit(1000));
              allMatchesSnap.docs.forEach((doc) => {
                allMatches.push({ id: doc.id, ...(doc.data() || {}) });
              });
            }

            const invalidTeamIds = new Set();
            const winnerId = String(match?.winnerTeamId || "");
            const loserId = String(match?.loser?.teamId || "");
            const winnerTeamObjId = String(match?.winner?.teamId || "");
            const loserTeamObjId = String(match?.loser?.teamId || "");
            if (winnerId) invalidTeamIds.add(winnerId);
            if (loserId) invalidTeamIds.add(loserId);
            if (winnerTeamObjId) invalidTeamIds.add(winnerTeamObjId);
            if (loserTeamObjId) invalidTeamIds.add(loserTeamObjId);

            const clearPlan = new Map();
            const queue = [...invalidTeamIds];
            const seenTeamIds = new Set();

            while (queue.length > 0) {
              const teamId = String(queue.shift() || "");
              if (!teamId || seenTeamIds.has(teamId)) continue;
              seenTeamIds.add(teamId);

              allMatches.forEach((m) => {
                if (m.id === matchId) return;
                if (String(m.stage || "") === "group") return;
                const teamAId = String(m?.teamA?.teamId || "");
                const teamBId = String(m?.teamB?.teamId || "");
                if (teamAId !== teamId && teamBId !== teamId) return;

                const planned = clearPlan.get(m.id) || { clearA: false, clearB: false, match: m };
                if (teamAId === teamId) planned.clearA = true;
                if (teamBId === teamId) planned.clearB = true;
                clearPlan.set(m.id, planned);

                const mWinnerId = String(m?.winnerTeamId || m?.winner?.teamId || "");
                const mLoserId = String(m?.loser?.teamId || "");
                if (mWinnerId && !seenTeamIds.has(mWinnerId)) queue.push(mWinnerId);
                if (mLoserId && !seenTeamIds.has(mLoserId)) queue.push(mLoserId);
              });
            }

            tx.set(
              matchRef,
              {
                status: "pending",
                winnerTeamId: null,
                teamAScore: 0,
                teamBScore: 0,
                mapScores: [],
                winner: null,
                loser: null,
                finishedAt: null,
                scheduledAt: null,
                readyCheck: null,
                veto: null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );

            clearPlan.forEach((plan, dependentMatchId) => {
              const src = plan.match || {};
              const nextTeamA = plan.clearA ? null : src.teamA || null;
              const nextTeamB = plan.clearB ? null : src.teamB || null;
              const nextStatus = nextTeamA && nextTeamB ? "pending" : "waiting";

              tx.set(
                matchesRef.doc(dependentMatchId),
                {
                  teamA: nextTeamA,
                  teamB: nextTeamB,
                  status: nextStatus,
                  winnerTeamId: null,
                  teamAScore: 0,
                  teamBScore: 0,
                  mapScores: [],
                  winner: null,
                  loser: null,
                  finishedAt: null,
                  scheduledAt: null,
                  readyCheck: null,
                  veto: null,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
                { merge: true }
              );
            });

            tx.set(
              tournamentRef,
              {
                champion: null,
                upperChampion: null,
                lowerChampion: null,
                endsAt: null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
            return { ok: true, nextMatchId: null, affectedTeamIds: [...seenTeamIds] };
          }

          if (!hasWinner && (hasScheduledAtField || hasBestOfField)) {
            if (String(match.status || "") === "completed") {
              return { status: 409, error: "Cannot edit completed match" };
            }
            const updatePayload = {
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            if (hasScheduledAtField) updatePayload.scheduledAt = scheduledAt;
            if (hasScheduledAtField) updatePayload.readyCheck = null;
            if (hasScheduledAtField) updatePayload.veto = null;
            if (hasBestOfField) updatePayload.bestOf = bestOf;
            if (hasBestOfField || hasScheduledAtField) updatePayload.mapScores = [];
            tx.set(
              matchRef,
              updatePayload,
              { merge: true }
            );
            return { ok: true, nextMatchId: null };
          }

          const teamA = match.teamA || null;
          const teamB = match.teamB || null;
          if (match.status === "completed") {
            const existingWinnerTeamId = String(match?.winnerTeamId || "").trim();
            if (hasWinner && existingWinnerTeamId && existingWinnerTeamId === winnerTeamId) {
              return {
                ok: true,
                alreadyCompleted: true,
                nextMatchId: null,
                affectedTeamIds: normalizeUidList([teamA?.teamId, teamB?.teamId]),
              };
            }
            return { status: 409, error: "Match result already set" };
          }
          const winnerSide =
            teamA?.teamId === winnerTeamId
              ? "A"
              : teamB?.teamId === winnerTeamId
              ? "B"
              : null;
          if (!winnerSide) {
            return { status: 400, error: "winnerTeamId must be teamA or teamB" };
          }

          const winner = winnerSide === "A" ? teamA : teamB;
          const loser = winnerSide === "A" ? teamB : teamA;
          const effectiveBestOf = hasBestOfField
            ? bestOf
            : ([1, 3, 5].includes(toInt(match?.bestOf, 1)) ? toInt(match?.bestOf, 1) : 1);
          const hasIncomingMapScores = hasMapScoresField && Array.isArray(mapScoresRaw) && mapScoresRaw.length > 0;
          let teamAScore = toInt(teamAScoreRaw, 0);
          let teamBScore = toInt(teamBScoreRaw, 0);
          let mapScores = [];
          if (hasIncomingMapScores) {
            const outcomeFromMaps = buildSeriesOutcome({
              mapScores: mapScoresRaw,
              bestOf: effectiveBestOf,
              winnerTeamId,
              teamAId: teamA?.teamId || "",
              teamBId: teamB?.teamId || "",
            });
            if (!outcomeFromMaps.ok) {
              return { status: 400, error: outcomeFromMaps.error || "Invalid map scores" };
            }
            teamAScore = outcomeFromMaps.teamAScore;
            teamBScore = outcomeFromMaps.teamBScore;
            mapScores = outcomeFromMaps.mapScores;
          } else if (effectiveBestOf > 1) {
            const requiredWins = Math.floor(effectiveBestOf / 2) + 1;
            const expectedWinner = winnerSide === "A" ? "A" : "B";
            const hasSeriesWinner =
              teamAScore >= requiredWins || teamBScore >= requiredWins;
            const winnerMatchesScore =
              expectedWinner === "A" ? teamAScore > teamBScore : teamBScore > teamAScore;
            if (!hasSeriesWinner || !winnerMatchesScore) {
              return { status: 400, error: "Invalid series score for selected bestOf" };
            }
          }

          tx.set(
            matchRef,
            {
              status: "completed",
              winnerTeamId: winner.teamId || winnerTeamId,
              teamAScore,
              teamBScore,
              mapScores,
              scheduledAt: hasScheduledAtField ? scheduledAt : match?.scheduledAt ?? null,
              bestOf: hasBestOfField ? bestOf : toInt(match?.bestOf, 1) || 1,
              winner: winner || null,
              loser: loser || null,
              finishedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          let progressed = null;
          try {
            progressed = await progressCompletedMatch({
              tx,
              matchesRef,
              tournamentRef,
              tournament,
              matchId,
              match: {
                ...match,
                winner,
                loser,
              },
              winner,
            });
          } catch (progressErr) {
            logger?.warn?.(
              "TOURNAMENT MATCH RESULT PROGRESSION ERROR:",
              progressErr?.message || progressErr
            );
            progressed = null;
          }

          return {
            ok: true,
            nextMatchId: progressed?.nextMatchId || null,
            affectedTeamIds: normalizeUidList([teamA?.teamId, teamB?.teamId]),
          };
        });

        if (outcome?.ok) {
          try {
            await syncTournamentTeamActiveLocks(tournamentId, { force: reset === true });
          } catch (postErr) {
            logger?.warn?.("TOURNAMENT MATCH RESULT POST-SYNC ERROR:", postErr?.message || postErr);
          }
          try {
            invalidateForTournament(tournamentId);
          } catch (postErr) {
            logger?.warn?.("TOURNAMENT MATCH RESULT POST-INVALIDATE ERROR:", postErr?.message || postErr);
          }
          try {
            await clearPublicViewForTournament(tournamentId);
          } catch (postErr) {
            logger?.warn?.("TOURNAMENT MATCH RESULT POST-PUBLIC-VIEW ERROR:", postErr?.message || postErr);
          }
        }
        if (outcome?.ok && (reset === true || hasWinner)) {
          try {
            const chatCollectionRef = db
              .collection("tournaments")
              .doc(tournamentId)
              .collection("matches")
              .doc(matchId)
              .collection("chat");
            await deleteCollectionInChunks(chatCollectionRef, 200, "match chat");
          } catch (postErr) {
            logger?.warn?.("TOURNAMENT MATCH RESULT POST-CHAT-CLEANUP ERROR:", postErr?.message || postErr);
          }
        }
        if (outcome?.ok && hasWinner) {
          try {
            await reconcileTournamentCompletion(tournamentId);
          } catch (postErr) {
            logger?.warn?.("TOURNAMENT MATCH RESULT POST-RECONCILE ERROR:", postErr?.message || postErr);
          }
        }
        if (outcome?.ok) {
          try {
            await markTeamPublicStatsStale(outcome?.affectedTeamIds || []);
          } catch (postErr) {
            logger?.warn?.("TOURNAMENT MATCH RESULT TEAM PUBLIC STATS STALE ERROR:", postErr?.message || postErr);
          }
        }
        if (outcome?.ok && typeof invalidateTeamsCaches === "function") {
          try {
            normalizeUidList(outcome?.affectedTeamIds || []).forEach((teamId) => {
              invalidateTeamsCaches({ teamId });
            });
          } catch (postErr) {
            logger?.warn?.("TOURNAMENT MATCH RESULT TEAM CACHE INVALIDATE ERROR:", postErr?.message || postErr);
          }
        }
        return respondWithOutcome(res, outcome, {
          ok: true,
          ...(outcome?.alreadyCompleted ? { alreadyCompleted: true } : {}),
          nextMatchId: outcome?.nextMatchId || null,
        });
      } catch (err) {
        const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
        logger?.error?.("TOURNAMENT MATCH RESULT ERROR:", err);
        return res.status(500).json({
          error: "Failed to set match result",
          ...(isProd ? {} : { details: String(err?.message || err) }),
        });
      }
    }
  );
}
