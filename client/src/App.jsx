import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import Navbar from "@/components/NavBar/Navbar";
import Footer from "@/components/Footer/Footer";

const UploadTab = lazy(() => import("@/pages/UploadTab/UploadTab"));
const PlayersTab = lazy(() => import("@/pages/PlayersTab/PlayersTab"));
const PlayerProfile = lazy(() => import("@/components/PlayerProfile/PlayerProfile"));
const DiscordCallback = lazy(() => import("@/pages/DiscordCallback"));
const MyProfile = lazy(() => import("@/pages/MyProfile/MyProfile"));
const Admin = lazy(() => import("@/pages/Admin/Admin"));
const Policy = lazy(() => import("@/pages/Policy/Policy"));
const Ads = lazy(() => import("@/pages/Ads/Ads"));
const Settings = lazy(() => import("@/pages/Settings/Settings"));
const Support = lazy(() => import("@/pages/Support/Support"));
const Friends = lazy(() => import("@/pages/Friends/Friends"));
const AchievementsPage = lazy(() => import("@/pages/Achievements/Achievements"));
const Help = lazy(() => import("@/pages/Help/Help"));
const Roadmap = lazy(() => import("@/pages/Roadmap/Roadmap"));
const Tournaments = lazy(() => import("@/pages/TournamentsPage/Tournaments"));
const TournamentDetails = lazy(() => import("@/pages/TournamentDetails/TournamentDetails"));
const TournamentMatch = lazy(() => import("@/pages/TournamentMatch/TournamentMatch"));
const TournamentCreate = lazy(() => import("@/pages/TournamentCreate/TournamentCreate"));
const MyTeams = lazy(() => import("@/pages/MyTeams/MyTeams"));
const MyTeamCreate = lazy(() => import("@/pages/MyTeamCreate/MyTeamCreate"));
const MyTeamDetails = lazy(() => import("@/pages/MyTeamDetails/MyTeamDetails"));
const TeamDetails = lazy(() => import("@/pages/TeamDetails/TeamDetails"));

const SITE_URL = "https://fragpunktracker.fun";
const DEFAULT_IMAGE = `${SITE_URL}/PlayerProfileGuide.png`;
const DEFAULT_TITLE = "FragPunk Tracker - Stats, Teams & Tournaments";
const DEFAULT_DESC =
  "FragPunk Tracker: leaderboard, player profiles, match stats, team management, and tournament brackets for FragPunk.";

function resolveSeo(pathname) {
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

function RouteSeoSync() {
  const location = useLocation();

  useEffect(() => {
    const pathname = location?.pathname || "/";
    const { title, description } = resolveSeo(pathname);
    const canonicalUrl = `${SITE_URL}${pathname}`;
    const isPrivatePath =
      pathname.startsWith("/admin") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/me") ||
      pathname.startsWith("/upload") ||
      pathname.startsWith("/auth/");

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
  }, [location.pathname]);

  return null;
}

export default function App() {
  useEffect(() => {
    const BACKEND_URL =
      import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
    const PING_INTERVAL_MS = 10 * 60 * 1000;

    const isInMskWindow = () => {
      const now = new Date();
      const mskHour = (now.getUTCHours() + 3) % 24;
      return mskHour >= 16 || mskHour < 4;
    };

    const ping = async () => {
      if (!isInMskWindow()) return;
      try {
        await fetch(`${BACKEND_URL}/healthz`, { method: "GET" });
      } catch {
        // ignore keep-alive errors
      }
    };

    ping();
    const id = setInterval(ping, PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <Router>
      <RouteSeoSync />
      <Navbar />
      <main className="app-main">
        <Suspense fallback={<div aria-live="polite">Loading...</div>}>
          <Routes>
            <Route path="/" element={<PlayersTab />} />
            <Route path="/players" element={<PlayersTab />} />
            <Route path="/upload" element={<UploadTab />} />
            <Route path="/player/:id" element={<PlayerProfile />} />
            <Route path="/auth/discord/callback" element={<DiscordCallback />} />
            <Route path="/me" element={<MyProfile />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            <Route path="/achievments" element={<AchievementsPage />} />
            <Route path="/help" element={<Help />} />
            <Route path="/tournaments" element={<Tournaments />} />
            <Route path="/tournaments/create" element={<TournamentCreate />} />
            <Route path="/tournaments/:id" element={<TournamentDetails />} />
            <Route path="/tournaments/:id/matches/:matchId" element={<TournamentMatch />} />
            <Route path="/my-teams" element={<MyTeams />} />
            <Route path="/my-teams/create" element={<MyTeamCreate />} />
            <Route path="/my-teams/:id" element={<MyTeamDetails />} />
            <Route path="/teams/:id" element={<TeamDetails />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/policy" element={<Policy />} />
            <Route path="/support" element={<Support />} />
            <Route path="/ads" element={<Ads />} />
            <Route path="/roadmap" element={<Roadmap />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </Router>
  );
}
