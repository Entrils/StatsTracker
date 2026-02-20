import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerTournamentReadRoutes } from "./tournamentReadRoutes.js";
import { createFakeFirestore } from "./testFirestore.js";

function createApp(deps) {
  const app = express();
  app.use(express.json());
  registerTournamentReadRoutes(app, deps);
  return app;
}

function makeDeps(db) {
  return {
    db,
    logger: { warn: vi.fn(), error: vi.fn() },
    statsLimiter: (_req, _res, next) => next(),
    authLimiter: (_req, _res, next) => next(),
    requireAuth: (req, res, next) => {
      const uid = String(req.headers["x-user-uid"] || "");
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      req.user = { uid };
      next();
    },
    parseIntParam: (v, fallback) => {
      if (v === undefined || v === null || v === "") return fallback;
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    },
    tournamentsCache: {
      list: new Map(),
      details: new Map(),
      matchDetails: new Map(),
      context: new Map(),
      myRegistrations: new Map(),
    },
    trackTournamentReads: vi.fn(),
    userTournamentContextRef: (uid) => db.collection("user_tournament_context").doc(String(uid || "")),
    tournamentPublicViewRef: (id) => db.collection("tournament_public_view").doc(String(id || "")),
  };
}

describe("tournament read routes", () => {
  it("treats champion tournament as past regardless of startsAt", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "tournaments/t-finished": {
        title: "Finished Cup",
        startsAt: now + 24 * 60 * 60 * 1000,
        champion: { teamId: "team1", teamName: "Team 1" },
      },
    });
    const app = createApp(makeDeps(db));

    const pastRes = await request(app).get("/tournaments?status=past&limit=30");
    expect(pastRes.status).toBe(200);
    expect(Array.isArray(pastRes.body.rows)).toBe(true);
    expect(pastRes.body.rows.some((row) => row.id === "t-finished")).toBe(true);

    const ongoingRes = await request(app).get("/tournaments?status=ongoing&limit=30");
    expect(ongoingRes.status).toBe(200);
    expect(Array.isArray(ongoingRes.body.rows)).toBe(true);
    expect(ongoingRes.body.rows.some((row) => row.id === "t-finished")).toBe(false);
  });

  it("returns empty list for status with no matching tournaments", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "tournaments/t-upcoming-1": {
        title: "Future Cup",
        startsAt: now + 24 * 60 * 60 * 1000,
      },
      "tournaments/t-upcoming-2": {
        title: "Future Cup 2",
        startsAt: now + 48 * 60 * 60 * 1000,
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app).get("/tournaments?status=ongoing&limit=30");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ongoing");
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows).toEqual([]);
  });

  it("my-registrations prefers payload.tournamentIds even when empty", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "user_tournament_context/u1": {
        uid: "u1",
        updatedAt: now,
        payload: { tournamentIds: [] },
        tournamentIds: ["legacy-1"],
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .get("/tournaments/my-registrations")
      .set("x-user-uid", "u1");

    expect(res.status).toBe(200);
    expect(res.body.tournamentIds).toEqual([]);
    expect(res.body.materialized).toBe(true);
    expect(res.body.cached).toBe(true);
  });

  it("my-registrations uses legacy root ids when payload is absent", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "user_tournament_context/u1": {
        uid: "u1",
        updatedAt: now,
        tournamentIds: ["legacy-1", "legacy-2"],
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .get("/tournaments/registrations/my")
      .set("x-user-uid", "u1");

    expect(res.status).toBe(200);
    expect(res.body.tournamentIds).toEqual(["legacy-1", "legacy-2"]);
    expect(res.body.materialized).toBe(true);
  });

  it("my-registrations returns empty ids when materialized context is stale", async () => {
    const staleTs = Date.now() - 10 * 60 * 1000;
    const db = createFakeFirestore({
      "user_tournament_context/u1": {
        uid: "u1",
        updatedAt: staleTs,
        payload: { tournamentIds: ["t-stale-1", "t-stale-2"] },
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .get("/tournaments/my-registrations")
      .set("x-user-uid", "u1");

    expect(res.status).toBe(200);
    expect(res.body.tournamentIds).toEqual([]);
    expect(res.body.materialized).toBe(true);
    expect(res.body.stale).toBe(true);
    expect(res.body.cached).toBe(false);
  });

  it("my-registrations does not fallback to registrations collectionGroup scan", async () => {
    const db = createFakeFirestore({});
    db.collectionGroup = () => {
      throw new Error("collectionGroup should not be used in my-registrations");
    };
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .get("/tournaments/my-registrations")
      .set("x-user-uid", "u1");

    expect(res.status).toBe(200);
    expect(res.body.tournamentIds).toEqual([]);
    expect(res.body.materialized).toBe(false);
    expect(res.body.stale).toBe(true);
  });

  it("context/my ignores truncated materialized payload and rebuilds full context", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "user_tournament_context/u1": {
        uid: "u1",
        updatedAt: now,
        payload: {
          selfStats: { elo: 500, matches: 0, fragpunkId: "" },
          teams: [],
          tournamentIds: ["t1"],
          truncated: true,
        },
      },
      "leaderboard_users/u1": {
        name: "User One",
        hiddenElo: 777,
        matches: 12,
        settings: { fragpunkId: "UserOne#EU1" },
      },
      "teams/team1": {
        name: "Alpha",
        captainUid: "u1",
        memberUids: ["u1"],
        maxMembers: 5,
      },
      "tournaments/t1/registrations/team1": {
        teamId: "team1",
        memberUids: ["u1"],
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .get("/tournaments/context/my")
      .set("x-user-uid", "u1");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.teams)).toBe(true);
    expect(res.body.teams.length).toBe(1);
    expect(res.body.teams[0].id).toBe("team1");
    expect(res.body.selfStats.elo).toBe(777);
    expect(res.body.selfStats.fragpunkId).toBe("UserOne#EU1");
  });

  it("context/my uses non-truncated materialized payload", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "user_tournament_context/u1": {
        uid: "u1",
        updatedAt: now,
        payload: {
          selfStats: { elo: 901, matches: 44, fragpunkId: "Pro#TAG" },
          teams: [{ id: "team-x", name: "Team X", memberUids: ["u1"], membersStats: [] }],
          tournamentIds: ["t9"],
          truncated: false,
        },
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .get("/tournaments/context/my")
      .set("x-user-uid", "u1");

    expect(res.status).toBe(200);
    expect(res.body.materialized).toBe(true);
    expect(res.body.selfStats.elo).toBe(901);
    expect(res.body.tournamentIds).toEqual(["t9"]);
    expect(res.body.teams[0].id).toBe("team-x");
  });

  it("context/my requires auth", async () => {
    const db = createFakeFirestore({});
    const app = createApp(makeDeps(db));

    const res = await request(app).get("/tournaments/context/my");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("context/my degrades instead of 500 when profile query fails", async () => {
    const db = createFakeFirestore({});
    const baseCollection = db.collection.bind(db);
    db.collection = (name) => {
      if (String(name) === "leaderboard_users") {
        return {
          doc: () => ({
            get: () => Promise.reject(new Error("profile query failed")),
          }),
        };
      }
      return baseCollection(name);
    };
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .get("/tournaments/context/my")
      .set("x-user-uid", "u1");

    expect(res.status).toBe(200);
    expect(res.body.degraded).toBe(true);
    expect(res.body.stale).toBe(true);
    expect(res.body.selfStats).toEqual({ elo: 500, matches: 0, fragpunkId: "" });
    expect(res.body.teams).toEqual([]);
    expect(res.body.tournamentIds).toEqual([]);
  });

  it("context/my falls back to teams activeTournamentIds when registrations query is unavailable", async () => {
    const db = createFakeFirestore({
      "leaderboard_users/u1": {
        name: "User One",
        hiddenElo: 650,
        matches: 7,
        settings: { fragpunkId: "UserOne#EU1" },
      },
      "teams/team1": {
        name: "Alpha",
        captainUid: "u1",
        memberUids: ["u1"],
        maxMembers: 5,
        activeTournamentIds: ["t-lock-1", "t-lock-2"],
      },
    });
    db.collectionGroup = () => ({
      where: () => ({
        limit: () => ({
          get: () => Promise.reject(new Error("registrations unavailable")),
        }),
      }),
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .get("/tournaments/context/my")
      .set("x-user-uid", "u1");

    expect(res.status).toBe(200);
    expect(res.body.tournamentIds).toEqual(["t-lock-1", "t-lock-2"]);
  });

  it("context/my does not use registrations collectionGroup when fallback flag is disabled", async () => {
    const db = createFakeFirestore({
      "leaderboard_users/u1": {
        name: "User One",
        hiddenElo: 650,
        matches: 7,
        settings: { fragpunkId: "UserOne#EU1" },
      },
      "teams/team1": {
        name: "Alpha",
        captainUid: "u1",
        memberUids: ["u1"],
        maxMembers: 5,
        activeTournamentIds: ["t-lock-1"],
      },
    });
    db.collectionGroup = () => {
      throw new Error("collectionGroup should be disabled by default");
    };
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .get("/tournaments/context/my")
      .set("x-user-uid", "u1");

    expect(res.status).toBe(200);
    expect(res.body.tournamentIds).toEqual(["t-lock-1"]);
  });

  it("match details uses embedded match members without profile reads", async () => {
    const db = createFakeFirestore({
      "tournaments/t1": {
        title: "Cup",
        teamFormat: "2x2",
        bracketType: "single_elimination",
      },
      "tournaments/t1/matches/m1": {
        id: "m1",
        stage: "single",
        round: 1,
        status: "pending",
        bestOf: 1,
        teamA: {
          teamId: "teamA",
          teamName: "Alpha",
          captainUid: "u1",
          members: [
            { uid: "u1", name: "Captain A", role: "captain", elo: 1200, fragpunkId: "A#1" },
            { uid: "u2", name: "Player A", role: "player", elo: 1180, fragpunkId: "A#2" },
          ],
        },
        teamB: {
          teamId: "teamB",
          teamName: "Beta",
          captainUid: "u3",
          members: [
            { uid: "u3", name: "Captain B", role: "captain", elo: 1210, fragpunkId: "B#1" },
            { uid: "u4", name: "Player B", role: "player", elo: 1170, fragpunkId: "B#2" },
          ],
        },
      },
    });
    const baseCollection = db.collection.bind(db);
    db.collection = (name) => {
      if (String(name) === "leaderboard_users") {
        return {
          doc: () => ({
            get: () => Promise.reject(new Error("profile read should not happen")),
          }),
        };
      }
      return baseCollection(name);
    };
    const app = createApp(makeDeps(db));

    const res = await request(app).get("/tournaments/t1/matches/m1");
    expect(res.status).toBe(200);
    expect(String(res.body?.match?.teamA?.members?.[0]?.name || "")).toBe("Captain A");
    expect(String(res.body?.match?.teamB?.members?.[0]?.name || "")).toBe("Captain B");
  });

  it("match details supports mixed sources: embedded side + registrations side", async () => {
    const db = createFakeFirestore({
      "tournaments/t1": {
        title: "Cup",
        teamFormat: "2x2",
        bracketType: "single_elimination",
      },
      "tournaments/t1/matches/m1": {
        id: "m1",
        stage: "single",
        round: 1,
        status: "pending",
        bestOf: 1,
        teamA: {
          teamId: "teamA",
          teamName: "Alpha",
          captainUid: "u1",
          members: [
            { uid: "u1", name: "Captain A", role: "captain", elo: 1200, fragpunkId: "A#1" },
            { uid: "u2", name: "Player A", role: "player", elo: 1180, fragpunkId: "A#2" },
          ],
        },
        teamB: {
          teamId: "teamB",
          teamName: "Beta",
        },
      },
      "tournaments/t1/registrations/teamB": {
        teamId: "teamB",
        teamName: "Beta",
        captainUid: "u3",
        memberUids: ["u3", "u4"],
      },
      "leaderboard_users/u3": {
        name: "Captain B",
        hiddenElo: 1210,
        matches: 30,
        settings: { fragpunkId: "B#1" },
      },
      "leaderboard_users/u4": {
        name: "Player B",
        hiddenElo: 1170,
        matches: 25,
        settings: { fragpunkId: "B#2" },
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app).get("/tournaments/t1/matches/m1");
    expect(res.status).toBe(200);
    expect(String(res.body?.match?.teamA?.members?.[0]?.name || "")).toBe("Captain A");
    expect(String(res.body?.match?.teamB?.members?.[0]?.name || "")).toBe("Captain B");
    expect(String(res.body?.match?.teamB?.captainUid || "")).toBe("u3");
  });
});
