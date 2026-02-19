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
});
