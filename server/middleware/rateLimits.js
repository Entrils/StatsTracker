import rateLimit from "express-rate-limit";

export function createRateLimiters() {
  const isProd = process.env.NODE_ENV === "production";

  const baseLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: isProd ? 300 : 5000,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });

  const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: isProd ? 30 : 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });

  const statsLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: isProd ? 60 : 600,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });

  const ocrLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: isProd ? 20 : 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });

  const clientErrorLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: isProd ? 60 : 600,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });

  return { baseLimiter, authLimiter, statsLimiter, ocrLimiter, clientErrorLimiter };
}
