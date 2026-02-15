export function formatDate(ts, fallback = "-") {
  if (!ts) return fallback;
  const d = new Date(ts);
  return d.toLocaleString();
}

export function formatTimeAgo(ts, fallback = "-", locale = "ru") {
  if (!ts) return fallback;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return fallback;

  const diffSec = Math.floor((date.getTime() - Date.now()) / 1000);
  const absSec = Math.abs(diffSec);

  if (absSec < 60) {
    return locale.startsWith("ru") ? "только что" : "just now";
  }

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (absSec < 3600) {
    return rtf.format(Math.round(diffSec / 60), "minute");
  }
  if (absSec < 86400) {
    return rtf.format(Math.round(diffSec / 3600), "hour");
  }
  if (absSec < 86400 * 7) {
    return rtf.format(Math.round(diffSec / 86400), "day");
  }
  if (absSec < 86400 * 30) {
    return rtf.format(Math.round(diffSec / (86400 * 7)), "week");
  }
  if (absSec < 86400 * 365) {
    return rtf.format(Math.round(diffSec / (86400 * 30)), "month");
  }
  return rtf.format(Math.round(diffSec / (86400 * 365)), "year");
}

export function formatRank(rank, t) {
  const key = String(rank || "").toLowerCase();
  if (key === "bronze") return t.me?.rankBronze || "Bronze";
  if (key === "silver") return t.me?.rankSilver || "Silver";
  if (key === "gold") return t.me?.rankGold || "Gold";
  if (key === "platinum") return t.me?.rankPlatinum || "Platinum";
  if (key === "diamond") return t.me?.rankDiamond || "Diamond";
  if (key === "master") return t.me?.rankMaster || "Master";
  if (key === "ace") return t.me?.rankAce || "Ace";
  if (key === "punkmaster") return t.me?.rankPunkmaster || "Punkmaster";
  return rank;
}

export function rankClass(rank) {
  const key = String(rank || "").toLowerCase();
  if (key === "bronze") return "Bronze";
  if (key === "silver") return "Silver";
  if (key === "gold") return "Gold";
  if (key === "platinum") return "Platinum";
  if (key === "diamond") return "Diamond";
  if (key === "master") return "Master";
  if (key === "ace") return "Ace";
  if (key === "punkmaster") return "Punkmaster";
  return "";
}

export function rankIconSrc(rank) {
  const key = String(rank || "unranked").toLowerCase();
  return `/ranks/${key}.png`;
}

export function buildShareUrl(uid, lang, backendUrl) {
  if (!uid) return "";
  const base = `${backendUrl.replace(/\/+$/, "")}/share/player/${encodeURIComponent(uid)}`;
  return lang ? `${base}?lang=${encodeURIComponent(lang)}` : base;
}
