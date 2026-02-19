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
    const agent = request.agent(app);
    const userAgent = "vitest-agent";
    const stateRes = await agent
      .get("/auth/discord/state")
      .set("user-agent", userAgent);
    const { state } = stateRes.body;
    const res = await agent
      .post("/auth/discord")
      .set("user-agent", userAgent)
      .send({ code: "abc", state });

    expect(res.status).toBe(200);
    expect(res.body.firebaseToken).toBe("firebase-token");
    expect(setMock).toHaveBeenCalled();
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: "discord:1",
        hiddenElo: 500,
      }),
      { merge: true }
    );
  });

  it("rejects oauth request when state is missing", async () => {
    const app = createApp(deps);
    const res = await request(app).post("/auth/discord").send({ code: "abc" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Missing code or state" });
  });

  it("rejects oauth request when state is invalid", async () => {
    const app = createApp(deps);
    const res = await request(app)
      .post("/auth/discord")
      .set("user-agent", "vitest-agent")
      .send({ code: "abc", state: "invalid-state" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid OAuth state" });
  });

  it("does not leak oauth details to client on discord failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "secret-details",
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = createApp(deps);
    const agent = request.agent(app);
    const userAgent = "vitest-agent";
    const stateRes = await agent
      .get("/auth/discord/state")
      .set("user-agent", userAgent);
    const { state } = stateRes.body;
    const res = await agent
      .post("/auth/discord")
      .set("user-agent", userAgent)
      .send({ code: "abc", state });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "OAuth failed" });
    expect(JSON.stringify(res.body)).not.toContain("secret-details");
  });
});
