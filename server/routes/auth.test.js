import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { registerAuthRoutes } from "./auth.js";

function createApp(deps) {
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  return app;
}

describe("auth routes", () => {
  const admin = {
    auth: () => ({
      createCustomToken: vi.fn().mockResolvedValue("firebase-token"),
    }),
    firestore: {
      FieldValue: {
        serverTimestamp: () => 123,
      },
    },
  };
  const setMock = vi.fn().mockResolvedValue();
  const deps = {
    admin,
    db: {
      collection: () => ({
        doc: () => ({ set: setMock }),
      }),
    },
    logger: { warn: vi.fn(), error: vi.fn() },
    authLimiter: (_req, _res, next) => next(),
  };

  beforeEach(() => {
    setMock.mockClear();
  });

  it("returns firebase token on successful discord oauth", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "discord-access" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: "1",
          username: "u",
          global_name: "U",
          avatar: "av",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const app = createApp(deps);
    const res = await request(app).post("/auth/discord").send({ code: "abc" });

    expect(res.status).toBe(200);
    expect(res.body.firebaseToken).toBe("firebase-token");
    expect(setMock).toHaveBeenCalled();
  });

  it("does not leak oauth details to client on discord failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "secret-details",
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = createApp(deps);
    const res = await request(app).post("/auth/discord").send({ code: "abc" });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "OAuth failed" });
    expect(JSON.stringify(res.body)).not.toContain("secret-details");
  });
});
