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
});
