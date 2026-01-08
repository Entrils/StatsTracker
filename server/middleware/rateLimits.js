import rateLimit from "express-rate-limit";

export function createRateLimiters() {
  const baseLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });

  const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });

  const statsLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 60,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });

  const ocrLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });

  const clientErrorLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 60,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });

  return { baseLimiter, authLimiter, statsLimiter, ocrLimiter, clientErrorLimiter };
}
