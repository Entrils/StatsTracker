import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerTournamentRegistrationRoutes } from "./tournamentRegistrationRoutes.js";
import { createFakeFirestore, createAdminMock } from "./testFirestore.js";

function createApp(deps) {
  const app = express();
  app.use(express.json());
  registerTournamentRegistrationRoutes(app, deps);
  return app;
}

function makeDeps(db) {
  return {
    admin: createAdminMock(),
    db,
    logger: { warn: vi.fn(), error: vi.fn() },
    authLimiter: (_req, _res, next) => next(),
    requireAuth: (req, res, next) => {
      const uid = String(req.headers["x-user-uid"] || "");
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      req.user = { uid };
      next();
    },
    findUserTeamInFormat: vi.fn(),
    invalidateTournamentCaches: vi.fn(),
    userTournamentContextRef: (uid) =>
      db.collection("user_tournament_context").doc(String(uid || "")),
    clearTournamentPublicView: vi.fn().mockResolvedValue(undefined),
  };
}

describe("tournament registration routes", () => {
  it("registers solo player successfully when requirements are met", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "tournaments/t1": {
        title: "Solo Cup",
        teamFormat: "1x1",
        startsAt: now + 60_000,
        maxTeams: 8,
        registeredTeams: 0,
        requirements: { minElo: 1000, minMatches: 5 },
      },
      "leaderboard_users/u1": {
        name: "Solo",
        hiddenElo: 1200,
        matches: 10,
        settings: { fragpunkId: "Solo#EU1" },
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/register-team")
      .set("x-user-uid", "u1")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect((db._store.get("tournaments/t1/registrations/u1") || {}).teamId).toBe("u1");
    expect((db._store.get("tournaments/t1") || {}).registeredTeams).toBe(1);
  });

  it("rejects solo registration when FragPunk ID is missing", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "tournaments/t1": {
        title: "Solo Cup",
        teamFormat: "1x1",
        startsAt: now + 60_000,
        maxTeams: 8,
        registeredTeams: 0,
      },
      "leaderboard_users/u1": {
        name: "Solo",
        hiddenElo: 1200,
        matches: 10,
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/register-team")
      .set("x-user-uid", "u1")
      .send({});

    expect(res.status).toBe(409);
    expect(String(res.body.error || "")).toContain("FragPunk ID is required");
    expect(db._store.get("tournaments/t1/registrations/u1")).toBeUndefined();
  });

  it("rejects team registration when team format does not match tournament format", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "tournaments/t1": {
        title: "Duo Cup",
        teamFormat: "2x2",
        startsAt: now + 60_000,
        maxTeams: 8,
        registeredTeams: 0,
      },
      "teams/team1": {
        name: "Alpha",
        captainUid: "u1",
        memberUids: ["u1", "u2", "u3"],
        maxMembers: 4,
        teamFormat: "3x3",
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/register-team")
      .set("x-user-uid", "u1")
      .send({ teamId: "team1" });

    expect(res.status).toBe(409);
    expect(String(res.body.error || "")).toContain("does not match tournament format");
  });

  it("rejects team registration when roster size is outside main+reserve bounds", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "tournaments/t1": {
        title: "Duo Cup",
        teamFormat: "2x2",
        startsAt: now + 60_000,
        maxTeams: 8,
        registeredTeams: 0,
      },
      "teams/team1": {
        name: "Alpha",
        captainUid: "u1",
        memberUids: ["u1", "u2", "u3", "u4"],
        maxMembers: 3,
        teamFormat: "2x2",
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/register-team")
      .set("x-user-uid", "u1")
      .send({ teamId: "team1" });

    expect(res.status).toBe(409);
    expect(String(res.body.error || "")).toContain("main players");
  });

  it("rejects team registration when a member is already registered in this tournament", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "tournaments/t1": {
        title: "Duo Cup",
        teamFormat: "2x2",
        startsAt: now + 60_000,
        maxTeams: 8,
        registeredTeams: 1,
      },
      "teams/team1": {
        name: "Alpha",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
        maxMembers: 3,
        teamFormat: "2x2",
      },
      "tournaments/t1/registrations/team-other": {
        teamId: "team-other",
        memberUids: ["u9", "u2"],
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/register-team")
      .set("x-user-uid", "u1")
      .send({ teamId: "team1" });

    expect(res.status).toBe(409);
    expect(String(res.body.error || "")).toContain("already registered");
  });

  it("registers team and updates active locks + counters", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "tournaments/t1": {
        title: "Duo Cup",
        teamFormat: "2x2",
        startsAt: now + 60_000,
        maxTeams: 8,
        registeredTeams: 0,
        requirements: { minElo: 500, minMatches: 0 },
      },
      "teams/team1": {
        name: "Alpha",
        captainUid: "u1",
        memberUids: ["u1", "u2", "u3"],
        maxMembers: 3,
        teamFormat: "2x2",
      },
      "leaderboard_users/u1": {
        name: "P1",
        hiddenElo: 700,
        matches: 9,
        settings: { fragpunkId: "P1#EU1" },
      },
      "leaderboard_users/u2": {
        name: "P2",
        hiddenElo: 800,
        matches: 11,
        settings: { fragpunkId: "P2#EU1" },
      },
      "leaderboard_users/u3": {
        name: "Sub",
        hiddenElo: 650,
        matches: 7,
        settings: { fragpunkId: "Sub#EU1" },
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/register-team")
      .set("x-user-uid", "u1")
      .send({ teamId: "team1" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect((db._store.get("tournaments/t1/registrations/team1") || {}).teamId).toBe("team1");
    expect((db._store.get("tournaments/t1") || {}).registeredTeams).toBe(1);
    expect((db._store.get("teams/team1") || {}).activeTournamentIds).toContain("t1");
    expect((db._store.get("team_public_stats/team1") || {}).stale).toBe(true);
  });

  it("blocks registration when tournament is already full", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "tournaments/t1": {
        title: "Full Cup",
        teamFormat: "1x1",
        startsAt: now + 60_000,
        maxTeams: 2,
        registeredTeams: 2,
      },
      "leaderboard_users/u1": {
        name: "Solo",
        hiddenElo: 1200,
        matches: 10,
        settings: { fragpunkId: "Solo#EU1" },
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/register-team")
      .set("x-user-uid", "u1")
      .send({});

    expect(res.status).toBe(409);
    expect(String(res.body.error || "")).toContain("Tournament is full");
  });

  it("blocks registration when tournament is not upcoming anymore", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "tournaments/t1": {
        title: "Live Cup",
        teamFormat: "1x1",
        startsAt: now - 60_000,
        maxTeams: 16,
        registeredTeams: 1,
      },
      "leaderboard_users/u1": {
        name: "Solo",
        hiddenElo: 1200,
        matches: 10,
        settings: { fragpunkId: "Solo#EU1" },
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/register-team")
      .set("x-user-uid", "u1")
      .send({});

    expect(res.status).toBe(409);
    expect(String(res.body.error || "")).toContain("Registration is closed");
  });
});
