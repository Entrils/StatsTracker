function toInt(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseServiceAccount(jsonValue) {
  if (!jsonValue) return null;
  try {
    return JSON.parse(jsonValue);
  } catch {
    throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON");
  }
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  const isProd = nodeEnv === "production";

  const config = {
    nodeEnv,
    isProd,
    port: toInt(env.PORT, 4000),
    logLevel: env.LOG_LEVEL || "info",
    corsOrigins: (env.CORS_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    serviceAccountJson: parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON),
    publicUrl: env.RENDER_EXTERNAL_URL || null,
    clientErrorLog: env.CLIENT_ERROR_LOG || "client_errors.log",
    clientErrorMax: toInt(env.CLIENT_ERROR_MAX, 200),
    clientErrorRotateBytes: toInt(env.CLIENT_ERROR_ROTATE_BYTES, 1024 * 1024),
    cacheCollection: "stats_cache",
    globalCacheTtlMs: toInt(env.GLOBAL_CACHE_TTL_MS, 15 * 60 * 1000),
    banCacheTtlMs: toInt(env.BAN_CACHE_TTL_MS, 30 * 1000),
    leaderboardCacheTtlMs: toInt(env.LEADERBOARD_CACHE_TTL_MS, 30 * 1000),
    percentilesCacheTtlMs: toInt(env.PERCENTILES_CACHE_TTL_MS, 60 * 1000),
    ocrDailyLimit: toInt(env.OCR_DAILY_LIMIT, 15),
    rankSubmitDailyLimit: toInt(env.RANK_SUBMIT_DAILY_LIMIT, 1),
    steamAppId: toInt(env.STEAM_APP_ID, null),
    steamOnlineCacheTtlMs: toInt(env.STEAM_ONLINE_CACHE_TTL_MS, 60 * 1000),
    steamApiTimeoutMs: toInt(env.STEAM_API_TIMEOUT_MS, 4000),
  };

  if (isProd && !config.corsOrigins.length) {
    throw new Error("CORS_ORIGINS is required in production");
  }

  return config;
}
