import { toInt, getTeamFormatForTeamDoc } from "./helpers.js";
import { registerTournamentReadRoutes } from "./tournamentReadRoutes.js";
import { registerTeamRoutes } from "./teamRoutes.js";
import { registerTournamentManageRoutes } from "./tournamentManageRoutes.js";

let tournamentTeamLocksJanitorStarted = false;

function startTournamentTeamLocksJanitor({ admin, db, logger } = {}) {
  if (tournamentTeamLocksJanitorStarted) return;
  if (!admin || !db) return;
  if (String(process.env.NODE_ENV || "").toLowerCase() === "test") return;
  const enabled = String(process.env.TOURNAMENTS_LOCK_CLEANUP_ENABLED || "1") === "1";
  if (!enabled) return;

  const intervalMs = Math.max(
    60_000,
    toInt(process.env.TOURNAMENTS_LOCK_CLEANUP_INTERVAL_MS, 10 * 60 * 1000)
  );
  const scanLimit = Math.min(
    Math.max(toInt(process.env.TOURNAMENTS_LOCK_CLEANUP_SCAN_LIMIT, 20), 1),
    200
  );
  tournamentTeamLocksJanitorStarted = true;
  let inFlight = false;

  const run = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const now = Date.now();
      const tournamentsSnap = await db
        .collection("tournaments")
        .where("endsAt", "<=", now)
        .orderBy("endsAt", "desc")
        .limit(scanLimit)
        .get();
      const docs = Array.isArray(tournamentsSnap?.docs) ? tournamentsSnap.docs : [];

      for (const doc of docs) {
        const data = doc.data ? doc.data() || {} : {};
        const endsAt = toInt(data.endsAt, 0);
        if (!endsAt) continue;
        const teamLocksClearedAt = toInt(data.teamLocksClearedAt, 0);
        if (teamLocksClearedAt >= endsAt) continue;
        if (String(data.teamFormat || "") === "1x1") {
          await doc.ref.set(
            {
              teamLocksClearedAt: now,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          continue;
        }

        const regsSnap = await doc.ref.collection("registrations").get();
        const teamIds = [
          ...new Set(
            (regsSnap?.docs || [])
              .map((regDoc) => {
                const reg = regDoc.data ? regDoc.data() || {} : {};
                return String(reg.teamId || regDoc.id || "").trim();
              })
              .filter(Boolean)
          ),
        ];

        const removeOp = admin.firestore.FieldValue.arrayRemove(doc.id);
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

        await doc.ref.set(
          {
            teamLocksClearedAt: now,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (err) {
      logger?.warn?.("TOURNAMENT TEAM LOCKS JANITOR ERROR:", err?.message || err);
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(run, intervalMs);
  if (typeof timer?.unref === "function") timer.unref();
  setTimeout(run, 15_000);
}

export function registerTournamentRoutes(app, deps) {
  const { admin, db, logger } = deps;
  startTournamentTeamLocksJanitor({ admin, db, logger });
  const tournamentsCache = {
    list: new Map(),
    details: new Map(),
    matchDetails: new Map(),
    context: new Map(),
    myRegistrations: new Map(),
  };
  const teamsCache = {
    my: new Map(),
    publicDetails: new Map(),
  };
  const trackTournamentReads = (route = "unknown", reads = 0) => {
    // Intentionally no-op in production profile.
    void route;
    void reads;
  };
  const tournamentPublicViewRef = (tournamentId = "") =>
    db.collection("tournament_public_view").doc(String(tournamentId || ""));
  const userTournamentContextRef = (uid = "") =>
    db.collection("user_tournament_context").doc(String(uid || ""));
  const clearTournamentPublicView = async (tournamentId = "") => {
    const safeTournamentId = String(tournamentId || "").trim();
    if (!safeTournamentId) return;
    try {
      await tournamentPublicViewRef(safeTournamentId).delete();
    } catch (err) {
      logger?.warn?.("TOURNAMENT PUBLIC VIEW INVALIDATE ERROR:", err?.message || err);
    }
  };
  const invalidateTournamentCaches = ({ tournamentId = "", uid = "" } = {}) => {
    tournamentsCache.list.clear();
    if (tournamentId) tournamentsCache.details.delete(String(tournamentId));
    else tournamentsCache.details.clear();
    if (tournamentId) {
      const prefix = `${String(tournamentId)}:`;
      [...tournamentsCache.matchDetails.keys()].forEach((key) => {
        if (String(key).startsWith(prefix)) tournamentsCache.matchDetails.delete(key);
      });
    } else {
      tournamentsCache.matchDetails.clear();
    }
    if (uid) tournamentsCache.context.delete(String(uid));
    else tournamentsCache.context.clear();
    if (uid) tournamentsCache.myRegistrations.delete(String(uid));
    else tournamentsCache.myRegistrations.clear();
  };
  const invalidateTeamsCaches = ({ uid = "", teamId = "" } = {}) => {
    if (uid) teamsCache.my.delete(String(uid));
    else teamsCache.my.clear();
    if (teamId) teamsCache.publicDetails.delete(String(teamId));
    else teamsCache.publicDetails.clear();
  };
  const findUserTeamInFormat = async ({
    uid,
    teamFormat = "",
    excludeTeamId = "",
    tx = null,
  }) => {
    if (!uid) return null;
    const safeTeamFormat = String(teamFormat || "").trim().toLowerCase();
    if (!safeTeamFormat) return null;
    const teamsQuery = db.collection("teams").where("memberUids", "array-contains", uid).limit(50);
    const snap = tx ? await tx.get(teamsQuery) : await teamsQuery.get();
    return (
      snap.docs.find((doc) => {
        if (doc.id === excludeTeamId) return false;
        const team = doc.data() || {};
        return getTeamFormatForTeamDoc(team) === safeTeamFormat;
      }) || null
    );
  };
  const ctx = {
    ...deps,
    tournamentsCache,
    teamsCache,
    trackTournamentReads,
    userTournamentContextRef,
    tournamentPublicViewRef,
    clearTournamentPublicView,
    invalidateTournamentCaches,
    invalidateTeamsCaches,
    findUserTeamInFormat,
  };
  registerTournamentReadRoutes(app, ctx);
  registerTeamRoutes(app, ctx);
  registerTournamentManageRoutes(app, ctx);
}
