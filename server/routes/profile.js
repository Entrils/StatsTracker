import axios from "axios";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

export function registerProfileRoutes(app, deps) {
    const {
      admin,
      db,
      logger,
    statsLimiter,
    authLimiter,
    requireAuth,
      parseIntParam,
      isValidUid,
    } = deps;

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(__dirname, "..", "..");
    const imageCache = new Map();

  const getCachedDataUri = async (relativePath) => {
    if (imageCache.has(relativePath)) return imageCache.get(relativePath);
    const fullPath = path.join(repoRoot, relativePath);
    try {
      const buffer = await fs.readFile(fullPath);
      const dataUri = `data:image/png;base64,${buffer.toString("base64")}`;
      imageCache.set(relativePath, dataUri);
      return dataUri;
    } catch {
      logger.warn(`SHARE IMAGE: local asset missing: ${fullPath}`);
      const baseUrl = (process.env.PUBLIC_SITE_URL || "").replace(/\/+$/, "");
      if (!baseUrl) throw new Error("ASSET_NOT_FOUND");
      const webPath = relativePath.replace(/^client[\\/]+public[\\/]+/, "/");
      const assetUrl = `${baseUrl}${webPath.startsWith("/") ? "" : "/"}${webPath}`;
      logger.warn(`SHARE IMAGE: fallback fetch ${assetUrl}`);
      const res = await axios.get(assetUrl, { responseType: "arraybuffer" });
      const dataUri = `data:image/png;base64,${Buffer.from(res.data).toString("base64")}`;
      imageCache.set(relativePath, dataUri);
      return dataUri;
    }
  };

  const buildShareData = async (uid, lang) => {
    const profileSnap = await db.collection("leaderboard_users").doc(uid).get();
    const profileData = profileSnap.exists ? profileSnap.data() : null;
    const name = profileData?.name || uid;
    const provider = profileData?.provider || null;
    const avatar = profileData?.avatar || null;
    const matches = Number.isFinite(profileData?.matches) ? profileData.matches : null;
    const avgScore = Number.isFinite(profileData?.avgScore) ? profileData.avgScore : null;
    const kda = Number.isFinite(profileData?.kda) ? profileData.kda : null;
    const wins = Number.isFinite(profileData?.wins) ? profileData.wins : null;
    const losses = Number.isFinite(profileData?.losses) ? profileData.losses : null;
    const winrateRaw = Number.isFinite(profileData?.winrate)
      ? profileData.winrate
      : null;
    let winrate = winrateRaw;
    if (winrate === null && (wins !== null || losses !== null)) {
      const w = wins ?? 0;
      const l = losses ?? 0;
      const total = w + l;
      winrate = total ? (w / total) * 100 : 0;
    }
    if (winrate !== null) {
      winrate = Math.round(winrate * 10) / 10;
    }

    let avatarUrl = null;
    if (provider === "discord" && uid.startsWith("discord:")) {
      const discordId = uid.replace("discord:", "");
      if (avatar) {
        avatarUrl = `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png?size=512`;
      } else if (discordId) {
        const fallbackIndex = Number.parseInt(discordId, 10) % 5;
        avatarUrl = `https://cdn.discordapp.com/embed/avatars/${fallbackIndex}.png`;
      }
    }
    if (!avatarUrl) {
      avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
    }

    const ranksSnap = await db
      .collection("users")
      .doc(uid)
      .collection("profile")
      .doc("ranks")
      .get();
    const ranks = ranksSnap.exists ? ranksSnap.data() || null : null;

    const matchDocs = await db
      .collection("users")
      .doc(uid)
      .collection("matches")
      .orderBy("createdAt", "asc")
      .limit(2000)
      .get();
    const matchRows = matchDocs.docs.map((doc) => doc.data());
    const matchCount = matchRows.length;

    const friendsDocs = await db
      .collection("users")
      .doc(uid)
      .collection("friends")
      .limit(20)
      .get();
    const friendCount = friendsDocs.size;

    const updatedAtRaw = profileData?.updatedAt;
    let updatedAt = null;
    if (updatedAtRaw?.toMillis) {
      updatedAt = updatedAtRaw.toMillis();
    } else if (typeof updatedAtRaw === "number") {
      updatedAt = updatedAtRaw;
    } else if (updatedAtRaw?.seconds) {
      updatedAt = updatedAtRaw.seconds * 1000;
    }
    if (updatedAt === null && matchCount) {
      const lastMatch = matchRows[matchRows.length - 1];
      if (typeof lastMatch?.createdAt === "number") {
        updatedAt = lastMatch.createdAt;
      }
    }

    return {
      name,
      avatarUrl,
      matches,
      wins,
      losses,
      avgScore,
      kda,
      winrate,
      updatedAt,
      ranks,
      matchRows,
      matchCount,
      friendCount,
      lang,
    };
  };

  const rankOrder = [
    "unranked",
    "bronze",
    "silver",
    "gold",
    "platinum",
    "diamond",
    "master",
    "ace",
    "punkmaster",
  ];

  const pickBestRank = (ranks) => {
    if (!ranks) return null;
    let best = null;
    Object.entries(ranks).forEach(([season, entry]) => {
      const rank = String(entry?.rank || "unranked").toLowerCase();
      const idx = rankOrder.indexOf(rank);
      if (idx === -1) return;
      if (!best || idx > best.idx) {
        best = { season, rank, idx };
      }
    });
    return best;
  };

  const getMaxKills = (rows = []) =>
    rows.reduce((max, m) => Math.max(max, m.kills || 0), 0);

  const getMaxStreak = (rows = []) => {
    let streak = 0;
    let max = 0;
    for (const m of rows) {
      if (m.result === "victory") {
        streak += 1;
        max = Math.max(max, streak);
      } else if (m.result === "defeat") {
        streak = 0;
      }
    }
    return max;
  };

  const pickBestAchievement = (value, thresholds) => {
    const sorted = [...thresholds].sort((a, b) => a - b);
    let best = null;
    for (const t of sorted) {
      if (value >= t) best = t;
    }
    return best;
  };

  app.get("/share/player/:uid/image.png", statsLimiter, async (req, res) => {
    try {
      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate"
      );
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      const { uid } = req.params;
      logger.info(`SHARE IMAGE request uid=${uid} lang=${req.query.lang || ""}`);
      if (!uid || !isValidUid(uid)) {
        return res.status(400).send("Invalid uid");
      }

      const lang = String(req.query.lang || "").toLowerCase();
      const shareData = await buildShareData(uid, lang);

      const width = 1200;
      const height = 630;
      const {
        name,
        avatarUrl,
        matches,
        avgScore,
        kda,
        winrate,
        ranks,
        matchRows,
        matchCount,
        friendCount,
      } = shareData;

      const labelMatches =
        lang === "en" ? "Matches" : lang === "fr" ? "Matchs" : lang === "de" ? "Matches" : "Матчей";
      const labelWinrate =
        lang === "en"
          ? "Winrate"
          : lang === "fr"
          ? "Taux de victoire"
          : lang === "de"
          ? "Winrate"
          : "Винрейт";

      const escapeSvg = (val) =>
        String(val)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

      let labels =
        lang === "en"
          ? {
              matches: "Matches",
              winrate: "Winrate",
              kda: "KDA",
              avgScore: "Avg score",
              rank: "Rank",
              achievements: "Best achievements",
              achievementsEmpty: "No achievements yet",
              friends: "Friends",
              kills: "Max kills",
              streak: "Win streak",
            }
          : lang === "fr"
          ? {
              matches: "Matchs",
              winrate: "Taux de victoire",
              kda: "KDA",
              avgScore: "Score moyen",
              rank: "Rang",
              achievements: "Meilleurs exploits",
              achievementsEmpty: "Aucun exploit",
              friends: "Amis",
              kills: "Kills max",
              streak: "Série de victoires",
            }
          : lang === "de"
          ? {
              matches: "Matches",
              winrate: "Winrate",
              kda: "KDA",
              avgScore: "Ø-Score",
              rank: "Rang",
              achievements: "Beste Erfolge",
              achievementsEmpty: "Keine Erfolge",
              friends: "Freunde",
              kills: "Max Kills",
              streak: "Siegesserie",
            }
          : {
              matches: "Матчей",
              winrate: "Винрейт",
              kda: "KDA",
              avgScore: "Ср. счёт",
              rank: "Ранг",
              achievements: "Лучшие достижения",
              friends: "Друзья",
              kills: "Макс. убийств",
              streak: "Винстрик",
            };

      if (!["en", "fr", "de"].includes(lang)) {
        labels = {
          matches: "Матчей",
          winrate: "Винрейт",
          kda: "KDA",
          avgScore: "Ср. счёт",
          rank: "Ранг",
          achievements: "Лучшие достижения",
          achievementsEmpty: "Нет достижений",
          friends: "Друзья",
          kills: "Макс. убийств",
          streak: "Винстрик",
        };
      }

      const statsLine = [
        matches !== null ? `${labels.matches}: ${matches}` : null,
        winrate !== null ? `${labels.winrate}: ${winrate}%` : null,
      ]
        .filter(Boolean)
        .join("  •  ");

      const bestRank = pickBestRank(ranks);
      const rankLabel = "";
      const rankImage = `client/public/ranks/${(bestRank?.rank || "unranked").toLowerCase()}.png`;
      const seasons = ["s1", "s2", "s3", "s4"];
      const seasonRanks = seasons.map((season) => ({
        season,
        rank: String(ranks?.[season]?.rank || "unranked").toLowerCase(),
      }));

      const bestMatches = pickBestAchievement(matchCount, [5, 10, 25, 100, 500, 1000]);
      const bestFriends = pickBestAchievement(friendCount, [1, 3, 5, 10]);
      const bestKills = pickBestAchievement(getMaxKills(matchRows), [10, 15, 20, 25]);
      const bestStreak = pickBestAchievement(getMaxStreak(matchRows), [3, 5, 7, 10]);

      const achievements = [
        bestMatches
          ? {
              label: `${labels.matches}: ${bestMatches}`,
              image: `client/public/achievments/uploaded/upl${bestMatches}.png`,
            }
          : null,
        bestFriends
          ? {
              label: `${labels.friends}: ${bestFriends}`,
              image: `client/public/achievments/friends/friend${bestFriends}.png`,
            }
          : null,
        bestKills
          ? {
              label: `${labels.kills}: ${bestKills}`,
              image: `client/public/achievments/kills/kills${bestKills}.png`,
            }
          : null,
        bestStreak
          ? {
              label: `${labels.streak}: ${bestStreak}`,
              image: `client/public/achievments/streak/streak${bestStreak}.png`,
            }
          : null,
      ].filter(Boolean);

      const winrateColor = winrate !== null && winrate >= 50 ? "#35f59a" : "#ff5d5d";
      const kdaValue = kda !== null ? Number(kda.toFixed(2)) : null;
      const avgScoreValue = avgScore !== null ? Math.round(avgScore) : null;
      const achievementsEmpty = achievements.length === 0;

      const statsLineDisplay = [
        matches !== null ? `${labels.matches}: ${matches}` : null,
        winrate !== null ? `${labels.winrate}: ${winrate}%` : null,
      ]
        .filter(Boolean)
        .join("  •  ");

      const winsValue = Number.isFinite(shareData?.wins) ? shareData.wins : null;
      const lossesValue = Number.isFinite(shareData?.losses) ? shareData.losses : null;
      const wlText =
        winsValue !== null || lossesValue !== null
          ? `(${winsValue ?? 0} W / ${lossesValue ?? 0} L)`
          : "";
      const statsLineDisplayClean = [
        matches !== null ? `${labels.matches}: ${matches} ${wlText}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      const svg = `
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stop-color="#0b0f1a"/>
              <stop offset="50%" stop-color="#101a2c"/>
              <stop offset="100%" stop-color="#1b0f2e"/>
            </linearGradient>
            <linearGradient id="accent" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stop-color="#00f5d4"/>
              <stop offset="50%" stop-color="#ff2d95"/>
              <stop offset="100%" stop-color="#ff9a3d"/>
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#bg)"/>
          <rect x="50" y="50" width="1100" height="530" rx="32" fill="rgba(8,12,22,0.75)" stroke="rgba(255,255,255,0.08)"/>
          <rect x="50" y="50" width="1100" height="530" rx="32" fill="none" stroke="url(#accent)" stroke-width="3" opacity="0.6"/>
          <text x="240" y="185" font-size="48" font-weight="800" fill="#f5fbff" font-family="Arial, sans-serif">
            ${escapeSvg(name)}
          </text>
          <text x="240" y="240" font-size="20" fill="rgba(255,255,255,0.7)" font-family="Arial, sans-serif">
            FragPunk Tracker
          </text>
          <text x="240" y="300" font-size="26" font-weight="700" fill="#b6fff2" font-family="Arial, sans-serif">
            <tspan>${escapeSvg(matches !== null ? `${labels.matches}: ${matches} ` : "")}</tspan>
            ${
              winsValue !== null || lossesValue !== null
                ? `<tspan fill="rgba(255,255,255,0.6)">(</tspan><tspan fill="#35f59a">${winsValue ?? 0} W</tspan><tspan fill="rgba(255,255,255,0.6)"> / </tspan><tspan fill="#ff5d5d">${lossesValue ?? 0} L</tspan><tspan fill="rgba(255,255,255,0.6)">)</tspan>`
                : ""
            }
          </text>
          <text x="240" y="355" font-size="24" font-weight="700" fill="${winrateColor}" font-family="Arial, sans-serif">
            ${escapeSvg(winrate !== null ? `${labels.winrate}: ${winrate}%` : "")}
          </text>
          <text x="240" y="405" font-size="22" fill="rgba(255,255,255,0.85)" font-family="Arial, sans-serif">
            ${escapeSvg(kdaValue !== null ? `${labels.kda}: ${kdaValue}` : "")}
          </text>
          <text x="240" y="440" font-size="22" fill="rgba(255,255,255,0.85)" font-family="Arial, sans-serif">
            ${escapeSvg(avgScoreValue !== null ? `${labels.avgScore}: ${avgScoreValue}` : "")}
          </text>
          <text x="220" y="480" font-size="18" fill="rgba(255,255,255,0.6)" font-family="Arial, sans-serif">
            ${escapeSvg(labels.achievements)}
          </text>
          ${
            achievementsEmpty
              ? `<text x="220" y="512" font-size="18" fill="rgba(255,255,255,0.6)" font-family="Arial, sans-serif">${escapeSvg(
                  labels.achievementsEmpty || "No achievements yet"
                )}</text>`
              : ""
          }
        </svg>
      `;

      let base = sharp(Buffer.from(svg)).png();

      let avatarBuffer = null;
      try {
        const avatarRes = await axios.get(avatarUrl, { responseType: "arraybuffer" });
        avatarBuffer = Buffer.from(avatarRes.data);
      } catch (err) {
        logger.warn(`SHARE IMAGE: avatar fetch failed: ${avatarUrl}`);
        avatarBuffer = null;
      }

      const overlays = [];

      if (avatarBuffer) {
        const size = 140;
        const mask = Buffer.from(
          `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${
            size / 2
          }" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
        );
        const avatarPng = await sharp(avatarBuffer)
          .resize(size, size)
          .composite([{ input: mask, blend: "dest-in" }])
          .png()
          .toBuffer();
        overlays.push({ input: avatarPng, left: 90, top: 135 });
      }

      // ranks rendered per season below

      const achievementBaseX = 220;
      const achLabelSize = lang === "fr" ? 16 : 18;
      const achLabelWidth = lang === "fr" ? 140 : 160;
      let achievementOffset = 0;
      for (const achievement of achievements.slice(0, 4)) {
        try {
          const achUri = await getCachedDataUri(achievement.image);
          const achSvg = Buffer.from(
            `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><image href="${achUri}" width="64" height="64"/></svg>`
          );
          overlays.push({
            input: achSvg,
            left: achievementBaseX + achievementOffset,
            top: 500,
          });
          const labelSvg = Buffer.from(
            `<svg width="${achLabelWidth}" height="30" xmlns="http://www.w3.org/2000/svg"><text x="0" y="20" font-size="${achLabelSize}" fill="#d6e4ff" font-family="Arial, sans-serif">${escapeSvg(
              achievement.label
            )}</text></svg>`
          );
          overlays.push({
            input: labelSvg,
            left: achievementBaseX + achievementOffset + 70,
            top: 513,
          });
          achievementOffset += 240;
          logger.info(`SHARE IMAGE: achievement image ok ${achievement.image}`);
        } catch {}
      }

      try {
        let rankOffset = 0;
        for (const item of seasonRanks) {
          const seasonPath = `client/public/ranks/${item.rank}.png`;
          const seasonUri = await getCachedDataUri(seasonPath);
          const seasonSvg = Buffer.from(
            `<svg width="80" height="80" xmlns="http://www.w3.org/2000/svg"><image href="${seasonUri}" width="80" height="80"/></svg>`
          );
          overlays.push({ input: seasonSvg, left: 860 + rankOffset, top: 120 });
          const labelSvg = Buffer.from(
            `<svg width="80" height="20" xmlns="http://www.w3.org/2000/svg"><text x="40" y="16" text-anchor="middle" font-size="14" fill="rgba(255,255,255,0.75)" font-family="Arial, sans-serif">${item.season.toUpperCase()}</text></svg>`
          );
          overlays.push({ input: labelSvg, left: 860 + rankOffset, top: 200 });
          rankOffset += 70;
        }
      } catch {}

      if (overlays.length) {
        base = base.composite(overlays);
      }

      const out = await base.png().toBuffer();
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.status(200).send(out);
    } catch (err) {
      logger.error("SHARE IMAGE ERROR:", err);
      return res.status(500).send("Failed to build share image");
    }
  });

  app.get("/share/player/:uid", statsLimiter, async (req, res) => {
    try {
      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate"
      );
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      const { uid } = req.params;
      if (!uid || !isValidUid(uid)) {
        return res.status(400).send("Invalid uid");
      }

      const lang = String(req.query.lang || "").toLowerCase();
      const shareData = await buildShareData(uid, lang);
      const { name, matches, winrate, updatedAt } = shareData;

      const siteUrlRaw =
        process.env.PUBLIC_SITE_URL ||
        process.env.SITE_URL ||
        process.env.WEB_URL ||
        "";
      const siteUrl = siteUrlRaw.replace(/\/+$/, "");
      const profileUrl = siteUrl ? `${siteUrl}/player/${encodeURIComponent(uid)}` : "";
      const proto = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.get("host");
      const origin = host ? `${proto}://${host}` : "";
      const imageParams = new URLSearchParams();
      if (lang) imageParams.set("lang", lang);
      if (updatedAt) imageParams.set("v", String(updatedAt));
      const imageUrl = origin
        ? `${origin}/share/player/${encodeURIComponent(uid)}/image.png${
            imageParams.toString() ? `?${imageParams.toString()}` : ""
          }`
        : "";

      const escapeHtml = (val) =>
        String(val)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

      const title = `FragPunk Tracker — ${name}`;
      const isEn = lang === "en";
      const isFr = lang === "fr";
      const isDe = lang === "de";
      const shareTitle = `FragPunk Tracker — ${name}`;
      const labelMatchesSafe = isEn ? "Matches" : isFr ? "Matchs" : isDe ? "Matches" : "Матчей";
      const labelWinrateSafe = isEn
        ? "Winrate"
        : isFr
        ? "Taux de victoire"
        : isDe
        ? "Winrate"
        : "Винрейт";
      const labelMatches = isEn ? "Matches" : isFr ? "Matchs" : isDe ? "Matches" : "Матчей";
      const labelWinrate = isEn ? "Winrate" : isFr ? "Taux de victoire" : isDe ? "Winrate" : "Винрейт";
      const statsParts = [];
      if (matches !== null) {
        statsParts.push(`${labelMatchesSafe}: ${matches}`);
      }
      if (winrate !== null) {
        statsParts.push(`${labelWinrateSafe}: ${winrate}%`);
      }
      const statsLine = statsParts.length ? ` ${statsParts.join(" • ")}` : "";
      const descriptionStats = statsParts.length ? ` ${statsParts.join(" • ")}` : "";
      const description = isEn
        ? `Player profile ${name} on FragPunk Tracker.${descriptionStats}`
        : isFr
        ? `Profil du joueur ${name} sur FragPunk Tracker.${descriptionStats}`
        : isDe
        ? `Spielerprofil ${name} auf FragPunk Tracker.${descriptionStats}`
        : `Профиль игрока ${name} на FragPunk Tracker.${statsLine}`;

      const descriptionFinal =
        isEn || isFr || isDe
          ? description
          : `Профиль игрока ${name} на FragPunk Tracker.${descriptionStats}`;
      const profileLinkLabel = isEn
        ? "Open profile"
        : isFr
        ? "Ouvrir le profil"
        : isDe
        ? "Profil öffnen"
        : "Открыть профиль";

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(`<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(shareTitle)}</title>
    <meta property="og:title" content="${escapeHtml(shareTitle)}" />
    <meta property="og:description" content="${escapeHtml(descriptionFinal)}" />
    <meta property="og:type" content="website" />
    ${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}" />` : ""}
    ${imageUrl ? `<meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />` : ""}
    ${imageUrl ? `<meta property="og:image:width" content="1200" />` : ""}
    ${imageUrl ? `<meta property="og:image:height" content="630" />` : ""}
    ${imageUrl ? `<meta property="og:image:type" content="image/png" />` : ""}
    ${profileUrl ? `<meta property="og:url" content="${escapeHtml(profileUrl)}" />` : ""}
    <meta name="twitter:card" content="summary_large_image" />
    ${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />` : ""}
    <meta name="twitter:title" content="${escapeHtml(shareTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(descriptionFinal)}" />
    ${profileUrl ? `<meta http-equiv="refresh" content="0; url=${escapeHtml(profileUrl)}" />` : ""}
  </head>
  <body>
    ${profileUrl ? `<a href="${escapeHtml(profileUrl)}">${escapeHtml(profileLinkLabel)}</a>` : "Profile"}
  </body>
</html>`);
    } catch (err) {
      logger.error("SHARE PROFILE ERROR:", err);
      return res.status(500).send("Failed to build share preview");
    }
  });

  app.get("/player/:uid", statsLimiter, async (req, res) => {
    try {
      const { uid } = req.params;
      if (!uid || !isValidUid(uid)) {
        return res.status(400).json({ error: "Invalid uid" });
      }

      const banSnap = await db.collection("bans").doc(uid).get();
      const ban = banSnap.exists ? banSnap.data() || null : null;

      const limitRaw = parseIntParam(req.query.limit, 200);
      if (limitRaw === null) {
        return res.status(400).json({ error: "Invalid limit" });
      }
      const limit = Math.min(Math.max(limitRaw, 1), 500);

      const matchesRef = db.collection("users").doc(uid).collection("matches");
      const profileSnap = await db.collection("leaderboard_users").doc(uid).get();
      const profileData = profileSnap.exists ? profileSnap.data() : null;
      let settings = profileData?.settings || profileData?.socials || null;
      if (settings && typeof settings === "object" && !Object.keys(settings).length) {
        settings = null;
      }
      if (!settings) {
        const profileDoc = await db
          .collection("users")
          .doc(uid)
          .collection("profile")
          .doc("settings")
          .get();
        settings = profileDoc.exists ? profileDoc.data()?.settings || null : null;
      }
      if (!settings) {
        const legacyDoc = await db
          .collection("users")
          .doc(uid)
          .collection("profile")
          .doc("socials")
          .get();
        settings = legacyDoc.exists ? legacyDoc.data()?.socials || null : null;
      }
      const ranksSnap = await db
        .collection("users")
        .doc(uid)
        .collection("profile")
        .doc("ranks")
        .get();
      const ranks = ranksSnap.exists ? ranksSnap.data() || null : null;
      const snap = await matchesRef.orderBy("createdAt", "asc").limit(limit).get();
      const friendsSnap = await db
        .collection("users")
        .doc(uid)
        .collection("friends")
        .orderBy("createdAt", "asc")
        .limit(10)
        .get();
      const friendDates = friendsSnap.docs
        .map((doc) => {
          const raw = doc.data()?.createdAt || null;
          return raw?.toMillis ? raw.toMillis() : null;
        })
        .filter(Boolean);

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
        avatar: profileData?.avatar || null,
        provider: profileData?.provider || null,
        settings,
        ranks,
        ban,
        friendCount: friendsSnap.size,
        friendDates,
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

      const banSnap = await db.collection("bans").doc(uid).get();
      const ban = banSnap.exists ? banSnap.data() || null : null;

      const snap = await db.collection("leaderboard_users").doc(uid).get();
      const data = snap.exists ? snap.data() || {} : {};

      let settings = data.settings || data.socials || null;
      if (settings && typeof settings === "object" && !Object.keys(settings).length) {
        settings = null;
      }
      if (!settings) {
        const profileSnap = await db
          .collection("users")
          .doc(uid)
          .collection("profile")
          .doc("settings")
          .get();
        settings = profileSnap.exists ? profileSnap.data()?.settings || null : null;
      }
      if (!settings) {
        const legacySnap = await db
          .collection("users")
          .doc(uid)
          .collection("profile")
          .doc("socials")
          .get();
        settings = legacySnap.exists ? legacySnap.data()?.socials || null : null;
      }
      const ranksSnap = await db
        .collection("users")
        .doc(uid)
        .collection("profile")
        .doc("ranks")
        .get();
      const ranks = ranksSnap.exists ? ranksSnap.data() || null : null;

      return res.json({
        uid,
        settings,
        ranks,
        name: data.name || null,
        avatar: data.avatar || null,
        provider: data.provider || null,
        ban,
      });
    } catch (err) {
      logger.error("PROFILE ERROR:", err);
      return res.status(500).json({ error: "Failed to load profile" });
    }
  });

  const handleSettingsSave = async (req, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Missing auth token" });

      const settings = req.body?.settings || {};
      const allowed = ["twitch", "youtube", "tiktok"];
      const updates = {};

      for (const key of allowed) {
        const raw = typeof settings[key] === "string" ? settings[key].trim() : "";
        if (!raw) {
          updates[`settings.${key}`] = admin.firestore.FieldValue.delete();
        } else if (raw.length > 120) {
          return res.status(400).json({ error: `Invalid ${key}` });
        } else {
          updates[`settings.${key}`] = raw;
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
        .doc("settings")
        .set({ settings }, { merge: true });

      return res.json({ ok: true });
    } catch (err) {
      logger.error("SETTINGS UPDATE ERROR:", err);
      return res.status(500).json({ error: "Failed to update settings" });
    }
  };

  app.post("/profile/settings", authLimiter, requireAuth, handleSettingsSave);

  app.post("/profile/socials", authLimiter, requireAuth, (req, res) => {
    req.body = { settings: req.body?.socials || {} };
    return handleSettingsSave(req, res);
  });
}
