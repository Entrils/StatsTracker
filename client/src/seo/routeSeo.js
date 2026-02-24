const SITE_URL = "https://fragpunktracker.fun";
const DEFAULT_IMAGE = `${SITE_URL}/PlayerProfileGuide.png`;
const DEFAULT_TITLE = "FragPunk Tracker - Stats, Teams & Tournaments";
const DEFAULT_DESC =
  "FragPunk Tracker: leaderboard, player profiles, match stats, team management, and tournament brackets for FragPunk.";

export function resolveSeo(pathname) {
  const path = String(pathname || "/");

  if (path === "/" || path === "/players") {
    return {
      title: "FragPunk Leaderboard - Players, ELO & Match Stats",
      description:
        "Live FragPunk leaderboard with player ELO, winrate, KDA, and match performance.",
    };
  }
  if (path.startsWith("/player/")) {
    return {
      title: "FragPunk Player Profile - Stats & Match History",
      description:
        "View FragPunk player profile, recent match history, verified ranks, and performance trends.",
    };
  }
  if (path.startsWith("/tournaments")) {
    return {
      title: "FragPunk Tournaments - Brackets, Matches & Teams",
      description:
        "Browse FragPunk tournaments, follow brackets, open match rooms, and track tournament progress.",
    };
  }
  if (path.startsWith("/my-teams") || path.startsWith("/teams/")) {
    return {
      title: "FragPunk Teams - Roster, Invites & Roles",
      description:
        "Manage FragPunk teams: roster format, captain controls, invites, and tournament-ready lineup.",
    };
  }
  if (path === "/help") {
    return {
      title: "FragPunk Tracker Help - Teams, Tournaments, Upload",
      description:
        "Step-by-step help for screenshot upload, teams, tournaments, and match result workflow.",
    };
  }
  return { title: DEFAULT_TITLE, description: DEFAULT_DESC };
}

function upsertNamedMeta(name, value) {
  if (!value) return;
  let node = document.head.querySelector(`meta[name="${name}"]`);
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute("name", name);
    document.head.appendChild(node);
  }
  node.setAttribute("content", value);
}

function upsertPropertyMeta(property, value) {
  if (!value) return;
  let node = document.head.querySelector(`meta[property="${property}"]`);
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute("property", property);
    document.head.appendChild(node);
  }
  node.setAttribute("content", value);
}

function upsertCanonical(url) {
  let node = document.head.querySelector('link[rel="canonical"]');
  if (!node) {
    node = document.createElement("link");
    node.setAttribute("rel", "canonical");
    document.head.appendChild(node);
  }
  node.setAttribute("href", url);
}

export function applyRouteSeo(pathname) {
  const safePath = String(pathname || "/");
  const { title, description } = resolveSeo(safePath);
  const canonicalUrl = `${SITE_URL}${safePath}`;
  const isPrivatePath =
    safePath.startsWith("/admin") ||
    safePath.startsWith("/settings") ||
    safePath.startsWith("/me") ||
    safePath.startsWith("/upload") ||
    safePath.startsWith("/auth/");

  document.title = title || DEFAULT_TITLE;
  upsertCanonical(canonicalUrl);
  upsertNamedMeta("description", description || DEFAULT_DESC);
  upsertNamedMeta(
    "robots",
    isPrivatePath
      ? "noindex, nofollow, noarchive"
      : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
  );
  upsertPropertyMeta("og:title", title || DEFAULT_TITLE);
  upsertPropertyMeta("og:description", description || DEFAULT_DESC);
  upsertPropertyMeta("og:url", canonicalUrl);
  upsertPropertyMeta("og:image", DEFAULT_IMAGE);
  upsertNamedMeta("twitter:title", title || DEFAULT_TITLE);
  upsertNamedMeta("twitter:description", description || DEFAULT_DESC);
  upsertNamedMeta("twitter:image", DEFAULT_IMAGE);
  upsertNamedMeta("twitter:card", "summary_large_image");
}
