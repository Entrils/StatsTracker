import { randomUUID } from "crypto";

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

export function createRequestLogger(logger) {
  return function requestLogger(req, res, next) {
    const requestId = req.headers["x-request-id"] || randomUUID();
    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);

    const startedAt = nowMs();
    const requestLogger = logger.child({
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
    });

    requestLogger.info("request:start");

    res.on("finish", () => {
      requestLogger.info(
        {
          statusCode: res.statusCode,
          durationMs: nowMs() - startedAt,
        },
        "request:finish"
      );
    });

    next();
  };
}
