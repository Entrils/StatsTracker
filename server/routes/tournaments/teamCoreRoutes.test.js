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
});
