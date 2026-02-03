import cors from "cors";

export function createCorsMiddleware(allowedOrigins) {
  return cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (!allowedOrigins.length) return cb(null, true);
      return allowedOrigins.includes(origin)
        ? cb(null, true)
        : cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  });
}
