import express from "express";
import dotenv from "dotenv";
import admin from "firebase-admin";
import pino from "pino";
import fs from "fs/promises";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerOcrRoutes } from "./routes/ocr.js";
import { registerRankRoutes } from "./routes/ranks.js";
import { registerLeaderboardRoutes } from "./routes/leaderboard.js";
import { registerProfileRoutes } from "./routes/profile.js";
import { registerStatsRoutes } from "./routes/stats.js";
import { registerClientErrorRoutes } from "./routes/clientError.js";
import { createCorsMiddleware } from "./middleware/cors.js";
import { createHelmetMiddleware } from "./middleware/helmet.js";
import { createRateLimiters } from "./middleware/rateLimits.js";
import { createRequireAuth } from "./middleware/auth.js";
import { createFirestoreDailyLimiters } from "./middleware/firestoreLimits.js";
import { payloadTooLargeHandler } from "./middleware/errors.js";
import {
  cleanText,
  getDayKey,
  isValidBase64Image,
  isValidUid,
  parseIntParam,
} from "./helpers/validation.js";
import { createClientErrorHelpers } from "./helpers/clientErrors.js";
import { createStatsHelpers } from "./helpers/stats.js";

dotenv.config();

const app = express();
app.set("trust proxy", 1);
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const CLIENT_ERROR_LOG = process.env.CLIENT_ERROR_LOG || "client_errors.log";
const MAX_CLIENT_ERRORS = Number.parseInt(process.env.CLIENT_ERROR_MAX || "200", 10) || 200;
const CLIENT_ERROR_ROTATE_BYTES =
  Number.parseInt(process.env.CLIENT_ERROR_ROTATE_BYTES || "1048576", 10) ||
  1024 * 1024;
const {
  clientErrorBuffer,
  pushClientError,
  rotateClientErrorLog,
} = createClientErrorHelpers({
  CLIENT_ERROR_LOG,
  CLIENT_ERROR_ROTATE_BYTES,
  MAX_CLIENT_ERRORS,
  fs,
});

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(createCorsMiddleware(allowedOrigins));

app.disable("x-powered-by");
app.use(createHelmetMiddleware());
app.use(express.json({ limit: "2mb" }));
const { baseLimiter, authLimiter, statsLimiter, ocrLimiter, clientErrorLimiter } =
  createRateLimiters();
app.use(baseLimiter);

const requireAuth = createRequireAuth(admin);

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  : null;

admin.initializeApp({
  credential: serviceAccountJson
    ? admin.credential.cert(serviceAccountJson)
    : admin.credential.applicationDefault(),
});

const db = admin.firestore();
const CACHE_COLLECTION = "stats_cache";
const GLOBAL_CACHE_TTL_MS =
  Number.parseInt(process.env.GLOBAL_CACHE_TTL_MS || "900000", 10) ||
  15 * 60 * 1000;
const PERCENTILES_CACHE_TTL_MS =
  Number.parseInt(process.env.PERCENTILES_CACHE_TTL_MS || "60000", 10) ||
  60 * 1000;
const percentilesCache = new Map();

const OCR_DAILY_LIMIT = 15;
const RANK_SUBMIT_DAILY_LIMIT =
  Number.parseInt(process.env.RANK_SUBMIT_DAILY_LIMIT || "1", 10) || 1;
const { ocrDailyLimiter, rankDailyLimiter } = createFirestoreDailyLimiters({
  admin,
  db,
  logger,
  getDayKey,
  OCR_DAILY_LIMIT,
  RANK_SUBMIT_DAILY_LIMIT,
});

const ALLOWED_RANKS = new Set([
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "master",
  "ace",
  "punkmaster",
]);

const { getDistributions, getLeaderboardPage, topPercent } = createStatsHelpers({
  admin,
  db,
  logger,
  CACHE_COLLECTION,
  GLOBAL_CACHE_TTL_MS,
});

const routesDeps = {
  admin,
  db,
  logger,
  fs,
  authLimiter,
  statsLimiter,
  ocrLimiter,
  clientErrorLimiter,
  requireAuth,
  ocrDailyLimiter,
  rankDailyLimiter,
  isValidBase64Image,
  OCR_DAILY_LIMIT,
  ALLOWED_RANKS,
  RANK_SUBMIT_DAILY_LIMIT,
  parseIntParam,
  isValidUid,
  getLeaderboardPage,
  percentilesCache,
  PERCENTILES_CACHE_TTL_MS,
  getDistributions,
  topPercent,
  pushClientError,
  rotateClientErrorLog,
  CLIENT_ERROR_LOG,
  clientErrorBuffer,
};

registerAuthRoutes(app, routesDeps);
registerOcrRoutes(app, routesDeps);
registerRankRoutes(app, routesDeps);
registerLeaderboardRoutes(app, routesDeps);
registerProfileRoutes(app, routesDeps);
registerStatsRoutes(app, routesDeps);
registerClientErrorRoutes(app, routesDeps);

app.use(payloadTooLargeHandler);

app.listen(process.env.PORT, () => {
  logger.info(`Backend running on http://localhost:${process.env.PORT}`);
});

