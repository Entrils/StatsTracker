import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerLeaderboardRoutes } from "./leaderboard.js";
import { createStatsHelpers } from "../helpers/stats.js";

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
    const hiddenEloQuery = {
      orderBy: vi.fn(() => hiddenEloQuery),
      limit: vi.fn(() => ({
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
      })),
    };
    const app = createApp({
      admin: {
        firestore: {
          FieldPath: {
            documentId: vi.fn(() => "__name__"),
          },
        },
      },
      db: {
        collection: () => hiddenEloQuery,
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

    const res = await request(app).get("/admin/hidden-elo?limit=50");
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].uid).toBe("u1");
    expect(res.body.rows[0].hiddenElo).toBe(1800);
    expect(res.body.nextCursor).toEqual({ afterUid: "u1", afterHiddenElo: 1800 });
  });

  it("returns hidden elo list even when admin.firestore.FieldPath is unavailable", async () => {
    const hiddenEloQuery = {
      orderBy: vi.fn(() => hiddenEloQuery),
      startAfter: vi.fn(() => hiddenEloQuery),
      limit: vi.fn(() => ({
        get: async () => ({
          docs: [
            {
              id: "u1",
              data: () => ({
                name: "User 1",
                hiddenElo: 1700,
                matches: 5,
                wins: 3,
                losses: 2,
                score: 20000,
                kills: 60,
                deaths: 40,
                assists: 20,
              }),
            },
          ],
        }),
      })),
    };
    const app = createApp({
      admin: { firestore: {} },
      db: {
        collection: () => hiddenEloQuery,
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

    const res = await request(app).get("/admin/hidden-elo?limit=20&afterHiddenElo=1800");
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].uid).toBe("u1");
    expect(hiddenEloQuery.startAfter).toHaveBeenCalledWith(1800);
  });

  it("falls back to memory sort when hiddenElo indexes are unavailable", async () => {
    const hiddenEloIndexErr = Object.assign(new Error("FAILED_PRECONDITION: query requires an index"), {
      code: "failed-precondition",
    });
    const uidOrderQuery = {
      limit: vi.fn(() => ({
        get: async () => ({
          docs: [
            {
              id: "u2",
              data: () => ({ name: "User 2", hiddenElo: 1700, matches: 5, wins: 2, losses: 3 }),
            },
            {
              id: "u1",
              data: () => ({ name: "User 1", hiddenElo: 1800, matches: 10, wins: 7, losses: 3 }),
            },
          ],
        }),
      })),
      startAfter: vi.fn(() => uidOrderQuery),
    };
    const hiddenEloQuery = {
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: async () => {
            throw hiddenEloIndexErr;
          },
        })),
      })),
      limit: vi.fn(() => ({
        get: async () => {
          throw hiddenEloIndexErr;
        },
      })),
      startAfter: vi.fn(() => hiddenEloQuery),
      offset: vi.fn(() => hiddenEloQuery),
    };
    const app = createApp({
      admin: {
        firestore: {
          FieldPath: {
            documentId: vi.fn(() => "__name__"),
          },
        },
      },
      db: {
        collection: () => ({
          orderBy: (field) => (field === "__name__" ? uidOrderQuery : hiddenEloQuery),
        }),
      },
      logger: { error: vi.fn(), warn: vi.fn() },
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

    const res = await request(app).get("/admin/hidden-elo?limit=20");
    expect(res.status).toBe(200);
    expect(res.body.orderMode).toBe("memory:hiddenElo+uid");
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.rows[0].uid).toBe("u1");
    expect(res.body.rows[1].uid).toBe("u2");
  });

  it("forbids share metrics backfill for non-admin", async () => {
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

    const res = await request(app).post("/admin/share-metrics/backfill").send({ apply: 0 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("runs share metrics backfill dry-run for admin", async () => {
    const mockUserDoc = {
      id: "u1",
      data: () => ({ friendCount: null, bestStreak: null, maxKills: null }),
    };
    const app = createApp({
      admin: {
        firestore: {
          FieldPath: { documentId: () => "__name__" },
          FieldValue: { serverTimestamp: vi.fn(() => 123) },
        },
      },
      db: {
        collection: (name) => {
          if (name === "leaderboard_users") {
            return {
              orderBy: () => ({
                limit: () => ({
                  get: async () => ({ docs: [mockUserDoc] }),
                }),
              }),
              doc: () => ({ set: vi.fn() }),
            };
          }
          if (name === "users") {
            return {
              doc: () => ({
                collection: (subName) => {
                  if (subName === "friends") {
                    return {
                      count: () => ({
                        get: async () => ({ data: () => ({ count: 4 }) }),
                      }),
                    };
                  }
                  if (subName === "matches") {
                    return {
                      orderBy: () => ({
                        limit: () => ({
                          get: async () => ({
                            docs: [
                              { data: () => ({ result: "victory", kills: 12 }) },
                              { data: () => ({ result: "victory", kills: 9 }) },
                              { data: () => ({ result: "defeat", kills: 3 }) },
                            ],
                          }),
                        }),
                      }),
                    };
                  }
                  return {};
                },
              }),
            };
          }
          return {};
        },
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

    const res = await request(app).post("/admin/share-metrics/backfill").send({ apply: 0, limit: 1 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.candidates).toBe(1);
    expect(res.body.patched).toBe(0);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.nextCursor).toBe("u1");
  });

  it("returns socials in /leaderboard rows via fallback sources", async () => {
    const leaderboardDocs = [
      {
        id: "u1",
        data: () => ({
          name: "U1",
          matches: 10,
          wins: 6,
          losses: 4,
          score: 1000,
          kills: 50,
          deaths: 20,
          assists: 10,
          settings: null,
          hiddenElo: 1200,
        }),
      },
      {
        id: "u2",
        data: () => ({
          name: "U2",
          matches: 8,
          wins: 4,
          losses: 4,
          score: 800,
          kills: 30,
          deaths: 18,
          assists: 12,
          settings: null,
          hiddenElo: 1100,
        }),
      },
    ];

    const lbChain = {
      orderBy: () => lbChain,
      limit: () => lbChain,
      startAfter: () => ({
        get: async () => ({ empty: true, docs: [] }),
      }),
      get: async () => ({ empty: false, docs: leaderboardDocs }),
    };

    const batchSet = vi.fn();
    const batchCommit = vi.fn().mockResolvedValue();
    const db = {
      collection: (name) => {
        if (name === "leaderboard_users") {
          return {
            orderBy: () => lbChain,
            doc: (uid) => ({ id: uid, path: `leaderboard_users/${uid}` }),
          };
        }
        if (name === "users") {
          return {
            doc: (uid) => ({
              id: uid,
              path: `users/${uid}`,
              collection: (sub) => ({
                doc: (docId) => ({
                  id: docId,
                  path: `users/${uid}/${sub}/${docId}`,
                }),
              }),
            }),
          };
        }
        return {
          doc: () => ({ get: async () => ({ exists: false }) }),
        };
      },
      batch: () => ({
        set: batchSet,
        commit: batchCommit,
      }),
      getAll: vi.fn(async (...refs) =>
        refs.map((ref) => {
          const path = String(ref?.path || "");
          if (path === "users/u1") {
            return {
              exists: true,
              data: () => ({ socials: { twitch: "u1_stream" } }),
            };
          }
          if (path === "users/u2") {
            return {
              exists: true,
              data: () => ({}),
            };
          }
          if (path === "users/u2/profile/settings") {
            return {
              exists: true,
              data: () => ({ settings: { youtube: "@u2_channel" } }),
            };
          }
          return {
            exists: false,
            data: () => ({}),
          };
        })
      ),
    };

    const { getLeaderboardPage } = createStatsHelpers({
      admin: {
        firestore: {
          FieldPath: { documentId: () => "__name__" },
        },
      },
      db,
      logger: { warn: vi.fn() },
      CACHE_COLLECTION: "stats_cache",
      GLOBAL_CACHE_TTL_MS: 1000,
      getActiveBansSet: null,
      LEADERBOARD_CACHE_TTL_MS: 1000,
    });

    const app = createApp({
      admin: {
        firestore: {
          FieldPath: { documentId: () => "__name__" },
        },
      },
      db,
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

    const res = await request(app).get("/leaderboard?limit=2&offset=0&sort=matches");
    expect(res.status).toBe(200);
    const u1 = res.body.rows.find((row) => row.uid === "u1");
    const u2 = res.body.rows.find((row) => row.uid === "u2");
    expect(u1.settings).toEqual({ twitch: "u1_stream" });
    expect(u2.settings).toEqual({ youtube: "@u2_channel" });
    expect(batchSet).toHaveBeenCalled();
    expect(batchCommit).toHaveBeenCalled();
  });
});
