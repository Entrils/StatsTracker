import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import Navbar from "@/components/NavBar/Navbar";
import Footer from "@/components/Footer/Footer";
import { applyRouteSeo } from "@/seo/routeSeo";

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

function RouteSeoSync() {
  const location = useLocation();

  useEffect(() => {
    applyRouteSeo(location?.pathname || "/");
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
