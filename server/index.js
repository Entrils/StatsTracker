import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import admin from "firebase-admin";
import helmet from "helmet";
import pino from "pino";
import fs from "fs/promises";

dotenv.config();

const app = express();
app.set("trust proxy", 1);
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const CLIENT_ERROR_LOG = process.env.CLIENT_ERROR_LOG || "client_errors.log";
const MAX_CLIENT_ERRORS = Number.parseInt(process.env.CLIENT_ERROR_MAX || "200", 10) || 200;
const CLIENT_ERROR_ROTATE_BYTES =
  Number.parseInt(process.env.CLIENT_ERROR_ROTATE_BYTES || "1048576", 10) ||
  1024 * 1024;
const clientErrorBuffer = [];

function pushClientError(entry) {
  clientErrorBuffer.push(entry);
  if (clientErrorBuffer.length > MAX_CLIENT_ERRORS) {
    clientErrorBuffer.shift();
  }
}

function cleanText(value, max = 1000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

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

app.disable("x-powered-by");
const strictHelmet = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'none'"],
      "frame-ancestors": ["'none'"],
      "base-uri": ["'none'"],
      "form-action": ["'self'"],
      "connect-src": ["'self'"],
      "img-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginResourcePolicy: { policy: "same-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  referrerPolicy: { policy: "no-referrer" },
  hsts: { maxAge: 15552000, includeSubDomains: true, preload: true },
});

const relaxedHelmet = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "frame-ancestors": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "connect-src": ["'self'", "https:"],
      "img-src": ["'self'", "data:", "https:"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "font-src": ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "same-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  referrerPolicy: { policy: "no-referrer" },
  hsts: { maxAge: 15552000, includeSubDomains: true, preload: true },
});

app.use((req, res, next) => {
  if (req.method === "GET" && req.path === "/admin") {
    return relaxedHelmet(req, res, next);
  }
  return strictHelmet(req, res, next);
});
app.use(express.json({ limit: "2mb" }));

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

app.use(baseLimiter);

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid auth token" });
  }
}

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
let globalCache = {
  updatedAt: 0,
  distributions: null,
  countPlayers: 0,
};
const PERCENTILES_CACHE_TTL_MS =
  Number.parseInt(process.env.PERCENTILES_CACHE_TTL_MS || "60000", 10) ||
  60 * 1000;
const percentilesCache = new Map();

async function readCacheDoc(id, ttlMs) {
  try {
    const snap = await db.collection(CACHE_COLLECTION).doc(id).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    if (!data.updatedAt || Date.now() - data.updatedAt > ttlMs) return null;
    return data;
  } catch {
    return null;
  }
}

const OCR_DAILY_LIMIT = 15;
const MAX_OCR_BASE64_LEN = 2_000_000;
const UID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

function parseIntParam(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function isValidUid(uid) {
  return typeof uid === "string" && UID_PATTERN.test(uid);
}

function isValidBase64Image(value) {
  if (typeof value !== "string") return false;
  if (!value.startsWith("data:image/")) return false;
  const parts = value.split(";base64,");
  if (parts.length !== 2) return false;
  const payload = parts[1];
  if (!payload || payload.length > MAX_OCR_BASE64_LEN) return false;
  return /^[A-Za-z0-9+/=\r\n]+$/.test(payload);
}

function getDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function ocrDailyLimiter(req, res, next) {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: "Missing auth token" });

  const day = getDayKey();
  const ref = db.collection("rate_limits").doc(`ocr_${uid}_${day}`);
  const expiresAt = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
  );

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = snap.exists ? Number(snap.data()?.count || 0) : 0;
      if (count >= OCR_DAILY_LIMIT) {
        return { allowed: false, count };
      }
      tx.set(
        ref,
        {
          day,
          count: count + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt,
        },
        { merge: true }
      );
      return { allowed: true, count: count + 1 };
    });

    if (!result.allowed) {
      return res
        .status(429)
        .json({ error: "Daily OCR limit reached", remaining: 0, limit: OCR_DAILY_LIMIT });
    }
    req.ocrRemaining = Math.max(0, OCR_DAILY_LIMIT - result.count);
    return next();
  } catch (err) {
    logger.error("OCR RATE LIMIT ERROR:", err);
    return res.status(500).json({ error: "Rate limit check failed" });
  }
}

async function writeCacheDoc(id, payload) {
  try {
    const size = Buffer.byteLength(JSON.stringify(payload), "utf8");
    if (size > 900000) {
      logger.warn(`CACHE SKIP ${id}: payload too large (${size} bytes)`);
      return;
    }
    await db.collection(CACHE_COLLECTION).doc(id).set(payload);
  } catch (err) {
    logger.warn(`CACHE WRITE FAILED ${id}:`, err?.message || err);
  }
}

async function rotateClientErrorLog() {
  try {
    const stat = await fs.stat(CLIENT_ERROR_LOG);
    if (stat.size < CLIENT_ERROR_ROTATE_BYTES) return;
    const backup = `${CLIENT_ERROR_LOG}.1`;
    await fs.rename(CLIENT_ERROR_LOG, backup).catch(() => {});
  } catch {
    // ignore if file doesn't exist
  }
}

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
    .collection("leaderboard_users")
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(1000);

  while (true) {
    const query = lastDoc ? baseQuery.startAfter(lastDoc) : baseQuery;
    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const m = doc.data() || {};
      const owner = doc.id;
      const matches = Number(m.matches || 0);
      if (!owner || !matches) continue;

      matchTotals.count += matches;
      matchTotals.score += m.score || 0;
      matchTotals.kills += m.kills || 0;
      matchTotals.deaths += m.deaths || 0;
      matchTotals.assists += m.assists || 0;
      matchTotals.damage += m.damage || 0;
      matchTotals.damageShare += m.damageShare || 0;
      matchTotals.wins += m.wins || 0;
      matchTotals.losses += m.losses || 0;

      players.set(owner, {
        count: matches,
        wins: m.wins || 0,
        losses: m.losses || 0,
        score: m.score || 0,
        kills: m.kills || 0,
        deaths: m.deaths || 0,
        assists: m.assists || 0,
        damage: m.damage || 0,
        damageShare: m.damageShare || 0,
      });
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

  return { dist, countPlayers, averages, matchAverages, matchCount: matchTotals.count };
}

async function getDistributions(forceRefresh = false) {
  const now = Date.now();
  if (
    !forceRefresh &&
    globalCache.distributions &&
    now - globalCache.updatedAt < GLOBAL_CACHE_TTL_MS
  ) {
    return globalCache;
  }

  if (!forceRefresh) {
    const cached = await readCacheDoc("global", GLOBAL_CACHE_TTL_MS);
    if (cached?.distributions) {
      globalCache = cached;
      return cached;
    }
  }

  const { dist, countPlayers, averages, matchAverages, matchCount } =
    await buildDistributions();
  globalCache = {
    updatedAt: now,
    distributions: dist,
    countPlayers,
    averages,
    matchAverages,
    matchCount,
  };
  await writeCacheDoc("global", globalCache);
  return globalCache;
}

async function getLeaderboardPage(limit, offset) {
  const baseQuery = db
    .collection("leaderboard_users")
    .orderBy("matches", "desc");
  const pageQuery = baseQuery.offset(offset).limit(limit);
  const snap = await pageQuery.get();
    const rows = snap.docs.map((doc) => {
      const p = doc.data() || {};
      const matches = Number(p.matches || 0);
    const avgScore = matches ? (p.score || 0) / matches : 0;
    const avgKills = matches ? (p.kills || 0) / matches : 0;
    const avgDeaths = matches ? (p.deaths || 0) / matches : 0;
    const avgAssists = matches ? (p.assists || 0) / matches : 0;
    const kda = (p.kills + p.assists) / Math.max(1, p.deaths || 0);
    const winrate = (p.wins / Math.max(1, matches)) * 100 || 0;
      return {
        uid: doc.id,
        name: p.name || "Unknown",
        socials: p.socials || null,
        score: p.score || 0,
        kills: p.kills || 0,
        deaths: p.deaths || 0,
        assists: p.assists || 0,
        damage: p.damage || 0,
      damageShare: p.damageShare || 0,
      wins: p.wins || 0,
      losses: p.losses || 0,
      matches,
      avgScore,
      avgKills,
      avgDeaths,
      avgAssists,
      kda,
      winrate,
    };
  });

    const missingSocials = rows.filter(
      (r) => !r.socials || !Object.keys(r.socials || {}).length
    );

    if (missingSocials.length) {
      const refs = missingSocials.map((r) =>
        db.collection("users").doc(r.uid).collection("profile").doc("socials")
      );
      const snaps = await db.getAll(...refs);
      snaps.forEach((snap, i) => {
        const data = snap.exists ? snap.data() || {} : {};
        const socials = data.socials || null;
        if (socials && Object.keys(socials).length) {
          missingSocials[i].socials = socials;
        }
      });
    }

    const countSnap = await db.collection("leaderboard_users").count().get();
  const total = countSnap.data().count || 0;
  return { rows, total };
}

app.post("/auth/discord", authLimiter, async (req, res) => {
  const { code } = req.body;


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


    // рџ”Ґ Р’РђР–РќРћ: РёСЃРїРѕР»СЊР·СѓРµРј fetch, Р° РЅРµ axios
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


    res.json({
      firebaseToken,
      discordUser,
    });
  } catch (err) {
    logger.error("OAUTH ERROR FULL:", err);
    res.status(500).json({
      error: "OAuth failed",
      details: err.message,
    });
  }
});

app.post("/ocr", ocrLimiter, requireAuth, ocrDailyLimiter, async (req, res) => {
  try {
    const { base64Image, lang } = req.body || {};
    if (!base64Image) {
      return res.status(400).json({ error: "Missing base64Image" });
    }
    if (!isValidBase64Image(base64Image)) {
      return res.status(400).json({ error: "Invalid base64Image" });
    }
    if (!process.env.OCR_SPACE_API_KEY) {
      return res.status(500).json({ error: "OCR key not configured" });
    }
    const requestedLang = lang === "rus" ? "rus" : "eng";

    const runOcr = async (ocrLang) => {
      const form = new URLSearchParams();
      form.append("apikey", process.env.OCR_SPACE_API_KEY);
      form.append("language", ocrLang);
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
        return { ok: false, status: r.status, errorText: text };
      }

      const data = await r.json();
      const parsedText =
        data?.ParsedResults?.[0]?.ParsedText ||
        data?.ParsedResults?.[0]?.TextOverlay?.Lines?.map((l) => l?.LineText).join("\n") ||
        "";
      const hasText = typeof parsedText === "string" && parsedText.trim().length > 0;
      const errored = Boolean(data?.IsErroredOnProcessing);
      return { ok: true, data, hasText, errored };
    };

    let result = await runOcr(requestedLang);
    if (
      requestedLang === "rus" &&
      (result.ok === false || result.errored || !result.hasText)
    ) {
      const fallback = await runOcr("eng");
      if (fallback.ok) {
        result = fallback;
        result.data.usedLanguage = "eng";
      }
    }

    if (!result.ok) {
      return res.status(502).json({
        error: "OCR request failed",
        details: result.errorText || "Unknown OCR error",
      });
    }

    result.data.remaining =
      typeof req.ocrRemaining === "number" ? req.ocrRemaining : null;
    result.data.limit = OCR_DAILY_LIMIT;
    result.data.usedLanguage = result.data.usedLanguage || requestedLang;
    return res.json(result.data);
  } catch (err) {
    logger.error("OCR ERROR:", err);
    return res.status(500).json({ error: "OCR failed" });
  }
});

app.post("/leaderboard/update", authLimiter, requireAuth, async (req, res) => {
  try {
    const { matchId } = req.body || {};
    const uid = req.user?.uid;
    if (!uid || !matchId) {
      return res.status(400).json({ error: "Missing uid or matchId" });
    }

    const matchRef = db.collection("users").doc(uid).collection("matches").doc(matchId);
    const aggRef = db.collection("leaderboard_users").doc(uid);
    const processedRef = db.collection("leaderboard_updates").doc(`${uid}_${matchId}`);

    const result = await db.runTransaction(async (tx) => {
      const processedSnap = await tx.get(processedRef);
      if (processedSnap.exists) {
        return { updated: false };
      }

      const matchSnap = await tx.get(matchRef);
      if (!matchSnap.exists) {
        return { updated: false, missingMatch: true };
      }

      const m = matchSnap.data() || {};
      const inc = admin.firestore.FieldValue.increment;
      const wins = m.result === "victory" ? 1 : 0;
      const losses = m.result === "defeat" ? 1 : 0;

      tx.set(
        aggRef,
        {
          uid,
          name: m.name || "Unknown",
          score: inc(m.score || 0),
          kills: inc(m.kills || 0),
          deaths: inc(m.deaths || 0),
          assists: inc(m.assists || 0),
          damage: inc(m.damage || 0),
          damageShare: inc(m.damageShare || 0),
          matches: inc(1),
          wins: inc(wins),
          losses: inc(losses),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(processedRef, {
        uid,
        matchId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { updated: true };
    });

    return res.json(result);
  } catch (err) {
    logger.error("LEADERBOARD UPDATE ERROR:", err);
    return res.status(500).json({ error: "Failed to update leaderboard" });
  }
});

app.post("/leaderboard/rebuild", authLimiter, requireAuth, async (req, res) => {
  try {
    const isAdmin = req.user?.admin === true || req.user?.role === "admin";
    if (!isAdmin) {
      return res.status(403).json({ error: "Forbidden" });
    }

    let lastDoc = null;
    const players = new Map();
    const baseQuery = db
      .collectionGroup("matches")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(1000);

    while (true) {
      const query = lastDoc ? baseQuery.startAfter(lastDoc) : baseQuery;
      const snap = await query.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        const m = doc.data() || {};
        const uid =
          doc.ref?.parent?.parent?.id || m.ownerUid || m.uid || m.userId;
        if (!uid) continue;

        const prev = players.get(uid) || {
          uid,
          name: "Unknown",
          score: 0,
          kills: 0,
          deaths: 0,
          assists: 0,
          damage: 0,
          damageShare: 0,
          wins: 0,
          losses: 0,
          matches: 0,
        };

        if ((m.name || m.playerName || m.username) && prev.name === "Unknown") {
          prev.name = m.name || m.playerName || m.username;
        }

        prev.score += m.score || 0;
        prev.kills += m.kills || 0;
        prev.deaths += m.deaths || 0;
        prev.assists += m.assists || 0;
        prev.damage += m.damage || 0;
        prev.damageShare += m.damageShare || 0;
        if (m.result === "victory") prev.wins += 1;
        else if (m.result === "defeat") prev.losses += 1;
        prev.matches += 1;

        players.set(uid, prev);
      }

      lastDoc = snap.docs[snap.docs.length - 1];
    }

    const batchSize = 500;
    let batch = db.batch();
    let i = 0;

    for (const p of players.values()) {
      const ref = db.collection("leaderboard_users").doc(p.uid);
      batch.set(
        ref,
        {
          name: p.name,
          score: p.score,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          damage: p.damage,
          damageShare: p.damageShare,
          wins: p.wins,
          losses: p.losses,
          matches: p.matches,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      i += 1;
      if (i % batchSize === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }

    if (i % batchSize !== 0) {
      await batch.commit();
    }

    return res.json({ ok: true, players: players.size });
  } catch (err) {
    logger.error("LEADERBOARD REBUILD ERROR:", err);
    return res.status(500).json({ error: "Failed to rebuild leaderboard" });
  }
});

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

app.get("/player/:uid", statsLimiter, async (req, res) => {
  try {
    const { uid } = req.params;
    if (!uid || !isValidUid(uid)) {
      return res.status(400).json({ error: "Invalid uid" });
    }

    const limitRaw = parseIntParam(req.query.limit, 200);
    if (limitRaw === null) {
      return res.status(400).json({ error: "Invalid limit" });
    }
    const limit = Math.min(Math.max(limitRaw, 1), 500);

    const matchesRef = db.collection("users").doc(uid).collection("matches");
    const profileSnap = await db.collection("leaderboard_users").doc(uid).get();
    const profileData = profileSnap.exists ? profileSnap.data() : null;
    let socials = profileData?.socials || null;
    if (socials && typeof socials === "object" && !Object.keys(socials).length) {
      socials = null;
    }
    if (!socials) {
      const profileDoc = await db
        .collection("users")
        .doc(uid)
        .collection("profile")
        .doc("socials")
        .get();
      socials = profileDoc.exists ? profileDoc.data()?.socials || null : null;
    }
    const snap = await matchesRef.orderBy("createdAt", "asc").limit(limit).get();

    const matches = snap.docs.map((doc, i) => ({
      index: i + 1,
      id: doc.id,
      ...doc.data(),
    }));

    return res.json({
      uid,
      matches,
      total: matches.length,
      name: profileData?.name || null,
      socials,
    });
  } catch (err) {
    logger.error("PLAYER PROFILE ERROR:", err);
    return res.status(500).json({ error: "Failed to load player profile" });
  }
});

app.get("/profile/:uid", statsLimiter, async (req, res) => {
  try {
    const { uid } = req.params;
    if (!uid) return res.status(400).json({ error: "Missing uid" });

    const snap = await db.collection("leaderboard_users").doc(uid).get();
    const data = snap.exists ? snap.data() || {} : {};

    let socials = data.socials || null;
    if (socials && typeof socials === "object" && !Object.keys(socials).length) {
      socials = null;
    }
    if (!socials) {
      const profileSnap = await db
        .collection("users")
        .doc(uid)
        .collection("profile")
        .doc("socials")
        .get();
      socials = profileSnap.exists ? profileSnap.data()?.socials || null : null;
    }

    return res.json({ uid, socials, name: data.name || null });
  } catch (err) {
    logger.error("PROFILE ERROR:", err);
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

app.post("/profile/socials", authLimiter, requireAuth, async (req, res) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Missing auth token" });

    const socials = req.body?.socials || {};
    const allowed = ["twitch", "youtube", "tiktok"];
    const updates = {};

    for (const key of allowed) {
      const raw = typeof socials[key] === "string" ? socials[key].trim() : "";
      if (!raw) {
        updates[`socials.${key}`] = admin.firestore.FieldValue.delete();
      } else if (raw.length > 120) {
        return res.status(400).json({ error: `Invalid ${key}` });
      } else {
        updates[`socials.${key}`] = raw;
      }
    }

    await db
      .collection("leaderboard_users")
      .doc(uid)
      .set(
        {
          uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...updates,
        },
        { merge: true }
      );

    await db
      .collection("users")
      .doc(uid)
      .collection("profile")
      .doc("socials")
      .set({ socials }, { merge: true });

    return res.json({ ok: true });
  } catch (err) {
    logger.error("SOCIALS UPDATE ERROR:", err);
    return res.status(500).json({ error: "Failed to update socials" });
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

app.get("/leaderboard", statsLimiter, async (req, res) => {
  try {
    const limitRaw = parseIntParam(req.query.limit, 300);
    const offsetRaw = parseIntParam(req.query.offset, 0);
    if (limitRaw === null || offsetRaw === null) {
      return res.status(400).json({ error: "Invalid pagination params" });
    }
    const limit = Math.min(Math.max(limitRaw, 1), 1000);
    const offset = Math.max(offsetRaw, 0);

    const now = Date.now();
    const { rows, total } = await getLeaderboardPage(limit, offset);
    return res.json({
      updatedAt: now,
      total,
      rows,
    });
  } catch (err) {
    logger.error("LEADERBOARD ERROR:", err);
    return res.status(500).json({ error: "Failed to load leaderboard" });
  }
});

app.use((err, req, res, next) => {
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({ error: "Payload too large" });
  }
  return next(err);
});

app.listen(process.env.PORT, () => {
  logger.info(`Backend running on http://localhost:${process.env.PORT}`);
});

