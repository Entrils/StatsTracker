import { describe, it, expect, vi } from "vitest";
import { createFirestoreDailyLimiters } from "./firestoreLimits.js";

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("firestore daily limiters", () => {
  const admin = {
    firestore: {
      Timestamp: { fromDate: (d) => d },
      FieldValue: { serverTimestamp: () => 123 },
    },
  };

  it("blocks OCR requests when daily limit is reached", async () => {
    const db = {
      collection: () => ({ doc: () => ({}) }),
      runTransaction: async (cb) =>
        cb({
          get: async () => ({ exists: true, data: () => ({ count: 3 }) }),
          set: vi.fn(),
        }),
    };
    const { ocrDailyLimiter } = createFirestoreDailyLimiters({
      admin,
      db,
      logger: { error: vi.fn() },
      getDayKey: () => "2026-02-15",
      OCR_DAILY_LIMIT: 3,
      RANK_SUBMIT_DAILY_LIMIT: 2,
    });

    const req = { user: { uid: "u1" } };
    const res = createRes();
    const next = vi.fn();
    await ocrDailyLimiter(req, res, next);

    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe("Daily OCR limit reached");
    expect(next).not.toHaveBeenCalled();
  });

  it("bypasses rank limiter for admin users", async () => {
    const db = {
      collection: () => ({ doc: () => ({}) }),
      runTransaction: vi.fn(),
    };
    const { rankDailyLimiter } = createFirestoreDailyLimiters({
      admin,
      db,
      logger: { error: vi.fn() },
      getDayKey: () => "2026-02-15",
      OCR_DAILY_LIMIT: 3,
      RANK_SUBMIT_DAILY_LIMIT: 5,
    });

    const req = { user: { uid: "u1", role: "admin" } };
    const res = createRes();
    const next = vi.fn();
    await rankDailyLimiter(req, res, next);

    expect(req.rankRemaining).toBe(5);
    expect(next).toHaveBeenCalled();
    expect(db.runTransaction).not.toHaveBeenCalled();
  });
});
