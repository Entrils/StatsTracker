import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerTournamentAdminRoutes } from "./tournamentAdminRoutes.js";
import { createFakeFirestore, createAdminMock } from "./testFirestore.js";

function createApp(deps) {
  const app = express();
  app.use(express.json());
  registerTournamentAdminRoutes(app, deps);
  return app;
}

function makeDeps(db) {
  const admin = createAdminMock();
  return {
    admin: {
      ...admin,
      firestore: {
        ...admin.firestore,
        FieldPath: {
          documentId: () => "__name__",
        },
      },
    },
    db,
    logger: { warn: vi.fn(), error: vi.fn() },
    authLimiter: (_req, _res, next) => next(),
    requireAuth: (req, res, next) => {
      const uid = String(req.headers["x-user-uid"] || "");
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      const adminFlag = String(req.headers["x-user-admin"] || "") === "1";
      req.user = { uid, admin: adminFlag, role: adminFlag ? "admin" : "user" };
      next();
    },
    invalidateTournamentCaches: vi.fn(),
    clearTournamentPublicView: vi.fn().mockResolvedValue(undefined),
    userTournamentContextRef: () => ({ set: () => Promise.resolve() }),
  };
}

function seedFinalMatch(now = Date.now()) {
  return {
    "tournaments/t1": {
      title: "Final Cup",
      bracketType: "single_elimination",
    },
    "tournaments/t1/matches/r1_m1": {
      id: "r1_m1",
      stage: "single",
      round: 1,
      status: "pending",
      teamA: { teamId: "team-a", teamName: "A" },
      teamB: { teamId: "team-b", teamName: "B" },
      scheduledAt: now - 10 * 60 * 1000,
      readyCheck: {
        teamAReady: false,
        teamBReady: false,
      },
    },
  };
}

describe("tournament admin routes", () => {
  it("ready timeout both teams completes match and closes tournament (endsAt)", async () => {
    const db = createFakeFirestore(seedFinalMatch(Date.now()));
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/matches/r1_m1/ready")
      .set("x-user-uid", "captain-any")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.technicalForfeit).toBe(true);
    expect(res.body.doubleForfeit).toBe(true);

    const match = db._store.get("tournaments/t1/matches/r1_m1") || {};
    expect(match.status).toBe("completed");
    expect(match.winnerTeamId).toBeNull();
    expect(String(match?.forfeit?.type || "")).toBe("ready_timeout_both");

    const tournament = db._store.get("tournaments/t1") || {};
    expect(Number.isFinite(Number(tournament.endsAt))).toBe(true);
  });

  it("veto timeout both teams completes match and closes tournament (endsAt)", async () => {
    const db = createFakeFirestore(seedFinalMatch(Date.now()));
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/matches/r1_m1/veto")
      .set("x-user-uid", "captain-any")
      .send({ action: "ban", map: "Naos" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.technicalForfeit).toBe(true);
    expect(res.body.doubleForfeit).toBe(true);

    const match = db._store.get("tournaments/t1/matches/r1_m1") || {};
    expect(match.status).toBe("completed");
    expect(match.winnerTeamId).toBeNull();

    const tournament = db._store.get("tournaments/t1") || {};
    expect(Number.isFinite(Number(tournament.endsAt))).toBe(true);
  });

  it("reset result clears champion and endsAt", async () => {
    const db = createFakeFirestore({
      "tournaments/t1": {
        title: "Cup",
        bracketType: "single_elimination",
        champion: { teamId: "team-a", teamName: "A" },
        endsAt: Date.now(),
      },
      "tournaments/t1/matches/r1_m1": {
        id: "r1_m1",
        stage: "single",
        round: 1,
        status: "completed",
        teamA: { teamId: "team-a", teamName: "A" },
        teamB: { teamId: "team-b", teamName: "B" },
        winnerTeamId: "team-a",
        winner: { teamId: "team-a", teamName: "A" },
        loser: { teamId: "team-b", teamName: "B" },
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/matches/r1_m1/result")
      .set("x-user-uid", "admin-1")
      .set("x-user-admin", "1")
      .send({ reset: true });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const tournament = db._store.get("tournaments/t1") || {};
    expect(tournament.champion).toBeNull();
    expect(tournament.endsAt).toBeNull();
  });
});

