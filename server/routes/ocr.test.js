import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerOcrRoutes } from "./ocr.js";

function createApp(deps) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  registerOcrRoutes(app, deps);
  return app;
}

describe("ocr routes", () => {
  it("accepts fre language and returns usedLanguage=fre", async () => {
    const setMock = vi.fn().mockResolvedValue();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ParsedResults: [{ ParsedText: "ok text" }],
        IsErroredOnProcessing: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    process.env.OCR_SPACE_API_KEY = "key";

    const deps = {
      logger: { error: vi.fn() },
      ocrLimiter: (_req, _res, next) => next(),
      requireAuth: (req, _res, next) => {
        req.user = { uid: "u1", username: "U1" };
        next();
      },
      ocrDailyLimiter: (req, _res, next) => {
        req.ocrRemaining = 12;
        next();
      },
      isValidBase64Image: () => true,
      OCR_DAILY_LIMIT: 15,
      db: {
        collection: (name) => {
          if (name === "bans") {
            return { doc: () => ({ get: async () => ({ exists: false }) }) };
          }
          return { doc: () => ({ set: setMock }) };
        },
      },
      admin: { firestore: { FieldValue: { serverTimestamp: () => 1 } } },
    };

    const app = createApp(deps);
    const res = await request(app).post("/ocr").send({
      base64Image: "data:image/png;base64,AAA",
      lang: "fre",
    });

    expect(res.status).toBe(200);
    expect(res.body.usedLanguage).toBe("fre");
    expect(res.body.remaining).toBe(12);
    expect(fetchMock).toHaveBeenCalled();
    const bodyStr = fetchMock.mock.calls[0][1].body;
    expect(bodyStr).toContain("language=fre");
  });
});
