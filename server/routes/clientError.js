export function registerClientErrorRoutes(app, deps) {
  const {
    logger,
    clientErrorLimiter,
    authLimiter,
    requireAuth,
    cleanText,
    pushClientError,
    rotateClientErrorLog,
    CLIENT_ERROR_LOG,
    clientErrorBuffer,
    fs,
  } = deps;

  app.post("/client-error", clientErrorLimiter, async (req, res) => {
    try {
      const body = req.body || {};
      const entry = {
        id: Math.random().toString(36).slice(2, 10),
        ts: Date.now(),
        message: cleanText(body.message, 500),
        stack: cleanText(body.stack, 2000),
        url: cleanText(body.url, 500),
        source: cleanText(body.source, 500),
        line: Number.isFinite(body.line) ? body.line : null,
        col: Number.isFinite(body.col) ? body.col : null,
        userAgent: cleanText(body.userAgent, 500),
        uid: cleanText(body.uid, 128),
      };

      if (!entry.message) {
        return res.status(400).json({ error: "Missing message" });
      }

      pushClientError(entry);
      logger.error({ clientError: entry }, "Client error");
      await rotateClientErrorLog();
      await fs.appendFile(CLIENT_ERROR_LOG, `${JSON.stringify(entry)}\n`);
      return res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "Client error ingest failed");
      return res.status(500).json({ error: "Failed to log client error" });
    }
  });

  app.get("/client-error/recent", authLimiter, requireAuth, async (req, res) => {
    const isAdmin = req.user?.admin === true || req.user?.role === "admin";
    if (!isAdmin) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const limitRaw = Number.parseInt(req.query.limit || "100", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;
    const items = [...clientErrorBuffer].slice(-limit).reverse();
    return res.json({ errors: items });
  });
}
