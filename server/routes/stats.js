export function registerStatsRoutes(app, deps) {
  const {
    logger,
    statsLimiter,
    percentilesCache,
    PERCENTILES_CACHE_TTL_MS,
    getDistributions,
    topPercent,
  } = deps;

  app.post("/stats/percentiles", statsLimiter, async (req, res) => {
    try {
      const metrics = req.body?.metrics;
      if (!metrics) {
        return res.status(400).json({ error: "Missing metrics" });
      }

      const numberFields = [
        "matches",
        "wins",
        "losses",
        "winrate",
        "avgScore",
        "avgKills",
        "avgDeaths",
        "avgAssists",
        "avgDamage",
        "avgDamageShare",
        "kda",
      ];

      for (const key of numberFields) {
        const v = metrics[key];
        if (typeof v !== "number" || Number.isNaN(v) || !Number.isFinite(v)) {
          return res.status(400).json({ error: `Invalid ${key}` });
        }
      }

      if (metrics.matches < 0 || metrics.matches > 100000) {
        return res.status(400).json({ error: "Invalid matches" });
      }
      if (metrics.wins < 0 || metrics.losses < 0) {
        return res.status(400).json({ error: "Invalid wins/losses" });
      }
      if (metrics.wins + metrics.losses > metrics.matches + 1) {
        return res.status(400).json({ error: "Wins/losses exceed matches" });
      }
      if (metrics.winrate < 0 || metrics.winrate > 100) {
        return res.status(400).json({ error: "Invalid winrate" });
      }
      if (metrics.avgDamageShare < 0 || metrics.avgDamageShare > 100) {
        return res.status(400).json({ error: "Invalid damageShare" });
      }
      if (metrics.kda < 0 || metrics.kda > 50) {
        return res.status(400).json({ error: "Invalid kda" });
      }
      if (
        metrics.avgScore < 0 ||
        metrics.avgKills < 0 ||
        metrics.avgDeaths < 0 ||
        metrics.avgAssists < 0 ||
        metrics.avgDamage < 0
      ) {
        return res.status(400).json({ error: "Invalid averages" });
      }

      const cacheKey = JSON.stringify(metrics);
      const cached = percentilesCache.get(cacheKey);
      const now = Date.now();
      if (cached && now - cached.ts < PERCENTILES_CACHE_TTL_MS) {
        return res.json(cached.payload);
      }

      const forceRefresh = String(req.query.refresh || "") === "1";
      const cache = await getDistributions(forceRefresh);
      const dist = cache.distributions;

      const percentiles = {
        matches: topPercent(dist.matches, metrics.matches, true),
        wins: topPercent(dist.wins, metrics.wins, true),
        losses: topPercent(dist.losses, metrics.losses, false),
        winrate: topPercent(dist.winrate, metrics.winrate, true),
        avgScore: topPercent(dist.avgScore, metrics.avgScore, true),
        avgKills: topPercent(dist.avgKills, metrics.avgKills, true),
        avgDeaths: topPercent(dist.avgDeaths, metrics.avgDeaths, false),
        avgAssists: topPercent(dist.avgAssists, metrics.avgAssists, true),
        avgDamage: topPercent(dist.avgDamage, metrics.avgDamage, true),
        avgDamageShare: topPercent(
          dist.avgDamageShare,
          metrics.avgDamageShare,
          true
        ),
        kda: topPercent(dist.kda, metrics.kda, true),
      };

      const payload = {
        updatedAt: cache.updatedAt,
        countPlayers: cache.countPlayers,
        matchCount: cache.matchCount,
        averages: cache.averages,
        matchAverages: cache.matchAverages,
        percentiles,
      };

      percentilesCache.set(cacheKey, { ts: now, payload });
      return res.json(payload);
    } catch (err) {
      logger.error("PERCENTILES ERROR:", err);
      return res.status(500).json({ error: "Failed to compute percentiles" });
    }
  });
}
