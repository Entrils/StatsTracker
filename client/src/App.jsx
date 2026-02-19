import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import UploadTab from "@/pages/UploadTab/UploadTab";
import PlayersTab from "@/pages/PlayersTab/PlayersTab";
import PlayerProfile from "@/components/PlayerProfile/PlayerProfile";
import Navbar from "@/components/NavBar/Navbar";
import Footer from "@/components/Footer/Footer";
import DiscordCallback from "@/pages/DiscordCallback";
import MyProfile from "@/pages/MyProfile/MyProfile";
import Admin from "@/pages/Admin/Admin";
import Policy from "@/pages/Policy/Policy";
import Ads from "@/pages/Ads/Ads";
import Settings from "@/pages/Settings/Settings";
import Support from "@/pages/Support/Support";
import Friends from "@/pages/Friends/Friends";
import AchievementsPage from "@/pages/Achievements/Achievements";
import Help from "@/pages/Help/Help";
import Roadmap from "@/pages/Roadmap/Roadmap";
import Tournaments from "@/pages/TournamentsPage/Tournaments";
import TournamentDetails from "@/pages/TournamentDetails/TournamentDetails";
import TournamentMatch from "@/pages/TournamentMatch/TournamentMatch";
import TournamentCreate from "@/pages/TournamentCreate/TournamentCreate";
import MyTeams from "@/pages/MyTeams/MyTeams";
import MyTeamCreate from "@/pages/MyTeamCreate/MyTeamCreate";
import MyTeamDetails from "@/pages/MyTeamDetails/MyTeamDetails";
import TeamDetails from "@/pages/TeamDetails/TeamDetails";

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
      <Navbar />
      <main className="app-main">
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
      </main>
      <Footer />
    </Router>
  );
}
