import { fetchWithTimeoutRetry } from "../helpers/fetchWithTimeoutRetry.js";

export function registerAuthRoutes(app, deps) {
  const { admin, db, logger, authLimiter } = deps;

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
