import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerLeaderboardRoutes } from "./leaderboard.js";

function createApp(deps) {
  const app = express();
  app.use(express.json());
  registerLeaderboardRoutes(app, deps);
  return app;
}

describe("leaderboard routes", () => {
  it("returns 400 for invalid pagination params", async () => {
    const app = createApp({
      admin: {},
      db: {},
      logger: { error: vi.fn() },
      authLimiter: (_req, _res, next) => next(),
      requireAuth: (_req, _res, next) => next(),
      statsLimiter: (_req, _res, next) => next(),
      getLeaderboardPage: vi.fn(),
      parseIntParam: (_v) => null,
      getActiveBansSet: vi.fn(),
    });

    const res = await request(app).get("/leaderboard?limit=oops");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid pagination params");
  });

  it("returns leaderboard page with rows", async () => {
    const getLeaderboardPage = vi.fn().mockResolvedValue({
      rows: [{ uid: "u1", matches: 10 }],
      total: 1,
    });
    const getSteamOnline = vi.fn().mockResolvedValue(45231);
    const app = createApp({
      admin: {},
      db: {},
      logger: { error: vi.fn() },
      authLimiter: (_req, _res, next) => next(),
      requireAuth: (_req, _res, next) => next(),
      statsLimiter: (_req, _res, next) => next(),
      getLeaderboardPage,
      getSteamOnline,
      steamAppId: 2943650,
      parseIntParam: (v, fallback) => {
        if (v === undefined) return fallback;
        const n = Number.parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
      },
      getActiveBansSet: vi.fn(),
    });

    const res = await request(app).get("/leaderboard?limit=20&offset=0&sort=kda");
    expect(res.status).toBe(200);
    expect(res.body.sortBy).toBe("kda");
    expect(res.body.total).toBe(1);
    expect(res.body.steamOnline).toBe(45231);
    expect(res.body.steamAppId).toBe(2943650);
    expect(res.body.rows).toHaveLength(1);
  });

  it("forbids hidden elo list for non-admin", async () => {
    const app = createApp({
      admin: {},
      db: {},
      logger: { error: vi.fn() },
      authLimiter: (_req, _res, next) => next(),
      requireAuth: (req, _res, next) => {
        req.user = { uid: "u1", admin: false };
        next();
      },
      statsLimiter: (_req, _res, next) => next(),
      getLeaderboardPage: vi.fn(),
      parseIntParam: (v, fallback) => {
        if (v === undefined) return fallback;
        const n = Number.parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
      },
      getActiveBansSet: vi.fn(),
    });

    const res = await request(app).get("/admin/hidden-elo");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("forbids hidden elo recompute for non-admin", async () => {
    const app = createApp({
      admin: {},
      db: {},
      logger: { error: vi.fn() },
      authLimiter: (_req, _res, next) => next(),
      requireAuth: (req, _res, next) => {
        req.user = { uid: "u1", admin: false };
        next();
      },
      statsLimiter: (_req, _res, next) => next(),
      getLeaderboardPage: vi.fn(),
      parseIntParam: (v, fallback) => {
        if (v === undefined) return fallback;
        const n = Number.parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
      },
      getActiveBansSet: vi.fn(),
    });

    const res = await request(app).post("/admin/hidden-elo/recompute");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("returns hidden elo list for admin", async () => {
    const app = createApp({
      admin: {},
      db: {
        collection: () => ({
          orderBy: () => ({
            offset: () => ({
              limit: () => ({
                get: async () => ({
                  docs: [
                    {
                      id: "u1",
                      data: () => ({
                        name: "User 1",
                        hiddenElo: 1800,
                        hiddenEloUpdatedAt: 1234,
                        matches: 10,
                        wins: 6,
                        losses: 4,
                        score: 50000,
                        kills: 120,
                        deaths: 80,
                        assists: 50,
                      }),
                    },
                  ],
                }),
              }),
            }),
          }),
        }),
      },
      logger: { error: vi.fn() },
      authLimiter: (_req, _res, next) => next(),
      requireAuth: (req, _res, next) => {
        req.user = { uid: "admin:u1", admin: true };
        next();
      },
      statsLimiter: (_req, _res, next) => next(),
      getLeaderboardPage: vi.fn(),
      parseIntParam: (v, fallback) => {
        if (v === undefined) return fallback;
        const n = Number.parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
      },
      getActiveBansSet: vi.fn(),
    });

    const res = await request(app).get("/admin/hidden-elo?limit=50&offset=0");
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].uid).toBe("u1");
    expect(res.body.rows[0].hiddenElo).toBe(1800);
  });
});
