import { normalizeUidList, toInt } from "./helpers.js";
import { respondServerError } from "./routeHelpers.js";

export function registerTournamentChatRoutes(app, ctx) {
  const {
    admin,
    db,
    logger,
    authLimiter,
    requireAuth,
  } = ctx;

  const chatPostCooldownMs = Math.max(500, toInt(process.env.TOURNAMENT_CHAT_COOLDOWN_MS, 1200));
  const accessCacheTtlMs = Math.max(5_000, toInt(process.env.TOURNAMENT_CHAT_ACCESS_CACHE_TTL_MS, 30_000));
  const senderCooldown = new Map();
  const accessCache = new Map();

  const ensureParticipant = async ({ tournamentId = "", matchId = "", uid = "" }) => {
    const safeTournamentId = String(tournamentId || "").trim();
    const safeMatchId = String(matchId || "").trim();
    const safeUid = String(uid || "").trim();
    if (!safeTournamentId || !safeMatchId || !safeUid) {
      return { status: 400, error: "Invalid params" };
    }
    const accessCacheKey = `${safeTournamentId}:${safeMatchId}:${safeUid}`;
    const cachedAccess = accessCache.get(accessCacheKey);
    const now = Date.now();
    if (cachedAccess && now - toInt(cachedAccess.ts, 0) < accessCacheTtlMs) {
      return {
        ok: true,
        matchRef: cachedAccess.matchRef,
        match: {
          status: String(cachedAccess.matchStatus || ""),
        },
      };
    }

    const tournamentRef = db.collection("tournaments").doc(safeTournamentId);
    const matchRef = tournamentRef.collection("matches").doc(safeMatchId);
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) return { status: 404, error: "Match not found" };

    const match = matchSnap.data() || {};
    const teamAId = String(match?.teamA?.teamId || "");
    const teamBId = String(match?.teamB?.teamId || "");
    if (!teamAId || !teamBId) {
      return { status: 409, error: "Match teams are not ready" };
    }

    const participantsFromSide = (side = {}) => {
      const captainUid = String(side?.captainUid || "").trim();
      const memberUids = normalizeUidList(side?.memberUids || []);
      const memberObjects = Array.isArray(side?.members) ? side.members : [];
      const memberObjectUids = normalizeUidList(memberObjects.map((m) => String(m?.uid || "").trim()));
      return [captainUid, ...memberUids, ...memberObjectUids].filter(Boolean);
    };
    const participantUidsFromMatch = normalizeUidList([
      ...(Array.isArray(match?.participantUids) ? match.participantUids : []),
      ...participantsFromSide(match?.teamA || {}),
      ...participantsFromSide(match?.teamB || {}),
    ]);
    let participantUids = new Set(participantUidsFromMatch);
    if (!participantUids.size) {
      const regRefs = [
        tournamentRef.collection("registrations").doc(teamAId),
        tournamentRef.collection("registrations").doc(teamBId),
      ];
      const regSnaps =
        typeof db.getAll === "function"
          ? await db.getAll(...regRefs)
          : await Promise.all(regRefs.map((ref) => ref.get()));

      participantUids = new Set(
        regSnaps
          .filter((snap) => snap?.exists)
          .flatMap((snap) => {
            const data = snap.data() || {};
            const captainUid = String(data.captainUid || "");
            const members = normalizeUidList(data.memberUids || []);
            return [captainUid, ...members].filter(Boolean);
          })
      );
    }

    if (!participantUids.has(safeUid)) {
      return { status: 403, error: "Forbidden" };
    }

    const participantUidsList = normalizeUidList([...participantUids]);
    if (participantUidsList.length) {
      const existingParticipantUids = normalizeUidList(match?.participantUids || []);
      const hasSameSnapshot =
        existingParticipantUids.length === participantUidsList.length &&
        existingParticipantUids.every((uidValue, idx) => uidValue === participantUidsList[idx]);
      if (!hasSameSnapshot) {
        matchRef
          .set(
            {
              participantUids: participantUidsList,
            },
            { merge: true }
          )
          .catch((err) => logger?.warn?.("TOURNAMENT CHAT PARTICIPANTS SNAPSHOT WRITE ERROR:", err?.message || err));
      }
    }

    accessCache.set(accessCacheKey, {
      ts: now,
      matchRef,
      matchStatus: String(match?.status || ""),
      participantUids: participantUidsList,
    });
    return { ok: true, matchRef, match };
  };

  app.get("/tournaments/:id/matches/:matchId/chat", authLimiter, requireAuth, async (req, res) => {
    try {
      const tournamentId = String(req.params.id || "");
      const matchId = String(req.params.matchId || "");
      const uid = String(req.user?.uid || "");
      const access = await ensureParticipant({ tournamentId, matchId, uid });
      if (!access?.ok) {
        return res.status(access?.status || 403).json({ error: access?.error || "Forbidden" });
      }
      if (String(access?.match?.status || "") === "completed") {
        return res.json({ rows: [], closed: true });
      }

      const limitRaw = Number.parseInt(String(req.query.limit || "50"), 10);
      const limit = Number.isFinite(limitRaw)
        ? Math.min(Math.max(limitRaw, 1), 100)
        : 50;

      const chatSnap = await access.matchRef
        .collection("chat")
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();

      const rows = (chatSnap.docs || [])
        .map((doc) => {
          const data = doc.data() || {};
          return {
            id: doc.id,
            uid: String(data.uid || ""),
            text: String(data.text || ""),
            createdAt: toInt(data.createdAt, 0),
          };
        })
        .reverse();

      return res.json({ rows });
    } catch (err) {
      return respondServerError(res, logger, "TOURNAMENT CHAT LIST ERROR", "Failed to load chat", err);
    }
  });

  app.post("/tournaments/:id/matches/:matchId/chat", authLimiter, requireAuth, async (req, res) => {
    try {
      const tournamentId = String(req.params.id || "");
      const matchId = String(req.params.matchId || "");
      const uid = String(req.user?.uid || "");
      const access = await ensureParticipant({ tournamentId, matchId, uid });
      if (!access?.ok) {
        return res.status(access?.status || 403).json({ error: access?.error || "Forbidden" });
      }
      if (String(access?.match?.status || "") === "completed") {
        return res.status(409).json({ error: "Match chat is closed" });
      }

      const text = String(req.body?.text || "").trim();
      if (!text) return res.status(400).json({ error: "Message text is required" });
      if (text.length > 500) return res.status(400).json({ error: "Message is too long" });

      const cooldownKey = `${tournamentId}:${matchId}:${uid}`;
      const now = Date.now();
      const lastSentAt = toInt(senderCooldown.get(cooldownKey), 0);
      if (lastSentAt > 0 && now - lastSentAt < chatPostCooldownMs) {
        return res.status(429).json({ error: "Too many messages. Try again shortly." });
      }
      senderCooldown.set(cooldownKey, now);

      const msgRef = access.matchRef.collection("chat").doc();
      await msgRef.set({
        uid,
        text,
        createdAt: now,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.json({
        ok: true,
        id: msgRef.id,
        message: {
          id: msgRef.id,
          uid,
          text,
          createdAt: now,
        },
      });
    } catch (err) {
      return respondServerError(res, logger, "TOURNAMENT CHAT POST ERROR", "Failed to send message", err);
    }
  });
}
