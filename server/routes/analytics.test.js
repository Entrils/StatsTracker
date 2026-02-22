import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerAnalyticsRoutes } from "./analytics.js";

function createApp(deps) {
  const app = express();
  app.use(express.json());
  registerAnalyticsRoutes(app, deps);
  return app;
}

describe("analytics routes", () => {
  it("rejects unknown events", async () => {
    const app = createApp({
      admin: { firestore: { FieldValue: { increment: vi.fn(), serverTimestamp: vi.fn() } } },
      db: { collection: vi.fn() },
      logger: { error: vi.fn() },
      statsLimiter: (_req, _res, next) => next(),
      authLimiter: (_req, _res, next) => next(),
      requireAuth: (_req, _res, next) => next(),
      parseIntParam: (value, fallback) => {
        if (value === undefined) return fallback;
        const n = Number.parseInt(value, 10);
        return Number.isFinite(n) ? n : null;
      },
    });
    const res = await request(app).post("/analytics/event").send({ event: "unknown" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid event");
  });

  it("stores allowed event in counters and samples", async () => {
    const counterSet = vi.fn().mockResolvedValue(undefined);
    const sampleAdd = vi.fn().mockResolvedValue(undefined);
    const increment = vi.fn((n) => ({ __inc: n }));
    const serverTimestamp = vi.fn(() => ({ __ts: true }));
    const app = createApp({
      admin: { firestore: { FieldValue: { increment, serverTimestamp } } },
      db: {
        collection: vi.fn((name) => {
          if (name === "ux_event_counters") {
            return {
              doc: vi.fn(() => ({
                set: counterSet,
              })),
            };
          }
          if (name === "ux_event_samples") {
            return {
              add: sampleAdd,
            };
          }
          return {};
        }),
      },
      logger: { error: vi.fn() },
      statsLimiter: (_req, _res, next) => next(),
      authLimiter: (_req, _res, next) => next(),
      requireAuth: (_req, _res, next) => next(),
      parseIntParam: (value, fallback) => {
        if (value === undefined) return fallback;
        const n = Number.parseInt(value, 10);
        return Number.isFinite(n) ? n : null;
      },
    });

    const res = await request(app).post("/analytics/event").send({
      event: "upload_completion",
      valueMs: 1234,
      sessionId: "s-1",
      meta: { source: "upload", ok: true, count: 1 },
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(counterSet).toHaveBeenCalled();
    expect(sampleAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "upload_completion",
        sessionId: "s-1",
        valueMs: 1234,
      })
    );
  });

  it("returns admin ux metrics aggregation", async () => {
    const queryChain = {
      where: vi.fn(() => queryChain),
      limit: vi.fn(() => ({
        get: async () => ({
          docs: [
            { data: () => ({ event: "upload_completion", day: "2026-02-20", count: 2, valueMsSum: 4000, valueMsCount: 2 }) },
            { data: () => ({ event: "upload_completion", day: "2026-02-21", count: 3, valueMsSum: 5100, valueMsCount: 3 }) },
            { data: () => ({ event: "activation_target_action", day: "2026-02-21", count: 5 }) },
          ],
        }),
      })),
    };
    const app = createApp({
      admin: { firestore: { FieldValue: { increment: vi.fn(), serverTimestamp: vi.fn() } } },
      db: {
        collection: vi.fn((name) => {
          if (name === "ux_event_counters") return queryChain;
          if (name === "ux_event_samples") return { add: vi.fn() };
          return {};
        }),
      },
      logger: { error: vi.fn() },
      statsLimiter: (_req, _res, next) => next(),
      authLimiter: (_req, _res, next) => next(),
      requireAuth: (req, _res, next) => {
        req.user = { uid: "a1", role: "admin" };
        next();
      },
      parseIntParam: (value, fallback) => {
        if (value === undefined) return fallback;
        const n = Number.parseInt(value, 10);
        return Number.isFinite(n) ? n : null;
      },
    });

    const res = await request(app).get("/admin/analytics/ux?days=14");
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(14);
    expect(Array.isArray(res.body.dayKeys)).toBe(true);
    const uploadRow = res.body.rows.find((r) => r.event === "upload_completion");
    expect(uploadRow.count).toBe(5);
    expect(Math.round(uploadRow.avgMs)).toBe(1820);
    expect(Array.isArray(uploadRow.perDay)).toBe(true);
    const uploadDay = uploadRow.perDay.find((d) => d.day === "2026-02-21");
    expect(uploadDay.count).toBe(3);
  });
});
