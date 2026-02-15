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
    const app = createApp({
      admin: {},
      db: {},
      logger: { error: vi.fn() },
      authLimiter: (_req, _res, next) => next(),
      requireAuth: (_req, _res, next) => next(),
      statsLimiter: (_req, _res, next) => next(),
      getLeaderboardPage,
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
    expect(res.body.rows).toHaveLength(1);
  });
});
