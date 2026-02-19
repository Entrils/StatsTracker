import { fetchWithTimeoutRetry } from "../helpers/fetchWithTimeoutRetry.js";
import { randomBytes } from "crypto";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const OAUTH_STATE_MAX_SIZE = 5000;
const OAUTH_STATE_PATTERN = /^[a-f0-9]{48}$/i;

function getClientFingerprint(req) {
  const ua = String(req.headers["user-agent"] || "");
  const ip = String(req.ip || req.headers["x-forwarded-for"] || "");
  return `${ip}|${ua}`;
}

function cleanupExpiredStates(stateStore, now = Date.now()) {
  for (const [key, value] of stateStore.entries()) {
    if (!value || value.expiresAt <= now) {
      stateStore.delete(key);
    }
  }
}

function trimStateStore(stateStore, maxSize) {
  while (stateStore.size > maxSize) {
    const firstKey = stateStore.keys().next().value;
    if (!firstKey) break;
    stateStore.delete(firstKey);
  }
}

export function registerAuthRoutes(app, deps) {
  const { admin, db, logger, authLimiter } = deps;
  const oauthStateStore = new Map();

  app.get("/auth/discord/state", authLimiter, async (req, res) => {
    const now = Date.now();
    cleanupExpiredStates(oauthStateStore, now);

    const state = randomBytes(24).toString("hex");
    const expiresAt = now + OAUTH_STATE_TTL_MS;
    oauthStateStore.set(state, {
      expiresAt,
      fingerprint: getClientFingerprint(req),
    });
    trimStateStore(oauthStateStore, OAUTH_STATE_MAX_SIZE);

    return res.json({ state, expiresAt });
  });

  app.post("/auth/discord", authLimiter, async (req, res) => {
    const { code, state } = req.body || {};

    if (!code || !state) {
      return res.status(400).json({ error: "Missing code or state" });
    }
    const safeState = String(state).trim();
    if (!OAUTH_STATE_PATTERN.test(safeState)) {
      return res.status(400).json({ error: "Invalid OAuth state" });
    }

    const now = Date.now();
    cleanupExpiredStates(oauthStateStore, now);
    const stateRecord = oauthStateStore.get(safeState);
    oauthStateStore.delete(safeState);
    if (!stateRecord || stateRecord.expiresAt <= now) {
      return res.status(400).json({ error: "Invalid OAuth state" });
    }
    if (stateRecord.fingerprint !== getClientFingerprint(req)) {
      return res.status(400).json({ error: "Invalid OAuth state" });
    }

    try {
      const params = new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
      });

      const tokenRes = await fetchWithTimeoutRetry(
        "https://discord.com/api/oauth2/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params,
        },
        { timeoutMs: 8000, retries: 1, retryDelayMs: 350 }
      );

      if (!tokenRes.ok) {
        const text = await tokenRes.text().catch(() => "");
        logger.warn(
          { status: tokenRes.status, body: text.slice(0, 500) },
          "Discord token request failed"
        );
        return res.status(502).json({ error: "OAuth failed" });
      }

      const tokenData = await tokenRes.json();
      const { access_token } = tokenData;

      const userRes = await fetchWithTimeoutRetry(
        "https://discord.com/api/users/@me",
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        },
        { timeoutMs: 8000, retries: 1, retryDelayMs: 350 }
      );

      if (!userRes.ok) {
        const text = await userRes.text().catch(() => "");
        logger.warn(
          { status: userRes.status, body: text.slice(0, 500) },
          "Discord user request failed"
        );
        return res.status(502).json({ error: "OAuth failed" });
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

      await db
        .collection("leaderboard_users")
        .doc(`discord:${discordUser.id}`)
        .set(
          {
            uid: `discord:${discordUser.id}`,
            name: discordUser.global_name || discordUser.username,
            avatar: discordUser.avatar || null,
            provider: "discord",
            hiddenElo: 500,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

      return res.json({
        firebaseToken,
        discordUser,
      });
    } catch (err) {
      logger.error("OAUTH ERROR FULL:", err);
      return res.status(500).json({ error: "OAuth failed" });
    }
  });
}
