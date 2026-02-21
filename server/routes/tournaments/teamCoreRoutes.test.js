import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerTeamCoreRoutes } from "./teamCoreRoutes.js";
import { createFakeFirestore, createAdminMock } from "./testFirestore.js";

function createApp(deps) {
  const app = express();
  app.use(express.json());
  registerTeamCoreRoutes(app, deps);
  return app;
}

function makeDeps(db) {
  return {
    admin: createAdminMock(),
    db,
    logger: { warn: vi.fn(), error: vi.fn() },
    authLimiter: (_req, _res, next) => next(),
    statsLimiter: (_req, _res, next) => next(),
    requireAuth: (req, res, next) => {
      const uid = String(req.headers["x-user-uid"] || "");
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      req.user = { uid };
      next();
    },
    findUserTeamInFormat: vi.fn().mockResolvedValue(null),
    isValidUid: (uid) => typeof uid === "string" && uid.length > 0,
    teamsCache: { my: new Map() },
    invalidateTeamsCaches: vi.fn(),
    invalidateTournamentCaches: vi.fn(),
    userTournamentContextRef: () => ({ set: () => Promise.resolve(), delete: () => Promise.resolve() }),
  };
}

describe("team core routes", () => {
  it("blocks creating team when name lock is already held by another team", async () => {
    const db = createFakeFirestore({
      "team_name_locks/alpha": {
        teamId: "existing-team",
        nameLower: "alpha",
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/teams")
      .set("x-user-uid", "u1")
      .send({ name: "Alpha", maxMembers: 5 });

    expect(res.status).toBe(409);
    expect(String(res.body.error || "")).toContain("Team name already exists");
  });

  it("creates team with explicit teamFormat and +1 reserve slot", async () => {
    const db = createFakeFirestore({});
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/teams")
      .set("x-user-uid", "u1")
      .send({ name: "Alpha", teamFormat: "3x3" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const createdId = String(res.body.id || "");
    const created = db._store.get(`teams/${createdId}`) || {};
    expect(created.teamFormat).toBe("3x3");
    expect(created.maxMembers).toBe(4);
    expect(created.memberUids).toEqual(["u1"]);
  });

  it("blocks renaming team when target name lock is held by another team", async () => {
    const db = createFakeFirestore({
      "teams/team7": {
        name: "Bravo",
        nameLower: "bravo",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "team_name_locks/bravo": {
        teamId: "team7",
        nameLower: "bravo",
      },
      "team_name_locks/alpha": {
        teamId: "other-team",
        nameLower: "alpha",
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .patch("/teams/team7")
      .set("x-user-uid", "u1")
      .send({ name: "Alpha" });

    expect(res.status).toBe(409);
    expect(String(res.body.error || "")).toContain("Team name already exists");
    expect((db._store.get("teams/team7") || {}).name).toBe("Bravo");
  });

  it("blocks kick when team has active upcoming registration", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "teams/team1": {
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "tournaments/t1": {
        title: "Cup",
        startsAt: now + 60_000,
      },
      "tournaments/t1/registrations/team1": {
        teamId: "team1",
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/teams/team1/kick")
      .set("x-user-uid", "u1")
      .send({ uid: "u2" });

    expect(res.status).toBe(409);
    expect(String(res.body.error || "")).toContain("Cannot change roster");
    expect((db._store.get("teams/team1") || {}).memberUids).toEqual(["u1", "u2"]);
  });

  it("allows deleting team when only stale past activeTournamentIds exist", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "teams/team2": {
        captainUid: "u1",
        memberUids: ["u1", "u2"],
        activeTournamentIds: ["past-1"],
      },
      "tournaments/past-1": {
        title: "Old cup",
        endsAt: now - 60_000,
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .delete("/teams/team2")
      .set("x-user-uid", "u1");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db._store.get("teams/team2")).toBeUndefined();
  });

  it("prevents captain from leaving team", async () => {
    const db = createFakeFirestore({
      "teams/team3": {
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/teams/team3/leave")
      .set("x-user-uid", "u1")
      .send({});

    expect(res.status).toBe(409);
    expect(String(res.body.error || "")).toContain("Captain cannot leave team");
  });

  it("transfers captain successfully when no active registration", async () => {
    const db = createFakeFirestore({
      "teams/team4": {
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/teams/team4/transfer-captain")
      .set("x-user-uid", "u1")
      .send({ uid: "u2" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect((db._store.get("teams/team4") || {}).captainUid).toBe("u2");
  });

  it("sets member role to reserve via set-role endpoint", async () => {
    const db = createFakeFirestore({
      "teams/team5": {
        captainUid: "u1",
        memberUids: ["u1", "u2", "u3"],
        reserveUid: "",
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/teams/team5/set-role")
      .set("x-user-uid", "u1")
      .send({ uid: "u3", role: "reserve" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect((db._store.get("teams/team5") || {}).reserveUid).toBe("u3");
  });

  it("blocks setting captain role to reserve", async () => {
    const db = createFakeFirestore({
      "teams/team5": {
        captainUid: "u1",
        memberUids: ["u1", "u2", "u3"],
        reserveUid: "",
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/teams/team5/set-role")
      .set("x-user-uid", "u1")
      .send({ uid: "u1", role: "reserve" });

    expect(res.status).toBe(409);
    expect(String(res.body.error || "")).toContain("Captain cannot be reserve");
  });

  it("blocks deleting team with active ongoing registration", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "teams/team7": {
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "tournaments/t-active": {
        title: "Live cup",
        startsAt: now - 60_000,
      },
      "tournaments/t-active/registrations/team7": {
        teamId: "team7",
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .delete("/teams/team7")
      .set("x-user-uid", "u1");

    expect(res.status).toBe(409);
    expect(String(res.body.error || "")).toContain("cannot be deleted");
    expect(db._store.get("teams/team7")).toBeTruthy();
  });

  it("marks placement=1 in recent tournaments when team is champion object", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "teams/team6": {
        name: "Winners",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "leaderboard_users/u1": {
        name: "Captain",
        hiddenElo: 1200,
        matches: 20,
      },
      "leaderboard_users/u2": {
        name: "Mate",
        hiddenElo: 1150,
        matches: 19,
      },
      "tournaments/t-win": {
        title: "Championship",
        startsAt: now - 86_400_000,
        champion: { teamId: "team6", teamName: "Winners" },
      },
      "tournaments/t-win/registrations/team6": {
        teamId: "team6",
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app).get("/teams/team6/public");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.recentTournaments)).toBe(true);
    expect(res.body.recentTournaments[0].id).toBe("t-win");
    expect(res.body.recentTournaments[0].placement).toBe(1);
  });

  it("uses materialized team_public_stats for public details without analytics scans", async () => {
    const db = createFakeFirestore({
      "teams/team8": {
        name: "Alpha",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "leaderboard_users/u1": {
        name: "Cap",
        hiddenElo: 1200,
        matches: 20,
      },
      "leaderboard_users/u2": {
        name: "Mate",
        hiddenElo: 1100,
        matches: 18,
      },
      "team_public_stats/team8": {
        teamId: "team8",
        stale: false,
        stats: { wins: 11, losses: 4, matchesPlayed: 15, winRate: 73 },
        recentTournaments: [{ id: "t1", title: "Cup #1" }],
        matchHistory: [{ id: "m1", tournamentId: "t1", result: "win" }],
      },
    });
    db.collectionGroup = () => {
      throw new Error("collectionGroup should not be used when materialized stats exist");
    };
    const app = createApp(makeDeps(db));

    const res = await request(app).get("/teams/team8/public");
    expect(res.status).toBe(200);
    expect(res.body.stats).toEqual({
      wins: 11,
      losses: 4,
      matchesPlayed: 15,
      winRate: 73,
    });
    expect(res.body.recentTournaments).toEqual([{ id: "t1", title: "Cup #1" }]);
    expect(res.body.matchHistory).toEqual([{ id: "m1", tournamentId: "t1", result: "win" }]);
  });

  it("returns 304 for /teams/:id/public when ETag matches", async () => {
    const db = createFakeFirestore({
      "teams/team9": {
        name: "Echo",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "leaderboard_users/u1": {
        name: "Cap",
        hiddenElo: 1200,
        matches: 20,
      },
      "leaderboard_users/u2": {
        name: "Mate",
        hiddenElo: 1100,
        matches: 18,
      },
      "team_public_stats/team9": {
        teamId: "team9",
        stale: false,
        stats: { wins: 2, losses: 1, matchesPlayed: 3, winRate: 67 },
        recentTournaments: [],
        matchHistory: [],
      },
    });
    const app = createApp(makeDeps(db));

    const first = await request(app).get("/teams/team9/public");
    expect(first.status).toBe(200);
    const etag = String(first.headers.etag || "");
    expect(etag).toBeTruthy();

    const second = await request(app)
      .get("/teams/team9/public")
      .set("If-None-Match", etag);
    expect(second.status).toBe(304);
  });

  it("recomputes and refreshes team_public_stats when materialized doc is stale", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "teams/team10": {
        name: "Recalc",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "leaderboard_users/u1": {
        name: "Cap",
        hiddenElo: 1200,
        matches: 20,
      },
      "leaderboard_users/u2": {
        name: "Mate",
        hiddenElo: 1100,
        matches: 18,
      },
      "team_public_stats/team10": {
        teamId: "team10",
        stale: true,
        stats: { wins: 99, losses: 0, matchesPlayed: 99, winRate: 100 },
      },
      "tournaments/t10": {
        title: "Cup 10",
        startsAt: now - 10_000,
      },
      "tournaments/t10/registrations/team10": {
        teamId: "team10",
      },
      "tournaments/t10/matches/m1": {
        teamA: { teamId: "team10", teamName: "Recalc" },
        teamB: { teamId: "teamX", teamName: "Opp" },
        status: "completed",
        winnerTeamId: "team10",
        round: 1,
        stage: "single",
        updatedAt: now - 5_000,
      },
    });
    let collectionGroupCalls = 0;
    const baseCollectionGroup = db.collectionGroup.bind(db);
    db.collectionGroup = (...args) => {
      collectionGroupCalls += 1;
      return baseCollectionGroup(...args);
    };
    const app = createApp(makeDeps(db));

    const res = await request(app).get("/teams/team10/public");
    expect(res.status).toBe(200);
    expect(collectionGroupCalls).toBeGreaterThan(0);
    expect(res.body.stats.wins).toBe(1);
    expect(res.body.stats.losses).toBe(0);

    const refreshedStats = db._store.get("team_public_stats/team10") || {};
    expect(refreshedStats.stale).toBe(false);
    expect((refreshedStats.stats || {}).wins).toBe(1);
  });

  it("recomputes team stats when registration doc has only tournamentId in data", async () => {
    const now = Date.now();
    const db = createFakeFirestore({
      "teams/team11": {
        name: "DataFallback",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "leaderboard_users/u1": {
        name: "Cap",
        hiddenElo: 1200,
        matches: 20,
      },
      "leaderboard_users/u2": {
        name: "Mate",
        hiddenElo: 1100,
        matches: 18,
      },
      "team_public_stats/team11": {
        teamId: "team11",
        stale: true,
      },
      "tournaments/t11": {
        title: "Cup 11",
        startsAt: now - 20_000,
        champion: { teamId: "team11", teamName: "DataFallback" },
      },
      "tournaments/t11/matches/m1": {
        teamA: { teamId: "team11", teamName: "DataFallback" },
        teamB: { teamId: "teamX", teamName: "Opp" },
        status: "completed",
        winnerTeamId: "team11",
        round: 1,
        stage: "single",
        updatedAt: now - 10_000,
      },
    });
    const baseCollectionGroup = db.collectionGroup.bind(db);
    db.collectionGroup = (name) => {
      if (String(name) !== "registrations") return baseCollectionGroup(name);
      return {
        where: () => ({
          limit: () => ({
            get: async () => ({
              docs: [
                {
                  data: () => ({ teamId: "team11", tournamentId: "t11" }),
                  ref: { path: "", parent: null },
                },
              ],
            }),
          }),
        }),
      };
    };
    const app = createApp(makeDeps(db));

    const res = await request(app).get("/teams/team11/public");
    expect(res.status).toBe(200);
    expect(res.body.stats.wins).toBe(1);
    expect(res.body.recentTournaments[0].id).toBe("t11");
    expect(res.body.recentTournaments[0].placement).toBe(1);
  });
});
