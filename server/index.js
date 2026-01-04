import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // allow server-to-server or curl
      if (!allowedOrigins.length) return cb(null, true);
      return allowedOrigins.includes(origin)
        ? cb(null, true)
        : cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());

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

app.use(baseLimiter);

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  : null;

admin.initializeApp({
  credential: serviceAccountJson
    ? admin.credential.cert(serviceAccountJson)
    : admin.credential.applicationDefault(),
});

const db = admin.firestore();
const GLOBAL_CACHE_TTL_MS = 15 * 60 * 1000;
let globalCache = {
  updatedAt: 0,
  distributions: null,
  countPlayers: 0,
};
const PERCENTILES_CACHE_TTL_MS = 60 * 1000;
const percentilesCache = new Map();

function percentileRank(sorted, value) {
  if (!sorted?.length || typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  let lo = 0;
  let hi = sorted.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sorted[mid] <= value) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx < 0) return 1;
  return Math.round(((idx + 1) / sorted.length) * 100);
}

function topPercent(sorted, value, preferHigher = true) {
  const pct = percentileRank(sorted, value);
  if (!pct) return null;
  return preferHigher ? Math.max(1, 100 - pct + 1) : Math.max(1, pct);
}

async function buildDistributions() {
  const players = new Map();
  const matchTotals = {
    count: 0,
    wins: 0,
    losses: 0,
    score: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    damage: 0,
    damageShare: 0,
  };
  let lastDoc = null;
  const baseQuery = db
    .collectionGroup("matches")
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(1000);

  while (true) {
    const query = lastDoc ? baseQuery.startAfter(lastDoc) : baseQuery;
    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const m = doc.data();
      const owner =
        doc.ref?.parent?.parent?.id || m.ownerUid || m.uid || m.userId;
      if (!owner) continue;
      matchTotals.count += 1;
      matchTotals.score += m.score || 0;
      matchTotals.kills += m.kills || 0;
      matchTotals.deaths += m.deaths || 0;
      matchTotals.assists += m.assists || 0;
      matchTotals.damage += m.damage || 0;
      matchTotals.damageShare += m.damageShare || 0;
      if (m.result === "victory") matchTotals.wins += 1;
      else if (m.result === "defeat") matchTotals.losses += 1;

      const prev = players.get(owner) || {
        count: 0,
        wins: 0,
        losses: 0,
        score: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        damage: 0,
        damageShare: 0,
      };
      prev.count += 1;
      prev.score += m.score || 0;
      prev.kills += m.kills || 0;
      prev.deaths += m.deaths || 0;
      prev.assists += m.assists || 0;
      prev.damage += m.damage || 0;
      prev.damageShare += m.damageShare || 0;
      if (m.result === "victory") prev.wins += 1;
      else if (m.result === "defeat") prev.losses += 1;
      players.set(owner, prev);
    }

    lastDoc = snap.docs[snap.docs.length - 1];
  }

  const dist = {
    matches: [],
    wins: [],
    losses: [],
    avgScore: [],
    avgKills: [],
    avgDeaths: [],
    avgAssists: [],
    avgDamage: [],
    avgDamageShare: [],
    kda: [],
    winrate: [],
  };
  const sums = {
    matches: 0,
    wins: 0,
    losses: 0,
    avgScore: 0,
    avgKills: 0,
    avgDeaths: 0,
    avgAssists: 0,
    avgDamage: 0,
    avgDamageShare: 0,
    kda: 0,
    winrate: 0,
  };

  for (const p of players.values()) {
    if (!p.count) continue;
    const avgScore = p.score / p.count;
    const avgKills = p.kills / p.count;
    const avgDeaths = p.deaths / p.count;
    const avgAssists = p.assists / p.count;
    const avgDamage = p.damage / p.count;
    const avgDamageShare = p.damageShare / p.count;
    const kda = (p.kills + p.assists) / Math.max(1, p.deaths);
    const winrate = ((p.wins / Math.max(1, p.wins + p.losses)) * 100) || 0;

    dist.matches.push(p.count);
    dist.wins.push(p.wins);
    dist.losses.push(p.losses);
    dist.avgScore.push(avgScore);
    dist.avgKills.push(avgKills);
    dist.avgDeaths.push(avgDeaths);
    dist.avgAssists.push(avgAssists);
    dist.avgDamage.push(avgDamage);
    dist.avgDamageShare.push(avgDamageShare);
    dist.kda.push(kda);
    dist.winrate.push(winrate);

    sums.matches += p.count;
    sums.wins += p.wins;
    sums.losses += p.losses;
    sums.avgScore += avgScore;
    sums.avgKills += avgKills;
    sums.avgDeaths += avgDeaths;
    sums.avgAssists += avgAssists;
    sums.avgDamage += avgDamage;
    sums.avgDamageShare += avgDamageShare;
    sums.kda += kda;
    sums.winrate += winrate;
  }

  for (const key of Object.keys(dist)) {
    dist[key] = dist[key].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  }

  const countPlayers = dist.avgScore.length;
  const averages = {};
  if (countPlayers) {
    for (const key of Object.keys(sums)) {
      averages[key] = sums[key] / countPlayers;
    }
  }

  const matchAverages = matchTotals.count
    ? {
        avgScore: matchTotals.score / matchTotals.count,
        avgKills: matchTotals.kills / matchTotals.count,
        avgDeaths: matchTotals.deaths / matchTotals.count,
        avgAssists: matchTotals.assists / matchTotals.count,
        avgDamage: matchTotals.damage / matchTotals.count,
        avgDamageShare: matchTotals.damageShare / matchTotals.count,
        kda:
          (matchTotals.kills + matchTotals.assists) /
          Math.max(1, matchTotals.deaths),
        winrate:
          (matchTotals.wins / Math.max(1, matchTotals.wins + matchTotals.losses)) *
            100 || 0,
      }
    : null;

  return { dist, countPlayers, averages, matchAverages };
}

async function getDistributions() {
  const now = Date.now();
  if (globalCache.distributions && now - globalCache.updatedAt < GLOBAL_CACHE_TTL_MS) {
    return globalCache;
  }

  const { dist, countPlayers, averages, matchAverages } =
    await buildDistributions();
  globalCache = {
    updatedAt: now,
    distributions: dist,
    countPlayers,
    averages,
    matchAverages,
  };
  return globalCache;
}

app.post("/auth/discord", authLimiter, async (req, res) => {
  const { code } = req.body;

  console.log("AUTH REQUEST RECEIVED. CODE:", code);

  if (!code) {
    return res.status(400).json({ error: "No code provided" });
  }

  try {
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI,
    });

    console.log("DISCORD TOKEN PARAMS:", params.toString());

    // 🔥 ВАЖНО: используем fetch, а не axios
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`Discord token error: ${text}`);
    }

    const tokenData = await tokenRes.json();
    const { access_token } = tokenData;

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    if (!userRes.ok) {
      const text = await userRes.text();
      throw new Error(`Discord user error: ${text}`);
    }

    const discordUser = await userRes.json();

    const firebaseToken = await admin.auth().createCustomToken(
      `discord:${discordUser.id}`,
      {
        username: discordUser.username,
        avatar: discordUser.avatar,
        provider: "discord",
      }
    );

    console.log("CREATED FIREBASE TOKEN FOR:", discordUser.id);

    res.json({
      firebaseToken,
      discordUser,
    });
  } catch (err) {
    console.error("OAUTH ERROR FULL:", err);
    res.status(500).json({
      error: "OAuth failed",
      details: err.message,
    });
  }
});

app.post("/ocr", ocrLimiter, async (req, res) => {
  try {
    const { base64Image } = req.body || {};
    if (!base64Image) {
      return res.status(400).json({ error: "Missing base64Image" });
    }
    if (!process.env.OCR_SPACE_API_KEY) {
      return res.status(500).json({ error: "OCR key not configured" });
    }

    const form = new URLSearchParams();
    form.append("apikey", process.env.OCR_SPACE_API_KEY);
    form.append("language", "eng");
    form.append("OCREngine", "2");
    form.append("scale", "true");
    form.append("isOverlayRequired", "false");
    form.append("base64Image", base64Image);

    const r = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: "OCR request failed", details: text });
    }

    const data = await r.json();
    return res.json(data);
  } catch (err) {
    console.error("OCR ERROR:", err);
    return res.status(500).json({ error: "OCR failed" });
  }
});

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

    const cache = await getDistributions();
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
      averages: cache.averages,
      matchAverages: cache.matchAverages,
      percentiles,
    };

    percentilesCache.set(cacheKey, { ts: now, payload });
    return res.json(payload);
  } catch (err) {
    console.error("PERCENTILES ERROR:", err);
    return res.status(500).json({ error: "Failed to compute percentiles" });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Backend running on http://localhost:${process.env.PORT}`);
});
