import crypto from "crypto";
import {
  DEFAULT_MAP_POOL,
  VETO_READY_DELAY_MS,
  toInt,
  toMillis,
  normalizeUidList,
  normalizeTeamCountry,
  normalizeMapPool,
  resolveProfileAvatarUrl,
  getProfileFragpunkId,
  serializeTournament,
} from "./helpers.js";
import { respondServerError } from "./routeHelpers.js";

const READY_CONFIRM_WINDOW_MS = 5 * 60 * 1000;
const isQuotaExceededError = (err) => {
  const msg = String(err?.message || err || "");
  return msg.includes("RESOURCE_EXHAUSTED") || msg.toLowerCase().includes("quota exceeded");
};

function buildReadyCheck(matchData, now = Date.now()) {
  const scheduledAt = toInt(matchData?.scheduledAt, null);
  if (!scheduledAt) return null;
  const deadlineAt = scheduledAt + READY_CONFIRM_WINDOW_MS;
  const saved = matchData?.readyCheck || {};
  const teamAReady = saved.teamAReady === true;
  const teamBReady = saved.teamBReady === true;
  const teamAReadyAt = toInt(saved.teamAReadyAt, null);
  const teamBReadyAt = toInt(saved.teamBReadyAt, null);
  const readyConfirmedAt = Math.max(
    toInt(teamAReadyAt, 0),
    toInt(teamBReadyAt, 0),
    toInt(scheduledAt, 0)
  );
  const vetoOpensAt = toInt(
    saved.vetoOpensAt,
    teamAReady && teamBReady && readyConfirmedAt > 0 ? readyConfirmedAt + VETO_READY_DELAY_MS : null
  );
  const status = now < scheduledAt
    ? "waiting"
    : now > deadlineAt && (!teamAReady || !teamBReady)
    ? "expired"
    : teamAReady && teamBReady && vetoOpensAt && now < vetoOpensAt
    ? "ready_countdown"
    : teamAReady && teamBReady
    ? "ready"
    : "in_progress";
  return {
    status,
    windowStartAt: scheduledAt,
    deadlineAt,
    vetoOpensAt,
    teamAReady,
    teamBReady,
    teamAReadyAt,
    teamBReadyAt,
    updatedAt: toInt(saved.updatedAt, null),
  };
}

export function registerTournamentReadRoutes(app, ctx) {
  const {
    db,
    logger,
    statsLimiter,
    authLimiter,
    requireAuth,
    parseIntParam,
    tournamentsCache,
    trackTournamentReads,
    userTournamentContextRef,
    tournamentPublicViewRef,
  } = ctx;
  const TOURNAMENTS_LIST_MAX_LIMIT = 100;
  const TOURNAMENTS_FALLBACK_SCAN_LIMIT = 120;
  const TOURNAMENTS_DETAILS_REGS_LIMIT = 256;
  const TOURNAMENTS_DETAILS_MATCHES_LIMIT = 512;
  const TOURNAMENTS_MATCH_DETAILS_CACHE_TTL_MS = 20 * 1000;
  const TOURNAMENTS_DETAILS_CACHE_TTL_MS = 90 * 1000;
  const TOURNAMENTS_LIST_CACHE_TTL_MS = 45 * 1000;
  const TOURNAMENTS_CONTEXT_CACHE_TTL_MS = 60 * 1000;
  const TOURNAMENTS_CONTEXT_REGS_LIMIT = 80;
  const TOURNAMENT_PUBLIC_VIEW_TTL_MS = 60 * 1000;
  const USER_TOURNAMENT_CONTEXT_TTL_MS = 5 * 60 * 1000;
  const USER_TOURNAMENT_CONTEXT_MAX_BYTES = 900 * 1024;
  const READ_BUDGET_GUARD_ENABLED = String(process.env.TOURNAMENTS_READ_BUDGET_GUARD || "1") === "1";
  const READ_BUDGET_WINDOW_MS = 60 * 1000;
  const READ_BUDGET_PER_WINDOW = Math.max(500, toInt(process.env.TOURNAMENTS_READ_BUDGET_PER_MIN, 6000));
  const safeModeEnabled = String(process.env.TOURNAMENTS_SAFE_MODE || "") === "1";
  const tournamentsListCache = tournamentsCache?.list || new Map();
  const tournamentDetailsCache = tournamentsCache?.details || new Map();
  const tournamentsMatchDetailsCache = tournamentsCache?.matchDetails || new Map();
  const tournamentsContextCache = tournamentsCache?.context || new Map();
  const tournamentsMyRegistrationsCache = tournamentsCache?.myRegistrations || new Map();
  const readBudgetState = new Map();
  const sendJsonWithReads = (res, route, payload, reads = 0) => {
    const safeReads = Math.max(0, Number(reads) || 0);
    if (typeof trackTournamentReads === "function") {
      trackTournamentReads(route, safeReads);
    }
    try {
      res.set("X-Tournament-Read-Estimate", String(Math.round(safeReads)));
    } catch {
      // ignore header set errors
    }
    return res.json(payload);
  };
  const buildEtag = (payload) => {
    try {
      const json = JSON.stringify(payload ?? null);
      const hash = crypto.createHash("sha1").update(json).digest("hex");
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
  const setPublicCacheHeaders = (res, { etag = null, maxAge = 60, swr = 120 } = {}) => {
    res.set("Cache-Control", `public, max-age=${Math.max(0, maxAge)}, stale-while-revalidate=${Math.max(0, swr)}`);
    if (etag) res.set("ETag", etag);
  };
  const allowRouteReadBudget = (route = "", estimateReads = 0) => {
    if (!READ_BUDGET_GUARD_ENABLED) return true;
    const key = String(route || "unknown");
    const now = Date.now();
    const estimate = Math.max(0, Number(estimateReads) || 0);
    const current = readBudgetState.get(key) || { windowStart: now, used: 0 };
    const elapsed = now - current.windowStart;
    if (elapsed >= READ_BUDGET_WINDOW_MS) {
      const fresh = { windowStart: now, used: estimate };
      readBudgetState.set(key, fresh);
      return true;
    }
    if (current.used + estimate > READ_BUDGET_PER_WINDOW) return false;
    current.used += estimate;
    readBudgetState.set(key, current);
    return true;
  };
  const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production";
  const allowBroadFallbackScan = !isProduction;
  const loadBroadTournamentRows = async (tournamentsRef, now, limit, status = "") => {
    let query = null;
    if (typeof tournamentsRef?.limit === "function") {
      query = tournamentsRef.limit(TOURNAMENTS_FALLBACK_SCAN_LIMIT);
    } else if (typeof tournamentsRef?.orderBy === "function") {
      const ordered = tournamentsRef.orderBy("startsAt", "asc");
      query =
        typeof ordered?.limit === "function"
          ? ordered.limit(TOURNAMENTS_FALLBACK_SCAN_LIMIT)
          : ordered;
    } else {
      query = tournamentsRef;
    }
    const snap = await query.get();
    const allRows = (snap?.docs || []).map((doc) => serializeTournament(doc, now));
    const filtered = status ? allRows.filter((row) => row.status === status) : allRows;
    if (filtered.length > 0) return filtered.slice(0, limit);
    return allRows.slice(0, limit);
  };
  const approxJsonSize = (value) => {
    try {
      const json = JSON.stringify(value);
      return Buffer.byteLength(json, "utf8");
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  };
  const buildMaterializedContextPayload = (payload = {}) => {
    const sourceTeams = Array.isArray(payload?.teams) ? payload.teams : [];
    const compactTeam = (team = {}) => {
      const memberUids = normalizeUidList(team.memberUids || []).slice(0, 10);
      const sourceStats = Array.isArray(team.membersStats) ? team.membersStats : [];
      const membersStats = sourceStats.slice(0, 10).map((member) => ({
        uid: String(member?.uid || ""),
        elo: toInt(member?.elo, 500),
        matches: toInt(member?.matches, 0),
        fragpunkId: String(member?.fragpunkId || "").slice(0, 40),
      }));
      return {
        id: String(team.id || ""),
        name: String(team.name || "").slice(0, 80),
        captainUid: String(team.captainUid || ""),
        memberUids,
        memberCount: toInt(team.memberCount, memberUids.length),
        maxMembers: toInt(team.maxMembers, 5),
        avatarUrl: String(team.avatarUrl || "").slice(0, 400),
        country: normalizeTeamCountry(team.country),
        isCaptain: team.isCaptain === true,
        membersStats,
      };
    };
    const compact = {
      selfStats: {
        elo: toInt(payload?.selfStats?.elo, 500),
        matches: toInt(payload?.selfStats?.matches, 0),
        fragpunkId: String(payload?.selfStats?.fragpunkId || "").slice(0, 40),
      },
      tournamentIds: normalizeUidList(payload?.tournamentIds || []),
      teams: sourceTeams.map(compactTeam),
      updatedAt: toInt(payload?.updatedAt, Date.now()),
      materialized: true,
    };

    while (compact.teams.length > 0 && approxJsonSize(compact) > USER_TOURNAMENT_CONTEXT_MAX_BYTES) {
      compact.teams.pop();
    }
    if (approxJsonSize(compact) > USER_TOURNAMENT_CONTEXT_MAX_BYTES) {
      compact.teams = [];
    }
    if (approxJsonSize(compact) > USER_TOURNAMENT_CONTEXT_MAX_BYTES) {
      compact.tournamentIds = compact.tournamentIds.slice(0, 200);
    }
    compact.truncated = sourceTeams.length > compact.teams.length;
    return compact;
  };
  const loadUserTournamentContext = async (uid, now = Date.now()) => {
    let readEstimate = 0;
    if (typeof userTournamentContextRef === "function") {
      try {
        const snap = await userTournamentContextRef(uid).get();
        readEstimate += 1;
        const data = snap?.exists ? snap.data() || {} : null;
        const updatedAt = toMillis(data?.updatedAt, 0);
        const payload = data?.payload && typeof data.payload === "object" ? data.payload : null;
        const isTruncatedMaterialized = payload?.truncated === true;
        if (
          data &&
          updatedAt > 0 &&
          now - updatedAt < USER_TOURNAMENT_CONTEXT_TTL_MS &&
          payload &&
          !isTruncatedMaterialized
        ) {
          return {
            payload: { ...payload, materialized: true },
            readEstimate,
          };
        }
      } catch (err) {
        logger.warn("TOURNAMENTS CONTEXT MATERIALIZED READ ERROR:", err?.message || err);
      }
    }

    const [profileSnap, teamsSnap, regsSnap] = await Promise.all([
      db.collection("leaderboard_users").doc(uid).get(),
      db.collection("teams").where("memberUids", "array-contains", uid).limit(50).get(),
      db
        .collectionGroup("registrations")
        .where("memberUids", "array-contains", uid)
        .limit(TOURNAMENTS_CONTEXT_REGS_LIMIT)
        .get(),
    ]);
    readEstimate += 1 + teamsSnap.docs.length + regsSnap.docs.length;

    const profile = profileSnap.exists ? profileSnap.data() || {} : {};
    const teamRows = teamsSnap.docs.map((doc) => {
      const d = doc.data() || {};
      const memberUids = normalizeUidList(d.memberUids || []);
      return {
        id: doc.id,
        name: d.name || "Team",
        captainUid: d.captainUid || "",
        memberUids,
        memberCount: memberUids.length,
        maxMembers: toInt(d.maxMembers, 5),
        avatarUrl: d.avatarUrl || "",
        country: normalizeTeamCountry(d.country),
        isCaptain: d.captainUid === uid,
        membersStats: [],
      };
    });

    const uniqueMemberUids = [
      ...new Set(teamRows.filter((team) => team.isCaptain).flatMap((team) => team.memberUids || [])),
    ];
    let memberStatsByUid = new Map();
    if (uniqueMemberUids.length) {
      const refs = uniqueMemberUids.map((id) => db.collection("leaderboard_users").doc(id));
      const snaps =
        typeof db.getAll === "function"
          ? await db.getAll(...refs)
          : await Promise.all(refs.map((ref) => ref.get()));
      readEstimate += snaps.length;
      memberStatsByUid = new Map(
        snaps.map((snap, idx) => {
          const data = snap?.exists ? snap.data() || {} : {};
          const memberUid = uniqueMemberUids[idx];
          return [
            memberUid,
            {
              uid: memberUid,
              elo: toInt(data.hiddenElo ?? data.elo, 500),
              matches: toInt(data.matches, 0),
              fragpunkId: getProfileFragpunkId(data),
            },
          ];
        })
      );
    }

    const teams = teamRows.map((team) => ({
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

    const tournamentIds = [];
    regsSnap.docs.forEach((doc) => {
      const tId = String(doc.ref.parent?.parent?.id || "");
      if (!tId || tournamentIds.includes(tId)) return;
      tournamentIds.push(tId);
    });

    return {
      payload: {
        selfStats: {
          elo: toInt(profile.hiddenElo ?? profile.elo, 500),
          matches: toInt(profile.matches, 0),
          fragpunkId: getProfileFragpunkId(profile),
        },
        teams,
        tournamentIds,
        updatedAt: now,
      },
      readEstimate,
    };
  };

  app.get("/tournaments", statsLimiter, async (req, res) => {
    try {
      let readEstimate = 0;
      const statusRaw = String(req.query.status || "upcoming");
      const status = ["upcoming", "ongoing", "past"].includes(statusRaw)
        ? statusRaw
        : "upcoming";
      const limitRaw = parseIntParam(req.query.limit, 50);
      if (limitRaw === null) return res.status(400).json({ error: "Invalid limit" });
      const limit = Math.min(Math.max(limitRaw, 1), TOURNAMENTS_LIST_MAX_LIMIT);
      const now = Date.now();
      const cacheKey = `${status}:${limit}`;
      const cached = tournamentsListCache.get(cacheKey);
      if (cached && now - cached.ts < TOURNAMENTS_LIST_CACHE_TTL_MS) {
        const cachedPayload = {
          status,
          rows: cached.rows,
          updatedAt: cached.updatedAt,
          cached: true,
        };
        const cachedEtag = cached.etag || buildEtag(cachedPayload);
        setPublicCacheHeaders(res, { etag: cachedEtag, maxAge: 90, swr: 180 });
        if (requestHasEtag(req, cachedEtag)) {
          return res.status(304).end();
        }
        return sendJsonWithReads(res, "/tournaments", {
          status,
          rows: cached.rows,
          updatedAt: cached.updatedAt,
          cached: true,
        }, 0);
      }
      if (!allowRouteReadBudget("/tournaments", 200)) {
        if (cached?.rows?.length) {
          return sendJsonWithReads(
            res,
            "/tournaments",
            {
              status,
              rows: cached.rows,
              updatedAt: cached.updatedAt,
              cached: true,
              stale: true,
              throttled: true,
            },
            0
          );
        }
        return res.status(429).json({ error: "Read budget exceeded. Try again shortly." });
      }
      const tournamentsRef = db.collection("tournaments");

      // Fallback for simplified query test doubles without full Firestore cursor API.
      if (
        typeof tournamentsRef?.orderBy !== "function" ||
        typeof tournamentsRef?.limit !== "function" ||
        (status === "upcoming" && typeof tournamentsRef?.where !== "function")
      ) {
        const rows = await loadBroadTournamentRows(tournamentsRef, now, limit, status);
        readEstimate += TOURNAMENTS_FALLBACK_SCAN_LIMIT;
        return sendJsonWithReads(res, "/tournaments", { status, rows, updatedAt: now }, readEstimate);
      }

      const rows = [];
      const pageSize = Math.min(40, Math.max(limit, 20));
      let lastDoc = null;
      let hasMore = true;

      try {
        while (rows.length < limit && hasMore) {
          let query = tournamentsRef;
          if (status === "upcoming") {
            query = query.where("startsAt", ">=", now).orderBy("startsAt", "asc");
          } else {
            query = query.orderBy("startsAt", "desc");
          }
          if (lastDoc && typeof query.startAfter === "function") query = query.startAfter(lastDoc);
          query = query.limit(pageSize);

          const snap = await query.get();
          const docs = Array.isArray(snap?.docs) ? snap.docs : [];
          readEstimate += docs.length;
          if (!docs.length) break;

          docs.forEach((doc) => {
            if (rows.length >= limit) return;
            const row = serializeTournament(doc, now);
            if (row.status === status) rows.push(row);
          });

          lastDoc = docs[docs.length - 1] || null;
          hasMore = docs.length === pageSize;
        }
      } catch (queryErr) {
        if (isQuotaExceededError(queryErr)) {
          if (cached?.rows?.length) {
            return res.json({
              status,
              rows: cached.rows,
              updatedAt: cached.updatedAt,
              cached: true,
              stale: true,
              warning: "Firestore quota exceeded. Showing cached data.",
            });
          }
          return res
            .status(503)
            .json({ error: "Firestore quota exceeded. Try again later." });
        }
        logger.warn("TOURNAMENTS LIST FALLBACK:", queryErr?.message || queryErr);
        if (!allowBroadFallbackScan) {
          if (cached?.rows?.length) {
            return sendJsonWithReads(
              res,
              "/tournaments",
              {
                status,
                rows: cached.rows,
                updatedAt: cached.updatedAt,
                cached: true,
                stale: true,
                warning: "Tournament list is temporarily unavailable. Showing cached data.",
              },
              readEstimate
            );
          }
          return res
            .status(503)
            .json({ error: "Tournament list is temporarily unavailable. Please retry." });
        }
        const fallbackRows = await loadBroadTournamentRows(tournamentsRef, now, limit, status);
        readEstimate += TOURNAMENTS_FALLBACK_SCAN_LIMIT;
        const payload = { status, rows: fallbackRows, updatedAt: now };
        const etag = buildEtag(payload);
        tournamentsListCache.set(cacheKey, { ts: now, rows: fallbackRows, updatedAt: now, etag });
        setPublicCacheHeaders(res, { etag, maxAge: 90, swr: 180 });
        if (requestHasEtag(req, etag)) return res.status(304).end();
        return sendJsonWithReads(res, "/tournaments", payload, readEstimate);
      }

      // If optimized query path returned nothing, do a broad fallback scan.
      // This avoids false "no tournaments" when startsAt/index shape is inconsistent.
      if (!rows.length) {
        if (!allowBroadFallbackScan) {
          if (cached?.rows?.length) {
            return sendJsonWithReads(
              res,
              "/tournaments",
              {
                status,
                rows: cached.rows,
                updatedAt: cached.updatedAt,
                cached: true,
                stale: true,
                warning: "Tournament list may be incomplete. Showing cached data.",
              },
              readEstimate
            );
          }
          return res
            .status(503)
            .json({ error: "Tournament list is temporarily unavailable. Please retry." });
        }
        try {
          const broadRows = await loadBroadTournamentRows(tournamentsRef, now, limit, status);
          readEstimate += TOURNAMENTS_FALLBACK_SCAN_LIMIT;
          const payload = { status, rows: broadRows, updatedAt: now };
          const etag = buildEtag(payload);
          tournamentsListCache.set(cacheKey, { ts: now, rows: broadRows, updatedAt: now, etag });
          setPublicCacheHeaders(res, { etag, maxAge: 90, swr: 180 });
          if (requestHasEtag(req, etag)) return res.status(304).end();
          return sendJsonWithReads(res, "/tournaments", payload, readEstimate);
        } catch (broadErr) {
          if (isQuotaExceededError(broadErr)) {
            if (cached?.rows?.length) {
              return sendJsonWithReads(res, "/tournaments", {
                status,
                rows: cached.rows,
                updatedAt: cached.updatedAt,
                cached: true,
                stale: true,
                warning: "Firestore quota exceeded. Showing cached data.",
              }, readEstimate);
            }
            return res
              .status(503)
              .json({ error: "Firestore quota exceeded. Try again later." });
          }
          logger.warn("TOURNAMENTS LIST BROAD FALLBACK ERROR:", broadErr?.message || broadErr);
        }
      }

      const payload = { status, rows, updatedAt: now };
      const etag = buildEtag(payload);
      tournamentsListCache.set(cacheKey, { ts: now, rows, updatedAt: now, etag });
      setPublicCacheHeaders(res, { etag, maxAge: 90, swr: 180 });
      if (requestHasEtag(req, etag)) return res.status(304).end();
      return sendJsonWithReads(res, "/tournaments", payload, readEstimate);
    } catch (err) {
      if (isQuotaExceededError(err)) {
        const statusRaw = String(req.query.status || "upcoming");
        const status = ["upcoming", "ongoing", "past"].includes(statusRaw)
          ? statusRaw
          : "upcoming";
        const parsedLimit = parseIntParam(req.query.limit, 50);
        const limit = Math.min(
          Math.max(parsedLimit === null ? 50 : parsedLimit, 1),
          TOURNAMENTS_LIST_MAX_LIMIT
        );
        const cacheKey = `${status}:${limit}`;
        const cached = tournamentsListCache.get(cacheKey);
        if (cached?.rows?.length) {
          return sendJsonWithReads(res, "/tournaments", {
            status,
            rows: cached.rows,
            updatedAt: cached.updatedAt,
            cached: true,
            stale: true,
            warning: "Firestore quota exceeded. Showing cached data.",
          }, 0);
        }
        return res
          .status(503)
          .json({ error: "Firestore quota exceeded. Try again later." });
      }
      logger.error("TOURNAMENTS LIST ERROR:", err);
      try {
        const now = Date.now();
        const status = String(req.query.status || "upcoming");
        const rows = await loadBroadTournamentRows(db.collection("tournaments"), now, 100, status);
        return sendJsonWithReads(res, "/tournaments", { status, rows, updatedAt: now }, TOURNAMENTS_FALLBACK_SCAN_LIMIT);
      } catch {
        const statusRaw = String(req.query.status || "upcoming");
        const status = ["upcoming", "ongoing", "past"].includes(statusRaw)
          ? statusRaw
          : "upcoming";
        const parsedLimit = parseIntParam(req.query.limit, 50);
        const limit = Math.min(
          Math.max(parsedLimit === null ? 50 : parsedLimit, 1),
          TOURNAMENTS_LIST_MAX_LIMIT
        );
        const cacheKey = `${status}:${limit}`;
        const cached = tournamentsListCache.get(cacheKey);
        if (cached?.rows?.length) {
          return sendJsonWithReads(
            res,
            "/tournaments",
            {
              status,
              rows: cached.rows,
              updatedAt: cached.updatedAt,
              cached: true,
              stale: true,
              warning: "Tournament list is temporarily unavailable. Showing cached data.",
            },
            0
          );
        }
        return res
          .status(503)
          .json({ error: "Tournament list is temporarily unavailable. Please retry." });
      }
    }
  });

  app.get("/tournaments/:id", statsLimiter, async (req, res) => {
    try {
      let readEstimate = 0;
      const tournamentId = String(req.params.id || "");
      if (tournamentId === "my-registrations" || tournamentId === "registrations") {
        if (typeof myRegistrationsHandler === "function") {
          if (typeof requireAuth === "function") {
            return requireAuth(req, res, () => myRegistrationsHandler(req, res));
          }
          return myRegistrationsHandler(req, res);
        }
      }
      if (!tournamentId) {
        return res.status(400).json({ error: "Tournament id is required" });
      }
      const cached = tournamentDetailsCache.get(tournamentId);
      const now = Date.now();
      if (cached && now - cached.ts < TOURNAMENTS_DETAILS_CACHE_TTL_MS) {
        const cachedPayload = { ...cached.payload, cached: true };
        const cachedEtag = cached.etag || buildEtag(cachedPayload);
        setPublicCacheHeaders(res, { etag: cachedEtag, maxAge: 60, swr: 180 });
        if (requestHasEtag(req, cachedEtag)) {
          return res.status(304).end();
        }
        return sendJsonWithReads(res, "/tournaments/:id", { ...cached.payload, cached: true }, 0);
      }
      if (!allowRouteReadBudget("/tournaments/:id", 500)) {
        if (cached?.payload) {
          return sendJsonWithReads(
            res,
            "/tournaments/:id",
            { ...cached.payload, cached: true, stale: true, throttled: true },
            0
          );
        }
        return res.status(429).json({ error: "Read budget exceeded. Try again shortly." });
      }
      if (typeof tournamentPublicViewRef === "function") {
        try {
          const viewSnap = await tournamentPublicViewRef(tournamentId).get();
          readEstimate += 1;
          if (viewSnap?.exists) {
            const viewData = viewSnap.data() || {};
            const updatedAt = toMillis(viewData.updatedAt, 0);
            if (
              viewData.payload &&
              typeof viewData.payload === "object" &&
              updatedAt > 0 &&
              now - updatedAt < TOURNAMENT_PUBLIC_VIEW_TTL_MS
            ) {
              const payload = { ...viewData.payload, cached: true, materialized: true };
              const etag = buildEtag(payload);
              tournamentDetailsCache.set(tournamentId, { ts: now, payload, etag });
              setPublicCacheHeaders(res, { etag, maxAge: 60, swr: 180 });
              if (requestHasEtag(req, etag)) return res.status(304).end();
              return sendJsonWithReads(res, "/tournaments/:id", payload, readEstimate);
            }
          }
        } catch (err) {
          logger.warn("TOURNAMENT PUBLIC VIEW READ ERROR:", err?.message || err);
        }
      }
      if (safeModeEnabled) {
        return res.status(503).json({ error: "Tournament details are temporarily throttled in safe mode" });
      }
      const tournamentRef = db.collection("tournaments").doc(tournamentId);
      const tournamentSnap = await tournamentRef.get();
      readEstimate += 1;
      if (!tournamentSnap?.exists) {
        tournamentDetailsCache.delete(tournamentId);
        return res.status(404).json({ error: "Tournament not found" });
      }
      const [regsSnap, matchesSnap] = await Promise.all([
        tournamentRef
          .collection("registrations")
          .limit(TOURNAMENTS_DETAILS_REGS_LIMIT)
          .get()
          .catch(() => ({ docs: [] })),
        tournamentRef
          .collection("matches")
          .limit(TOURNAMENTS_DETAILS_MATCHES_LIMIT)
          .get()
          .catch(() => ({ docs: [] })),
      ]);
      readEstimate += regsSnap.docs.length + matchesSnap.docs.length;

      const tournament = serializeTournament(tournamentSnap, now);
      let registrations = regsSnap.docs
        .map((doc) => {
          const d = doc.data() || {};
          return {
            id: doc.id,
            teamId: d.teamId || doc.id,
            teamName: d.teamName || "Team",
            avatarUrl: d.avatarUrl || "",
            country: normalizeTeamCountry(d.country),
            captainUid: d.captainUid || "",
            memberUids: normalizeUidList(d.memberUids || []),
            avgEloSnapshot: toInt(d.avgEloSnapshot, 0),
            matchesSnapshot: toInt(d.matchesSnapshot, 0),
          };
        })
        .sort((a, b) => b.avgEloSnapshot - a.avgEloSnapshot);
      const registrationByTeamId = new Map(registrations.map((r) => [String(r.teamId || ""), r]));

      if (String(tournament.teamFormat || "") === "1x1") {
        const missingAvatar = registrations.some((r) => !String(r.avatarUrl || "").trim());
        const genericName = registrations.some((r) => {
          const name = String(r.teamName || "").trim().toLowerCase();
          return !name || name === "team";
        });
        if ((missingAvatar || genericName) && typeof db.getAll === "function") {
          const refs = registrations.map((r) => {
            const uid = String(r.teamId || r.captainUid || r.memberUids?.[0] || r.id || "");
            return db.collection("leaderboard_users").doc(uid);
          });
          const snaps = await db.getAll(...refs);
          readEstimate += snaps.length;
          registrations = registrations.map((r, idx) => {
            const uid = String(r.teamId || r.captainUid || r.memberUids?.[0] || r.id || "");
            const profile = snaps[idx]?.exists ? snaps[idx].data() || {} : {};
            const resolvedAvatarUrl = resolveProfileAvatarUrl(profile, uid);
            const profileName = String(profile.name || uid || "Player");
            const currentName = String(r.teamName || "").trim();
            return {
              ...r,
              avatarUrl: r.avatarUrl || resolvedAvatarUrl || "",
              teamName:
                !currentName || currentName.toLowerCase() === "team"
                  ? profileName
                  : r.teamName,
            };
          });
          registrationByTeamId.clear();
          registrations.forEach((r) => registrationByTeamId.set(String(r.teamId || ""), r));
        }
      }

      const normalizeMatchSide = (seed) => {
        const side = seed && typeof seed === "object" ? { ...seed } : null;
        if (!side) return null;
        if (String(tournament.teamFormat || "") !== "1x1") return side;
        const teamId = String(side.teamId || "");
        const reg = registrationByTeamId.get(teamId);
        const sideName = String(side.teamName || "").trim();
        if (!reg) return side;
        if (!sideName || sideName.toLowerCase() === "team") {
          side.teamName = String(reg.teamName || side.teamName || "Player");
        }
        if (!String(side.avatarUrl || "").trim()) {
          side.avatarUrl = String(reg.avatarUrl || "");
        }
        return side;
      };

        const matches = matchesSnap.docs
          .map((doc) => {
            const d = doc.data() || {};
            return {
            id: doc.id,
            round: toInt(d.round, 1),
            stage: d.stage || "single",
            group: d.group || null,
            status: d.status || "pending",
            teamA: normalizeMatchSide(d.teamA || null),
            teamB: normalizeMatchSide(d.teamB || null),
            winnerTeamId: d.winnerTeamId || null,
            teamAScore: toInt(d.teamAScore, 0),
            teamBScore: toInt(d.teamBScore, 0),
            bestOf: [1, 3, 5].includes(toInt(d.bestOf, 1)) ? toInt(d.bestOf, 1) : 1,
            scheduledAt: toInt(d.scheduledAt, null),
            readyCheck: buildReadyCheck(d, now),
            winner: d.winner || null,
              loser: d.loser || null,
            };
          })
          .filter((m) => Boolean(m.teamA?.teamId) || Boolean(m.teamB?.teamId))
          .sort(
            (a, b) =>
              String(a.stage).localeCompare(String(b.stage)) ||
            String(a.group || "").localeCompare(String(b.group || "")) ||
            a.round - b.round ||
            a.id.localeCompare(b.id)
        );

      const payload = {
        tournament,
        registrations,
        matches,
        updatedAt: now,
        truncated:
          regsSnap.docs.length >= TOURNAMENTS_DETAILS_REGS_LIMIT ||
          matchesSnap.docs.length >= TOURNAMENTS_DETAILS_MATCHES_LIMIT,
      };
      const etag = buildEtag(payload);
      tournamentDetailsCache.set(tournamentId, { ts: now, payload, etag });
      if (typeof tournamentPublicViewRef === "function") {
        tournamentPublicViewRef(tournamentId)
          .set({ id: tournamentId, updatedAt: now, payload }, { merge: true })
          .catch((err) => logger.warn("TOURNAMENT PUBLIC VIEW WRITE ERROR:", err?.message || err));
      }
      setPublicCacheHeaders(res, { etag, maxAge: 60, swr: 180 });
      if (requestHasEtag(req, etag)) return res.status(304).end();
      return sendJsonWithReads(res, "/tournaments/:id", payload, readEstimate);
    } catch (err) {
      return respondServerError(
        res,
        logger,
        "TOURNAMENT DETAILS ERROR",
        "Failed to load tournament details",
        err
      );
    }
  });

  app.get("/tournaments/:id/matches/:matchId", statsLimiter, async (req, res) => {
    try {
      let readEstimate = 0;
      const tournamentId = String(req.params.id || "");
      const matchId = String(req.params.matchId || "");
      if (!tournamentId || !matchId) {
        return res.status(400).json({ error: "Tournament id and match id are required" });
      }
      const now = Date.now();
      const cacheKey = `${tournamentId}:${matchId}`;
      const cached = tournamentsMatchDetailsCache.get(cacheKey);
      if (cached && now - cached.ts < TOURNAMENTS_MATCH_DETAILS_CACHE_TTL_MS) {
        return sendJsonWithReads(res, "/tournaments/:id/matches/:matchId", { ...cached.payload, cached: true }, 0);
      }
      if (!allowRouteReadBudget("/tournaments/:id/matches/:matchId", 40)) {
        if (cached?.payload) {
          return sendJsonWithReads(
            res,
            "/tournaments/:id/matches/:matchId",
            { ...cached.payload, cached: true, stale: true, throttled: true },
            0
          );
        }
        return res.status(429).json({ error: "Read budget exceeded. Try again shortly." });
      }
      if (safeModeEnabled && cached?.payload) {
        return sendJsonWithReads(
          res,
          "/tournaments/:id/matches/:matchId",
          { ...cached.payload, cached: true, stale: true, safeMode: true },
          0
        );
      }

      const tournamentRef = db.collection("tournaments").doc(tournamentId);
      const matchRef = tournamentRef.collection("matches").doc(matchId);
      const [tournamentSnap, matchSnap] = await Promise.all([tournamentRef.get(), matchRef.get()]);
      readEstimate += 2;
      if (!tournamentSnap.exists) return res.status(404).json({ error: "Tournament not found" });
      if (!matchSnap.exists) return res.status(404).json({ error: "Match not found" });

      const tournamentData = tournamentSnap.data() || {};
      const matchData = matchSnap.data() || {};
      const teamA = matchData.teamA || null;
      const teamB = matchData.teamB || null;
      const teamIds = normalizeUidList([teamA?.teamId, teamB?.teamId]);
      const regRefs = teamIds.map((teamId) => tournamentRef.collection("registrations").doc(teamId));
      const regSnaps =
        regRefs.length === 0
          ? []
          : typeof db.getAll === "function"
            ? await db.getAll(...regRefs)
            : await Promise.all(regRefs.map((ref) => ref.get()));
      readEstimate += regSnaps.length;
      const regByTeamId = new Map(
        regSnaps
          .filter((snap) => snap?.exists)
          .map((snap) => [snap.id, { id: snap.id, ...(snap.data() || {}) }])
      );

      const snappedMemberUids = new Set(
        regSnaps
          .filter((snap) => snap?.exists)
          .flatMap((snap) => {
            const membersSnapshot = Array.isArray(snap.data()?.membersSnapshot)
              ? snap.data().membersSnapshot
              : [];
            return membersSnapshot.map((m) => String(m?.uid || "")).filter(Boolean);
          })
      );
      const memberUids = normalizeUidList(
        regSnaps.flatMap((snap) => (snap?.exists ? normalizeUidList(snap.data()?.memberUids || []) : []))
      ).filter((uid) => !snappedMemberUids.has(uid));
      const profileRefs = memberUids.map((uid) => db.collection("leaderboard_users").doc(uid));
      const profileSnaps =
        profileRefs.length === 0
          ? []
          : typeof db.getAll === "function"
            ? await db.getAll(...profileRefs)
            : await Promise.all(profileRefs.map((ref) => ref.get()));
      readEstimate += profileSnaps.length;
      const profileByUid = new Map();
      profileSnaps.forEach((snap, idx) => {
        const uid = memberUids[idx];
        profileByUid.set(uid, snap?.exists ? snap.data() || {} : {});
      });

      const buildSide = (seed) => {
        const teamId = String(seed?.teamId || "");
        const reg = regByTeamId.get(teamId) || {};
        const isSolo = String(tournamentData.teamFormat || "") === "1x1";
        const captainUid = String(reg.captainUid || "");
        const regMembers = normalizeUidList(reg.memberUids || []);
        const snapshotByUid = new Map(
          (Array.isArray(reg.membersSnapshot) ? reg.membersSnapshot : [])
            .map((m) => {
              const uid = String(m?.uid || "");
              if (!uid) return null;
              return [
                uid,
                {
                  uid,
                  name: String(m?.name || uid),
                  avatarUrl: String(m?.avatarUrl || ""),
                  elo: toInt(m?.elo, 500),
                  fragpunkId: String(m?.fragpunkId || ""),
                },
              ];
            })
            .filter(Boolean)
        );
        const members = regMembers.map((uid) => {
          const snapped = snapshotByUid.get(uid);
          if (snapped) {
            return {
              ...snapped,
              role: uid === captainUid ? "captain" : "player",
            };
          }
          const profile = profileByUid.get(uid) || {};
          return {
            uid,
            name: String(profile.name || uid),
            avatarUrl: resolveProfileAvatarUrl(profile, uid),
            elo: toInt(profile.hiddenElo ?? profile.elo, 500),
            fragpunkId: getProfileFragpunkId(profile),
            role: uid === captainUid ? "captain" : "player",
          };
        });
        const captainProfile = profileByUid.get(captainUid) || {};
        const fallbackSoloName = String(
          captainProfile.name || members[0]?.name || teamId || "Player"
        );
        const currentName = String(seed?.teamName || reg.teamName || "").trim();
        return {
          teamId,
          teamName:
            isSolo && (!currentName || currentName.toLowerCase() === "team")
              ? fallbackSoloName
              : (seed?.teamName || reg.teamName || "Team"),
          avatarUrl: seed?.avatarUrl || reg.avatarUrl || "",
          captainUid,
          members,
        };
      };

      const mapPool = normalizeMapPool(tournamentData.mapPool || DEFAULT_MAP_POOL);
      const payload = {
        tournament: {
          id: tournamentSnap.id,
          title: tournamentData.title || "Tournament",
          teamFormat: tournamentData.teamFormat || "5x5",
          bracketType: tournamentData.bracketType || "single_elimination",
          mapPool,
        },
        match: {
          id: matchSnap.id,
          stage: String(matchData.stage || "single"),
          round: toInt(matchData.round, 1),
          status: String(matchData.status || "pending"),
          scheduledAt: toInt(matchData.scheduledAt, null),
          winnerTeamId: matchData.winnerTeamId || null,
          teamAScore: toInt(matchData.teamAScore, 0),
          teamBScore: toInt(matchData.teamBScore, 0),
          bestOf: [1, 3, 5].includes(toInt(matchData.bestOf, 1)) ? toInt(matchData.bestOf, 1) : 1,
          veto: matchData.veto || null,
          readyCheck: buildReadyCheck(matchData, now),
          teamA: buildSide(teamA || {}),
          teamB: buildSide(teamB || {}),
        },
        updatedAt: now,
      };
      tournamentsMatchDetailsCache.set(cacheKey, { ts: now, payload });
      return sendJsonWithReads(res, "/tournaments/:id/matches/:matchId", payload, readEstimate);
    } catch (err) {
      return respondServerError(res, logger, "TOURNAMENT MATCH DETAILS ERROR", "Failed to load match", err);
    }
  });

  const myRegistrationsHandler = async (req, res) => {
    try {
      let readEstimate = 0;
      const uid = String(req.user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      const now = Date.now();
      const cachedRegs = tournamentsMyRegistrationsCache.get(uid);
      if (cachedRegs && now - cachedRegs.ts < TOURNAMENTS_CONTEXT_CACHE_TTL_MS) {
        return sendJsonWithReads(
          res,
          "/tournaments/my-registrations",
          { tournamentIds: cachedRegs.ids || [], cached: true },
          0
        );
      }
      const cachedCtx = tournamentsContextCache.get(uid);
      if (cachedCtx && now - cachedCtx.ts < TOURNAMENTS_CONTEXT_CACHE_TTL_MS) {
        return sendJsonWithReads(
          res,
          "/tournaments/my-registrations",
          { tournamentIds: cachedCtx.payload?.tournamentIds || [], cached: true },
          0
        );
      }
      if (typeof userTournamentContextRef === "function") {
        try {
          const materializedSnap = await userTournamentContextRef(uid).get();
          readEstimate += 1;
          const materialized = materializedSnap?.exists ? materializedSnap.data() || {} : null;
          const hasPayloadIds = Array.isArray(materialized?.payload?.tournamentIds);
          const hasLegacyIds = Array.isArray(materialized?.tournamentIds);
          const idsFromPayload = hasPayloadIds
            ? materialized.payload.tournamentIds
            : [];
          const idsFromLegacyRoot = hasLegacyIds
            ? materialized.tournamentIds
            : [];
          const ids = hasPayloadIds ? idsFromPayload : idsFromLegacyRoot;
          const updatedAt = toMillis(materialized?.updatedAt, 0);
          const hasIdsSource = hasPayloadIds || hasLegacyIds;
          const isFresh = updatedAt > 0 && now - updatedAt < USER_TOURNAMENT_CONTEXT_TTL_MS;
          if (hasIdsSource) {
            tournamentsMyRegistrationsCache.set(uid, { ts: now, ids });
            return sendJsonWithReads(
              res,
              "/tournaments/my-registrations",
              { tournamentIds: ids, materialized: true, cached: isFresh, stale: !isFresh },
              readEstimate
            );
          }
        } catch (err) {
          logger.warn("TOURNAMENTS MY REG MATERIALIZED READ ERROR:", err?.message || err);
        }
      }
      return sendJsonWithReads(
        res,
        "/tournaments/my-registrations",
        { tournamentIds: [], materialized: false, stale: true },
        readEstimate
      );
    } catch (err) {
      logger.error("TOURNAMENTS MY REGISTRATIONS ERROR:", err);
      const uid = String(req.user?.uid || "");
      const cachedRegs = tournamentsMyRegistrationsCache.get(uid);
      if (cachedRegs?.ids) {
        return sendJsonWithReads(res, "/tournaments/my-registrations", {
          tournamentIds: cachedRegs.ids,
          cached: true,
          stale: true,
        }, 0);
      }
      const cachedCtx = tournamentsContextCache.get(uid);
      if (cachedCtx?.payload) {
        return sendJsonWithReads(res, "/tournaments/my-registrations", {
          tournamentIds: cachedCtx.payload.tournamentIds || [],
          cached: true,
          stale: true,
        }, 0);
      }
      return sendJsonWithReads(res, "/tournaments/my-registrations", { tournamentIds: [] }, 0);
    }
  };

  app.get("/tournaments/registrations/my", authLimiter, requireAuth, myRegistrationsHandler);
  app.get("/tournaments/my-registrations", authLimiter, requireAuth, myRegistrationsHandler);

  app.get("/tournaments/context/my", authLimiter, requireAuth, async (req, res) => {
    try {
      let readEstimate = 0;
      const uid = String(req.user?.uid || "");
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      const now = Date.now();
      const cached = tournamentsContextCache.get(uid);
      if (cached && now - cached.ts < TOURNAMENTS_CONTEXT_CACHE_TTL_MS) {
        return sendJsonWithReads(res, "/tournaments/context/my", { ...cached.payload, cached: true }, 0);
      }
      if (!allowRouteReadBudget("/tournaments/context/my", 150)) {
        if (cached?.payload) {
          return sendJsonWithReads(
            res,
            "/tournaments/context/my",
            { ...cached.payload, cached: true, stale: true, throttled: true },
            0
          );
        }
        return res.status(429).json({ error: "Read budget exceeded. Try again shortly." });
      }
      if (safeModeEnabled) {
        const payload = {
          selfStats: { elo: 500, matches: 0, fragpunkId: "" },
          teams: [],
          tournamentIds: [],
          updatedAt: now,
          safeMode: true,
        };
        tournamentsContextCache.set(uid, { ts: now, payload });
        return sendJsonWithReads(res, "/tournaments/context/my", payload, 0);
      }
      const contextResult = await loadUserTournamentContext(uid, now);
      const payload = contextResult?.payload || {
        selfStats: { elo: 500, matches: 0, fragpunkId: "" },
        teams: [],
        tournamentIds: [],
        updatedAt: now,
      };
      readEstimate += Math.max(0, Number(contextResult?.readEstimate) || 0);
      tournamentsContextCache.set(uid, { ts: now, payload });
      tournamentsMyRegistrationsCache.set(uid, { ts: now, ids: payload.tournamentIds || [] });
      if (typeof userTournamentContextRef === "function") {
        const compactPayload = buildMaterializedContextPayload(payload);
        userTournamentContextRef(uid)
          .set(
            {
              uid,
              updatedAt: now,
              payload: compactPayload,
            },
            { merge: true }
          )
          .catch((err) => logger.warn("TOURNAMENTS CONTEXT MATERIALIZED WRITE ERROR:", err?.message || err));
      }
      return sendJsonWithReads(res, "/tournaments/context/my", payload, readEstimate);
    } catch (err) {
      if (isQuotaExceededError(err)) {
        const uid = String(req.user?.uid || "");
        const cached = tournamentsContextCache.get(uid);
        if (cached?.payload) {
          return sendJsonWithReads(res, "/tournaments/context/my", {
            ...cached.payload,
            cached: true,
            stale: true,
            warning: "Firestore quota exceeded. Showing cached data.",
          }, 0);
        }
        return res.status(503).json({ error: "Firestore quota exceeded. Try again later." });
      }
      logger.error("TOURNAMENTS CONTEXT ERROR:", err);
      return res.status(500).json({ error: "Failed to load tournaments context" });
    }
  });

}
