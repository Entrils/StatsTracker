import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import serviceAccount from "./firebaseServiceAccount.json" assert { type: "json" };

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.post("/auth/discord", async (req, res) => {
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

app.listen(process.env.PORT, () => {
  console.log(`Backend running on http://localhost:${process.env.PORT}`);
});
