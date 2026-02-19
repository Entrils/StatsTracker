import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { registerFriendsRoutes } from "./friends.js";

function createApp(deps) {
  const app = express();
  app.use(express.json());
  registerFriendsRoutes(app, deps);
  return app;
}

describe("friends routes", () => {
  const deps = {
    admin: { firestore: { FieldValue: { serverTimestamp: () => 1 } } },
    db: {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: () => ({
              get: async () => ({ exists: false }),
              set: async () => {},
            }),
          }),
        }),
      }),
      batch: () => ({ set: () => {}, delete: () => {}, commit: async () => {} }),
    },
    logger: { error: () => {} },
    requireAuth: (req, _res, next) => {
      req.user = { uid: "u1" };
      next();
    },
    authLimiter: (_req, _res, next) => next(),
    statsLimiter: (_req, _res, next) => next(),
    isValidUid: (uid) => typeof uid === "string" && uid.length > 0,
  };

  it("returns self status for current user", async () => {
    const app = createApp(deps);
    const res = await request(app).get("/friends/status/u1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "self" });
  });

  it("rejects adding yourself", async () => {
    const app = createApp(deps);
    const res = await request(app).post("/friends/request").send({ uid: "u1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Cannot add yourself");
  });

  it("returns materialized friends meta", async () => {
    const app = createApp({
      ...deps,
      db: {
        collection: (name) => {
          if (name !== "users") return { doc: () => ({}) };
          return {
            doc: () => ({
              collection: (sub) => {
                if (sub !== "profile") return { doc: () => ({}) };
                return {
                  doc: () => ({
                    get: async () => ({
                      exists: true,
                      data: () => ({
                        count: 7,
                        latestFriendAt: 12345,
                        milestoneDates: { "1": 1000, "3": 3000 },
                      }),
                    }),
                  }),
                };
              },
            }),
          };
        },
      },
    });

    const res = await request(app).get("/friends/meta");
    expect(res.status).toBe(200);
    expect(res.body.friendCount).toBe(7);
    expect(res.body.latestFriendAt).toBe(12345);
    expect(res.body.milestoneDates).toEqual({ "1": 1000, "3": 3000 });
  });
});
