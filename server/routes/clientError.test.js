import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerClientErrorRoutes } from "./clientError.js";

function createApp(deps) {
  const app = express();
  app.use(express.json());
  registerClientErrorRoutes(app, deps);
  return app;
}

describe("client-error routes", () => {
  it("validates required message", async () => {
    const app = createApp({
      logger: { error: vi.fn() },
      clientErrorLimiter: (_req, _res, next) => next(),
      authLimiter: (_req, _res, next) => next(),
      requireAuth: (_req, _res, next) => next(),
      cleanText: () => "",
      pushClientError: vi.fn(),
      rotateClientErrorLog: vi.fn(),
      CLIENT_ERROR_LOG: "client-error.log",
      clientErrorBuffer: [],
      fs: { appendFile: vi.fn() },
    });

    const res = await request(app).post("/client-error").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing message");
  });

  it("returns recent errors for admin user only", async () => {
    const app = createApp({
      logger: { error: vi.fn() },
      clientErrorLimiter: (_req, _res, next) => next(),
      authLimiter: (_req, _res, next) => next(),
      requireAuth: (req, _res, next) => {
        req.user = { uid: "u1", role: "admin" };
        next();
      },
      cleanText: (v) => String(v || "").trim(),
      pushClientError: vi.fn(),
      rotateClientErrorLog: vi.fn(),
      CLIENT_ERROR_LOG: "client-error.log",
      clientErrorBuffer: [{ id: "a" }, { id: "b" }],
      fs: { appendFile: vi.fn() },
    });

    const res = await request(app).get("/client-error/recent?limit=1");
    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([{ id: "b" }]);
  });
});
