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

export default function App() {
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
          <Route path="/settings" element={<Settings />} />
          <Route path="/policy" element={<Policy />} />
          <Route path="/support" element={<Support />} />
          <Route path="/ads" element={<Ads />} />
        </Routes>
      </main>
      <Footer />
    </Router>
  );
}
