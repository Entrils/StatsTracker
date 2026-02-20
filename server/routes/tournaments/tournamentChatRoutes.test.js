import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerTournamentChatRoutes } from "./tournamentChatRoutes.js";
import { createFakeFirestore, createAdminMock } from "./testFirestore.js";

function createApp(deps) {
  const app = express();
  app.use(express.json());
  registerTournamentChatRoutes(app, deps);
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
  };
}

describe("tournament chat routes", () => {
  it("returns 404 when match does not exist", async () => {
    const db = createFakeFirestore({});
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .get("/tournaments/t1/matches/missing/chat")
      .set("x-user-uid", "u1");

    expect(res.status).toBe(404);
    expect(String(res.body.error || "")).toContain("Match not found");
  });

  it("falls back to registrations when snapshot is absent and persists participantUids", async () => {
    const db = createFakeFirestore({
      "tournaments/t1/matches/m1": {
        teamA: { teamId: "teamA" },
        teamB: { teamId: "teamB" },
      },
      "tournaments/t1/registrations/teamA": {
        teamId: "teamA",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "tournaments/t1/registrations/teamB": {
        teamId: "teamB",
        captainUid: "u3",
        memberUids: ["u3", "u4"],
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .get("/tournaments/t1/matches/m1/chat")
      .set("x-user-uid", "u2");

    expect(res.status).toBe(200);
    const match = db._store.get("tournaments/t1/matches/m1") || {};
    expect(Array.isArray(match.participantUids)).toBe(true);
    expect(match.participantUids).toEqual(["u1", "u2", "u3", "u4"]);
  });

  it("uses team side members snapshot without registrations", async () => {
    const db = createFakeFirestore({
      "tournaments/t1/matches/m1": {
        teamA: {
          teamId: "teamA",
          captainUid: "u1",
          members: [{ uid: "u1" }, { uid: "u2" }],
        },
        teamB: {
          teamId: "teamB",
          captainUid: "u3",
          members: [{ uid: "u3" }, { uid: "u4" }],
        },
      },
    });
    db.getAll = () => Promise.reject(new Error("registrations getAll should not run"));
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .get("/tournaments/t1/matches/m1/chat")
      .set("x-user-uid", "u4");

    expect(res.status).toBe(200);
  });

  it("allows participant access via match.participantUids without registrations reads", async () => {
    const db = createFakeFirestore({
      "tournaments/t1/matches/m1": {
        teamA: { teamId: "teamA" },
        teamB: { teamId: "teamB" },
        participantUids: ["u1", "u2", "u3", "u4"],
      },
      "tournaments/t1/matches/m1/chat/c1": {
        uid: "u1",
        text: "hello",
        createdAt: 100,
      },
    });
    db.getAll = () => Promise.reject(new Error("registrations getAll should not run"));
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .get("/tournaments/t1/matches/m1/chat")
      .set("x-user-uid", "u2");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows.length).toBe(1);
  });

  it("forbids outsider via participant snapshot without registrations fallback", async () => {
    const db = createFakeFirestore({
      "tournaments/t1/matches/m1": {
        teamA: { teamId: "teamA" },
        teamB: { teamId: "teamB" },
        participantUids: ["u1", "u2", "u3", "u4"],
      },
    });
    db.getAll = () => Promise.reject(new Error("registrations getAll should not run"));
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .get("/tournaments/t1/matches/m1/chat")
      .set("x-user-uid", "outsider");

    expect(res.status).toBe(403);
  });

  it("returns chat rows respecting limit and chronological order", async () => {
    const db = createFakeFirestore({
      "tournaments/t1/matches/m1": {
        teamA: { teamId: "teamA" },
        teamB: { teamId: "teamB" },
      },
      "tournaments/t1/registrations/teamA": {
        teamId: "teamA",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "tournaments/t1/registrations/teamB": {
        teamId: "teamB",
        captainUid: "u3",
        memberUids: ["u3", "u4"],
      },
      "tournaments/t1/matches/m1/chat/c1": {
        uid: "u1",
        text: "m1",
        createdAt: 100,
      },
      "tournaments/t1/matches/m1/chat/c2": {
        uid: "u2",
        text: "m2",
        createdAt: 200,
      },
      "tournaments/t1/matches/m1/chat/c3": {
        uid: "u3",
        text: "m3",
        createdAt: 300,
      },
      "tournaments/t1/matches/m1/chat/c4": {
        uid: "u4",
        text: "m4",
        createdAt: 400,
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .get("/tournaments/t1/matches/m1/chat?limit=2")
      .set("x-user-uid", "u1");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows.length).toBe(2);
    expect(res.body.rows.map((r) => r.text)).toEqual(["m3", "m4"]);
    expect(res.body.rows.map((r) => r.createdAt)).toEqual([300, 400]);
  });

  it("allows participant to read chat", async () => {
    const db = createFakeFirestore({
      "tournaments/t1/matches/m1": {
        teamA: { teamId: "teamA" },
        teamB: { teamId: "teamB" },
      },
      "tournaments/t1/registrations/teamA": {
        teamId: "teamA",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "tournaments/t1/registrations/teamB": {
        teamId: "teamB",
        captainUid: "u3",
        memberUids: ["u3", "u4"],
      },
      "tournaments/t1/matches/m1/chat/c1": {
        uid: "u1",
        text: "hello",
        createdAt: 100,
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .get("/tournaments/t1/matches/m1/chat")
      .set("x-user-uid", "u2");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows.length).toBe(1);
    expect(res.body.rows[0].text).toBe("hello");
  });

  it("forbids non participant from reading chat", async () => {
    const db = createFakeFirestore({
      "tournaments/t1/matches/m1": {
        teamA: { teamId: "teamA" },
        teamB: { teamId: "teamB" },
      },
      "tournaments/t1/registrations/teamA": {
        teamId: "teamA",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "tournaments/t1/registrations/teamB": {
        teamId: "teamB",
        captainUid: "u3",
        memberUids: ["u3", "u4"],
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .get("/tournaments/t1/matches/m1/chat")
      .set("x-user-uid", "outsider");

    expect(res.status).toBe(403);
  });

  it("forbids non participant from sending chat message", async () => {
    const db = createFakeFirestore({
      "tournaments/t1/matches/m1": {
        teamA: { teamId: "teamA" },
        teamB: { teamId: "teamB" },
      },
      "tournaments/t1/registrations/teamA": {
        teamId: "teamA",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "tournaments/t1/registrations/teamB": {
        teamId: "teamB",
        captainUid: "u3",
        memberUids: ["u3", "u4"],
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/matches/m1/chat")
      .set("x-user-uid", "outsider")
      .send({ text: "let me in" });

    expect(res.status).toBe(403);
  });

  it("allows participant to send message", async () => {
    const db = createFakeFirestore({
      "tournaments/t1/matches/m1": {
        teamA: { teamId: "teamA" },
        teamB: { teamId: "teamB" },
      },
      "tournaments/t1/registrations/teamA": {
        teamId: "teamA",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "tournaments/t1/registrations/teamB": {
        teamId: "teamB",
        captainUid: "u3",
        memberUids: ["u3", "u4"],
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/matches/m1/chat")
      .set("x-user-uid", "u1")
      .send({ text: " gg " });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(String(res.body.message?.text || "")).toBe("gg");
  });

  it("uses authenticated uid and ignores uid spoofing from payload", async () => {
    const db = createFakeFirestore({
      "tournaments/t1/matches/m1": {
        teamA: { teamId: "teamA" },
        teamB: { teamId: "teamB" },
      },
      "tournaments/t1/registrations/teamA": {
        teamId: "teamA",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "tournaments/t1/registrations/teamB": {
        teamId: "teamB",
        captainUid: "u3",
        memberUids: ["u3", "u4"],
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .post("/tournaments/t1/matches/m1/chat")
      .set("x-user-uid", "u1")
      .send({ uid: "u999", text: "hello" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(String(res.body.message?.uid || "")).toBe("u1");
  });

  it("rejects empty and too long messages", async () => {
    const db = createFakeFirestore({
      "tournaments/t1/matches/m1": {
        teamA: { teamId: "teamA" },
        teamB: { teamId: "teamB" },
      },
      "tournaments/t1/registrations/teamA": {
        teamId: "teamA",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "tournaments/t1/registrations/teamB": {
        teamId: "teamB",
        captainUid: "u3",
        memberUids: ["u3", "u4"],
      },
    });
    const app = createApp(makeDeps(db));

    const emptyRes = await request(app)
      .post("/tournaments/t1/matches/m1/chat")
      .set("x-user-uid", "u1")
      .send({ text: "   " });
    expect(emptyRes.status).toBe(400);
    expect(String(emptyRes.body.error || "")).toContain("required");

    const longRes = await request(app)
      .post("/tournaments/t1/matches/m1/chat")
      .set("x-user-uid", "u1")
      .send({ text: "x".repeat(501) });
    expect(longRes.status).toBe(400);
    expect(String(longRes.body.error || "")).toContain("too long");
  });

  it("applies sender cooldown and returns 429 on spam", async () => {
    const db = createFakeFirestore({
      "tournaments/t1/matches/m1": {
        teamA: { teamId: "teamA" },
        teamB: { teamId: "teamB" },
      },
      "tournaments/t1/registrations/teamA": {
        teamId: "teamA",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "tournaments/t1/registrations/teamB": {
        teamId: "teamB",
        captainUid: "u3",
        memberUids: ["u3", "u4"],
      },
    });
    const app = createApp(makeDeps(db));

    const first = await request(app)
      .post("/tournaments/t1/matches/m1/chat")
      .set("x-user-uid", "u1")
      .send({ text: "first" });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/tournaments/t1/matches/m1/chat")
      .set("x-user-uid", "u1")
      .send({ text: "second" });
    expect(second.status).toBe(429);
    expect(String(second.body.error || "")).toContain("Too many messages");
  });

  it("returns 409 when match teams are not ready", async () => {
    const db = createFakeFirestore({
      "tournaments/t1/matches/m1": {
        teamA: { teamId: "teamA" },
        teamB: null,
      },
      "tournaments/t1/registrations/teamA": {
        teamId: "teamA",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
    });
    const app = createApp(makeDeps(db));

    const res = await request(app)
      .get("/tournaments/t1/matches/m1/chat")
      .set("x-user-uid", "u1");

    expect(res.status).toBe(409);
    expect(String(res.body.error || "")).toContain("not ready");
  });

  it("closes chat for completed match", async () => {
    const db = createFakeFirestore({
      "tournaments/t1/matches/m1": {
        status: "completed",
        teamA: { teamId: "teamA" },
        teamB: { teamId: "teamB" },
      },
      "tournaments/t1/registrations/teamA": {
        teamId: "teamA",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "tournaments/t1/registrations/teamB": {
        teamId: "teamB",
        captainUid: "u3",
        memberUids: ["u3", "u4"],
      },
      "tournaments/t1/matches/m1/chat/c1": {
        uid: "u1",
        text: "old",
        createdAt: 100,
      },
    });
    const app = createApp(makeDeps(db));

    const readRes = await request(app)
      .get("/tournaments/t1/matches/m1/chat")
      .set("x-user-uid", "u1");
    expect(readRes.status).toBe(200);
    expect(readRes.body.closed).toBe(true);
    expect(readRes.body.rows).toEqual([]);

    const writeRes = await request(app)
      .post("/tournaments/t1/matches/m1/chat")
      .set("x-user-uid", "u1")
      .send({ text: "should fail" });
    expect(writeRes.status).toBe(409);
  });

  it("keeps completed chat closed on cache-hit access checks", async () => {
    const db = createFakeFirestore({
      "tournaments/t1/matches/m1": {
        status: "completed",
        teamA: { teamId: "teamA" },
        teamB: { teamId: "teamB" },
      },
      "tournaments/t1/registrations/teamA": {
        teamId: "teamA",
        captainUid: "u1",
        memberUids: ["u1", "u2"],
      },
      "tournaments/t1/registrations/teamB": {
        teamId: "teamB",
        captainUid: "u3",
        memberUids: ["u3", "u4"],
      },
    });
    const app = createApp(makeDeps(db));

    const firstRead = await request(app)
      .get("/tournaments/t1/matches/m1/chat")
      .set("x-user-uid", "u1");
    expect(firstRead.status).toBe(200);
    expect(firstRead.body.closed).toBe(true);

    const secondRead = await request(app)
      .get("/tournaments/t1/matches/m1/chat")
      .set("x-user-uid", "u1");
    expect(secondRead.status).toBe(200);
    expect(secondRead.body.closed).toBe(true);

    const writeRes = await request(app)
      .post("/tournaments/t1/matches/m1/chat")
      .set("x-user-uid", "u1")
      .send({ text: "still blocked" });
    expect(writeRes.status).toBe(409);
  });
});
