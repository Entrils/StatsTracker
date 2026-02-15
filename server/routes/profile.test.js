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
});
