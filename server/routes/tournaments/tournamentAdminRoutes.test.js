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

function adminPost(app, path, body = {}) {
  return request(app)
    .post(path)
    .set("x-user-uid", "admin-1")
    .set("x-user-admin", "1")
    .send(body);
}

function seedTournamentWithRegistrations({
  tournamentId = "t1",
  title = "Cup",
  bracketType = "single_elimination",
  teamFormat = "2x2",
  participantCount = 8,
  startsAt = Date.now() - 60_000,
} = {}) {
  const out = {
    [`tournaments/${tournamentId}`]: {
      title,
      bracketType,
      teamFormat,
      startsAt,
      maxTeams: Math.max(2, participantCount),
      registeredTeams: participantCount,
    },
  };
  for (let i = 1; i <= participantCount; i += 1) {
    const teamId = `team-${i}`;
    out[`tournaments/${tournamentId}/registrations/${teamId}`] = {
      teamId,
      teamName: `Team ${i}`,
      captainUid: `captain-${i}`,
      memberUids: [`u${i}a`, `u${i}b`],
      avgEloSnapshot: 2200 - i * 10,
      createdAt: Date.now(),
    };
  }
  return out;
}

function listMatchDocs(db, tournamentId = "t1") {
  const prefix = `tournaments/${tournamentId}/matches/`;
  return [...db._store.entries()]
    .filter(([path]) => String(path).startsWith(prefix))
    .filter(([path]) => String(path).split("/").length === 4)
    .map(([path, data]) => ({
      id: String(path).split("/").pop(),
      ...(data || {}),
    }));
}

async function resolvePlayableMatches({
  app,
  db,
  tournamentId = "t1",
  stageAllowSet = null,
  maxSteps = 300,
} = {}) {
  let steps = 0;
  while (steps < maxSteps) {
    const next = listMatchDocs(db, tournamentId)
      .filter((m) => String(m?.status || "") === "pending")
      .filter((m) => String(m?.teamA?.teamId || "") && String(m?.teamB?.teamId || ""))
      .filter((m) => (!stageAllowSet ? true : stageAllowSet.has(String(m?.stage || ""))))
      .sort((a, b) => {
        const roundDelta = Number(a?.round || 0) - Number(b?.round || 0);
        if (roundDelta !== 0) return roundDelta;
        return String(a.id || "").localeCompare(String(b.id || ""));
      })[0];
    if (!next) break;
    const winnerTeamId = String(next?.teamA?.teamId || "");
    const res = await adminPost(
      app,
      `/tournaments/${tournamentId}/matches/${String(next.id || "")}/result`,
      { winnerTeamId }
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    steps += 1;
  }
  expect(steps).toBeLessThan(maxSteps);
}

describe("tournament admin routes", () => {
  it("single elimination invariant: resolves to champion for multiple bracket sizes", async () => {
    const sizes = [2, 3, 4, 5, 8, 16];
    for (const participantCount of sizes) {
      const db = createFakeFirestore(
        seedTournamentWithRegistrations({
          tournamentId: "t1",
          title: `Single ${participantCount}`,
          bracketType: "single_elimination",
          participantCount,
        })
      );
      const app = createApp(makeDeps(db));

      const generateRes = await adminPost(app, "/tournaments/t1/generate-bracket", {});
      expect(generateRes.status).toBe(200);
      expect(generateRes.body.ok).toBe(true);

      await resolvePlayableMatches({ app, db, tournamentId: "t1" });

      const tournament = db._store.get("tournaments/t1") || {};
      const championId = String(tournament?.champion?.teamId || "");
      expect(championId).toBeTruthy();

      const seededIds = Array.from({ length: participantCount }, (_, i) => `team-${i + 1}`);
      expect(seededIds.includes(championId)).toBe(true);

      const playablePending = listMatchDocs(db, "t1").filter(
        (m) =>
          String(m?.status || "") === "pending" &&
          String(m?.teamA?.teamId || "") &&
          String(m?.teamB?.teamId || "")
      );
      expect(playablePending.length).toBe(0);
    }
  });

  it("group+playoff invariant: champion exists after groups completed and playoff resolved", async () => {
    const db = createFakeFirestore(
      seedTournamentWithRegistrations({
        tournamentId: "t1",
        title: "Group Playoff 8",
        bracketType: "group_playoff",
        participantCount: 8,
      })
    );
    const app = createApp(makeDeps(db));

    const generateGroupRes = await adminPost(app, "/tournaments/t1/generate-bracket", {});
    expect(generateGroupRes.status).toBe(200);
    expect(generateGroupRes.body.ok).toBe(true);

    await resolvePlayableMatches({
      app,
      db,
      tournamentId: "t1",
      stageAllowSet: new Set(["group"]),
      maxSteps: 500,
    });

    const generatePlayoffRes = await adminPost(app, "/tournaments/t1/generate-playoff", {});
    expect(generatePlayoffRes.status).toBe(200);
    expect(generatePlayoffRes.body.ok).toBe(true);

    await resolvePlayableMatches({
      app,
      db,
      tournamentId: "t1",
      stageAllowSet: new Set(["playoff"]),
      maxSteps: 500,
    });

    const tournament = db._store.get("tournaments/t1") || {};
    const championId = String(tournament?.champion?.teamId || "");
    expect(championId).toBeTruthy();
    expect(Array.from({ length: 8 }, (_, i) => `team-${i + 1}`).includes(championId)).toBe(true);

    const playablePending = listMatchDocs(db, "t1").filter(
      (m) =>
        String(m?.stage || "") === "playoff" &&
        String(m?.status || "") === "pending" &&
        String(m?.teamA?.teamId || "") &&
        String(m?.teamB?.teamId || "")
    );
    expect(playablePending.length).toBe(0);
  });

  it("double elimination invariant: resolves to champion and leaves no playable pending matches", async () => {
    const db = createFakeFirestore(
      seedTournamentWithRegistrations({
        tournamentId: "t1",
        title: "Double 8",
        bracketType: "double_elimination",
        participantCount: 8,
      })
    );
    const app = createApp(makeDeps(db));

    const generateRes = await adminPost(app, "/tournaments/t1/generate-bracket", {});
    expect(generateRes.status).toBe(200);
    expect(generateRes.body.ok).toBe(true);

    await resolvePlayableMatches({
      app,
      db,
      tournamentId: "t1",
      maxSteps: 1000,
    });

    const tournament = db._store.get("tournaments/t1") || {};
    const championId = String(tournament?.champion?.teamId || "");
    expect(championId).toBeTruthy();
    expect(Array.from({ length: 8 }, (_, i) => `team-${i + 1}`).includes(championId)).toBe(true);

    const playablePending = listMatchDocs(db, "t1").filter(
      (m) =>
        String(m?.status || "") === "pending" &&
        String(m?.teamA?.teamId || "") &&
        String(m?.teamB?.teamId || "")
    );
    expect(playablePending.length).toBe(0);
  });

  it("completes group+playoff tournament after playoff final result", async () => {
    const db = createFakeFirestore({
      "tournaments/t1": {
        title: "Group Playoff Cup",
        bracketType: "group_playoff",
        startsAt: Date.now() - 60_000,
      },
      "tournaments/t1/matches/p1_m1": {
        id: "p1_m1",
        stage: "playoff",
        round: 1,
        status: "pending",
        teamA: { teamId: "team-a", teamName: "A" },
        teamB: { teamId: "team-b", teamName: "B" },
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/matches/p1_m1/result")
      .set("x-user-uid", "admin-1")
      .set("x-user-admin", "1")
      .send({ winnerTeamId: "team-a" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const tournament = db._store.get("tournaments/t1") || {};
    expect(String(tournament?.champion?.teamId || "")).toBe("team-a");
    expect(Number.isFinite(Number(tournament.endsAt))).toBe(true);
  });

  it("result response omits alreadyCompleted for fresh completion", async () => {
    const db = createFakeFirestore({
      "tournaments/t1": {
        title: "Contract Cup",
        bracketType: "single_elimination",
        startsAt: Date.now() - 60_000,
      },
      "tournaments/t1/matches/r1_m1": {
        id: "r1_m1",
        stage: "single",
        round: 1,
        status: "pending",
        teamA: { teamId: "team-a", teamName: "A" },
        teamB: { teamId: "team-b", teamName: "B" },
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/matches/r1_m1/result")
      .set("x-user-uid", "admin-1")
      .set("x-user-admin", "1")
      .send({ winnerTeamId: "team-a" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.nextMatchId).toBeNull();
    expect(res.body.alreadyCompleted).toBeUndefined();
  });

  it("reconciles tournament completion on idempotent repeated final result", async () => {
    const db = createFakeFirestore({
      "tournaments/t1": {
        title: "Group Playoff Cup",
        bracketType: "group_playoff",
        startsAt: Date.now() - 60_000,
      },
      "tournaments/t1/matches/p1_m1": {
        id: "p1_m1",
        stage: "playoff",
        round: 1,
        status: "completed",
        teamA: { teamId: "team-a", teamName: "A" },
        teamB: { teamId: "team-b", teamName: "B" },
        winnerTeamId: "team-a",
        winner: { teamId: "team-a", teamName: "A" },
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/matches/p1_m1/result")
      .set("x-user-uid", "admin-1")
      .set("x-user-admin", "1")
      .send({ winnerTeamId: "team-a" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.alreadyCompleted).toBe(true);

    const tournament = db._store.get("tournaments/t1") || {};
    expect(String(tournament?.champion?.teamId || "")).toBe("team-a");
    expect(Number.isFinite(Number(tournament.endsAt))).toBe(true);
  });

  it("completes double elimination tournament after grand final result", async () => {
    const db = createFakeFirestore({
      "tournaments/t1": {
        title: "Double Elim Cup",
        bracketType: "double_elimination",
        startsAt: Date.now() - 60_000,
      },
      "tournaments/t1/matches/gf1_m1": {
        id: "gf1_m1",
        stage: "grand_final",
        round: 1,
        status: "pending",
        teamA: { teamId: "team-a", teamName: "A" },
        teamB: { teamId: "team-b", teamName: "B" },
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/matches/gf1_m1/result")
      .set("x-user-uid", "admin-1")
      .set("x-user-admin", "1")
      .send({ winnerTeamId: "team-a" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const tournament = db._store.get("tournaments/t1") || {};
    expect(String(tournament?.champion?.teamId || "")).toBe("team-a");
    expect(Number.isFinite(Number(tournament.endsAt))).toBe(true);
  });

  it("reconciles double elimination completion on idempotent repeated grand final result", async () => {
    const db = createFakeFirestore({
      "tournaments/t1": {
        title: "Double Elim Cup",
        bracketType: "double_elimination",
        startsAt: Date.now() - 60_000,
      },
      "tournaments/t1/matches/gf1_m1": {
        id: "gf1_m1",
        stage: "grand_final",
        round: 1,
        status: "completed",
        teamA: { teamId: "team-a", teamName: "A" },
        teamB: { teamId: "team-b", teamName: "B" },
        winnerTeamId: "team-a",
        winner: { teamId: "team-a", teamName: "A" },
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/matches/gf1_m1/result")
      .set("x-user-uid", "admin-1")
      .set("x-user-admin", "1")
      .send({ winnerTeamId: "team-a" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.alreadyCompleted).toBe(true);

    const tournament = db._store.get("tournaments/t1") || {};
    expect(String(tournament?.champion?.teamId || "")).toBe("team-a");
    expect(Number.isFinite(Number(tournament.endsAt))).toBe(true);
  });

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

  it("clears match chat after setting match result", async () => {
    const db = createFakeFirestore({
      "tournaments/t1": {
        title: "Cup",
        bracketType: "single_elimination",
      },
      "tournaments/t1/matches/r1_m1": {
        id: "r1_m1",
        stage: "single",
        round: 1,
        status: "pending",
        teamA: { teamId: "team-a", teamName: "A" },
        teamB: { teamId: "team-b", teamName: "B" },
      },
      "tournaments/t1/matches/r1_m1/chat/c1": {
        uid: "u1",
        text: "hello",
        createdAt: Date.now() - 1000,
      },
      "tournaments/t1/matches/r1_m1/chat/c2": {
        uid: "u2",
        text: "hi",
        createdAt: Date.now(),
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/matches/r1_m1/result")
      .set("x-user-uid", "admin-1")
      .set("x-user-admin", "1")
      .send({ winnerTeamId: "team-a" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db._store.get("tournaments/t1/matches/r1_m1/chat/c1")).toBeUndefined();
    expect(db._store.get("tournaments/t1/matches/r1_m1/chat/c2")).toBeUndefined();
    expect((db._store.get("team_public_stats/team-a") || {}).stale).toBe(true);
    expect((db._store.get("team_public_stats/team-b") || {}).stale).toBe(true);
  });
});
