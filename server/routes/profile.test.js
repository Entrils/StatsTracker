import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerProfileRoutes } from "./profile.js";

function createApp(deps) {
  const app = express();
  app.use(express.json());
  registerProfileRoutes(app, deps);
  return app;
}

describe("profile routes", () => {
  const baseDeps = {
    admin: {
      firestore: {
        FieldValue: {
          delete: () => "__DELETE__",
          serverTimestamp: () => 1,
        },
      },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    statsLimiter: (_req, _res, next) => next(),
    authLimiter: (_req, _res, next) => next(),
    requireAuth: (req, _res, next) => {
      req.user = { uid: "u1" };
      next();
    },
    parseIntParam: (v, fallback) => {
      if (v === undefined) return fallback;
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    },
    isValidUid: (uid) => typeof uid === "string" && uid.length > 0,
  };

  it("returns 400 for invalid player limit", async () => {
    const deps = {
      ...baseDeps,
      db: {
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: false }),
          }),
        }),
      },
      parseIntParam: () => null,
    };
    const app = createApp(deps);
    const res = await request(app).get("/player/u1?limit=oops");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid limit");
  });

  it("saves settings and validates long values", async () => {
    const set = vi.fn().mockResolvedValue();
    const deps = {
      ...baseDeps,
      db: {
        collection: () => ({
          doc: () => ({
            set,
            collection: () => ({
              doc: () => ({ set }),
            }),
          }),
        }),
      },
    };
    const app = createApp(deps);

    const bad = await request(app)
      .post("/profile/settings")
      .send({ settings: { twitch: "a".repeat(121) } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("Invalid twitch");

    const ok = await request(app)
      .post("/profile/socials")
      .send({ socials: { twitch: "abc", youtube: "", tiktok: "tt" } });
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
    expect(set).toHaveBeenCalled();
  });

  it("validates fragpunkId format in settings", async () => {
    const set = vi.fn().mockResolvedValue();
    const deps = {
      ...baseDeps,
      db: {
        collection: () => ({
          doc: () => ({
            set,
            collection: () => ({
              doc: () => ({ set }),
            }),
          }),
        }),
      },
    };
    const app = createApp(deps);

    const bad = await request(app)
      .post("/profile/settings")
      .send({ settings: { fragpunkId: "bad-format" } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("Invalid fragpunkId");
  });

  it("forbids hidden elo endpoint for non-admin", async () => {
    const deps = {
      ...baseDeps,
      db: {
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: false }),
          }),
        }),
      },
      requireAuth: (req, _res, next) => {
        req.user = { uid: "u1", admin: false };
        next();
      },
    };
    const app = createApp(deps);
    const res = await request(app).get("/admin/profile/u1/hidden-elo");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("returns hidden elo payload for admin", async () => {
    const deps = {
      ...baseDeps,
      db: {
        collection: (name) => {
          if (name === "leaderboard_users") {
            return {
              doc: () => ({
                get: async () => ({
                  exists: true,
                  data: () => ({
                    hiddenElo: 1777,
                    hiddenEloUpdatedAt: 12345,
                    matches: 40,
                    wins: 22,
                    losses: 18,
                    score: 260000,
                    kills: 520,
                    deaths: 250,
                    assists: 220,
                    damage: 74000,
                    damageShare: 1200,
                  }),
                }),
              }),
            };
          }
          if (name === "users") {
            return {
              doc: () => ({
                collection: () => ({
                  doc: () => ({
                    get: async () => ({
                      exists: true,
                      data: () => ({
                        s3: { rank: "diamond" },
                        s4: { rank: "master" },
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            doc: () => ({
              get: async () => ({ exists: false }),
            }),
          };
        },
      },
      requireAuth: (req, _res, next) => {
        req.user = { uid: "admin:u1", admin: true };
        next();
      },
    };
    const app = createApp(deps);
    const res = await request(app).get("/admin/profile/u1/hidden-elo");
    expect(res.status).toBe(200);
    expect(res.body.uid).toBe("u1");
    expect(res.body.hiddenElo).toBe(1777);
    expect(typeof res.body.recomputedHiddenElo).toBe("number");
    expect(res.body.ranks.s4.rank).toBe("master");
  });

  it("returns socials in /player from users doc fallback when leaderboard settings are empty", async () => {
    const deps = {
      ...baseDeps,
      db: {
        collection: (name) => {
          if (name === "bans") {
            return {
              doc: () => ({
                get: async () => ({ exists: false }),
              }),
            };
          }
          if (name === "leaderboard_users") {
            return {
              doc: () => ({
                get: async () => ({
                  exists: true,
                  data: () => ({
                    name: "Player One",
                    hiddenElo: 1337,
                    settings: {},
                  }),
                }),
              }),
            };
          }
          if (name === "users") {
            return {
              doc: () => ({
                get: async () => ({
                  exists: true,
                  data: () => ({
                    socials: {
                      twitch: "streamer",
                    },
                  }),
                }),
                collection: (sub) => {
                  if (sub === "matches") {
                    return {
                      orderBy: () => ({
                        limit: () => ({
                          get: async () => ({ docs: [] }),
                        }),
                      }),
                    };
                  }
                  if (sub === "friends") {
                    return {
                      orderBy: () => ({
                        limit: () => ({
                          get: async () => ({ docs: [], size: 0 }),
                        }),
                      }),
                    };
                  }
                  if (sub === "profile") {
                    return {
                      doc: (docId) => ({
                        get: async () => {
                          if (docId === "ranks") return { exists: false };
                          if (docId === "settings") return { exists: false };
                          return { exists: false };
                        },
                      }),
                    };
                  }
                  return {
                    doc: () => ({ get: async () => ({ exists: false }) }),
                  };
                },
              }),
            };
          }
          return {
            doc: () => ({
              get: async () => ({ exists: false }),
            }),
          };
        },
      },
    };
    const app = createApp(deps);
    const res = await request(app).get("/player/u1?limit=20");
    expect(res.status).toBe(200);
    expect(res.body.settings).toEqual({ twitch: "streamer" });
  });

  it("returns socials in /profile from legacy leaderboard socials", async () => {
    const deps = {
      ...baseDeps,
      db: {
        collection: (name) => {
          if (name === "bans") {
            return {
              doc: () => ({
                get: async () => ({ exists: false }),
              }),
            };
          }
          if (name === "leaderboard_users") {
            return {
              doc: () => ({
                get: async () => ({
                  exists: true,
                  data: () => ({
                    name: "Legacy User",
                    hiddenElo: 777,
                    socials: {
                      youtube: "@legacy",
                    },
                  }),
                }),
              }),
            };
          }
          if (name === "users") {
            return {
              doc: () => ({
                get: async () => ({ exists: false }),
                collection: () => ({
                  doc: () => ({
                    get: async () => ({ exists: false }),
                  }),
                }),
              }),
            };
          }
          return {
            doc: () => ({
              get: async () => ({ exists: false }),
            }),
          };
        },
      },
    };
    const app = createApp(deps);
    const res = await request(app).get("/profile/u1");
    expect(res.status).toBe(200);
    expect(res.body.settings).toEqual({ youtube: "@legacy" });
  });
});
