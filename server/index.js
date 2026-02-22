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
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { registerBanRoutes } from "./routes/bans.js";
import { registerFriendsRoutes } from "./routes/friends.js";
import { registerTournamentRoutes } from "./routes/tournaments.js";
import { createCorsMiddleware } from "./middleware/cors.js";
import { createHelmetMiddleware } from "./middleware/helmet.js";
import { createRateLimiters } from "./middleware/rateLimits.js";
import { createRequestLogger } from "./middleware/requestLogger.js";
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
import { createBanHelpers } from "./helpers/bans.js";
import { createSteamHelpers } from "./helpers/steam.js";
import { loadConfig } from "./config.js";

dotenv.config();
const config = loadConfig(process.env);

function disableBrokenLocalProxyEnv(loggerInstance) {
  const proxyKeys = [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
  ];
  const brokenProxyPattern = /127\.0\.0\.1:9/i;
  let changed = false;
  proxyKeys.forEach((key) => {
    const value = String(process.env[key] || "");
    if (!value || !brokenProxyPattern.test(value)) return;
    delete process.env[key];
    changed = true;
  });
  if (changed) {
    loggerInstance?.warn?.(
      "Disabled local proxy env variables (127.0.0.1:9) to restore Firestore connectivity"
    );
  }
}

const app = express();
app.set("trust proxy", 1);
const logger = pino({ level: config.logLevel });
disableBrokenLocalProxyEnv(logger);
app.use(createRequestLogger(logger));

const CLIENT_ERROR_LOG = config.clientErrorLog;
const MAX_CLIENT_ERRORS = config.clientErrorMax;
const CLIENT_ERROR_ROTATE_BYTES = config.clientErrorRotateBytes;
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

app.use(createCorsMiddleware(config.corsOrigins));

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true, ts: Date.now() });
});

app.disable("x-powered-by");
app.use(createHelmetMiddleware());
app.use(express.json({ limit: "2mb" }));
const { baseLimiter, authLimiter, statsLimiter, ocrLimiter, clientErrorLimiter } =
  createRateLimiters();
app.use(baseLimiter);

const requireAuth = createRequireAuth(admin);

const serviceAccountJson = config.serviceAccountJson;

admin.initializeApp({
  credential: serviceAccountJson
    ? admin.credential.cert(serviceAccountJson)
    : admin.credential.applicationDefault(),
});

const db = admin.firestore();
const CACHE_COLLECTION = config.cacheCollection;
const GLOBAL_CACHE_TTL_MS = config.globalCacheTtlMs;
const BAN_CACHE_TTL_MS = config.banCacheTtlMs;
const LEADERBOARD_CACHE_TTL_MS = config.leaderboardCacheTtlMs;
const PERCENTILES_CACHE_TTL_MS = config.percentilesCacheTtlMs;
const percentilesCache = new Map();

const OCR_DAILY_LIMIT = config.ocrDailyLimit;
const RANK_SUBMIT_DAILY_LIMIT = config.rankSubmitDailyLimit;
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

const { getActiveBansSet } = createBanHelpers({
  db,
  logger,
  BAN_CACHE_TTL_MS,
});

const { getDistributions, getLeaderboardPage, topPercent } = createStatsHelpers({
  admin,
  db,
  logger,
  CACHE_COLLECTION,
  GLOBAL_CACHE_TTL_MS,
  getActiveBansSet,
  LEADERBOARD_CACHE_TTL_MS,
});
const { getSteamOnline, steamAppId } = createSteamHelpers({
  appId: config.steamAppId,
  onlineCacheTtlMs: config.steamOnlineCacheTtlMs,
  requestTimeoutMs: config.steamApiTimeoutMs,
  logger,
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
  getSteamOnline,
  steamAppId,
  getActiveBansSet,
  percentilesCache,
  PERCENTILES_CACHE_TTL_MS,
  getDistributions,
  topPercent,
  pushClientError,
  rotateClientErrorLog,
  CLIENT_ERROR_LOG,
  clientErrorBuffer,
  invalidateStatsCache: async () => {
    try {
      percentilesCache.clear();
      await db.collection(CACHE_COLLECTION).doc("global").delete();
    } catch {
      // ignore cache invalidation errors
    }
  },
};

registerAuthRoutes(app, routesDeps);
registerOcrRoutes(app, routesDeps);
registerRankRoutes(app, routesDeps);
registerLeaderboardRoutes(app, routesDeps);
registerProfileRoutes(app, routesDeps);
registerStatsRoutes(app, routesDeps);
registerClientErrorRoutes(app, routesDeps);
registerAnalyticsRoutes(app, routesDeps);
registerBanRoutes(app, routesDeps);
registerFriendsRoutes(app, routesDeps);
registerTournamentRoutes(app, routesDeps);

app.use(payloadTooLargeHandler);

const PORT = config.port;
const publicUrl = config.publicUrl || `http://localhost:${PORT}`;
const server = app.listen(PORT, () => {
  logger.info(
    { port: PORT, env: config.nodeEnv },
    `Backend running on ${publicUrl}`
  );
});

const shutdown = (signal) => {
  logger.info({ signal }, "Shutdown started");
  const forceTimer = setTimeout(() => {
    logger.error("Forced shutdown timeout reached");
    process.exit(1);
  }, 10000);

  server.close((err) => {
    clearTimeout(forceTimer);
    if (err) {
      logger.error({ err }, "Shutdown failed");
      process.exit(1);
    }
    logger.info("Shutdown completed");
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

