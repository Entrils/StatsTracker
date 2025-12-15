import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import UploadTab from "./components/UploadTab/UploadTab";
import PlayersTab from "./components/PlayersTab/PlayersTab";
import PlayerProfile from "./components/PlayerProfile/PlayerProfile";
import Navbar from "./components/NavBar/Navbar";

export default function App() {
  return (
    <Router>
      <Navbar />
      <Routes>
        <Route path="/" element={<UploadTab />} />
        <Route path="/players" element={<PlayersTab />} />
        <Route path="/player/:id" element={<PlayerProfile />} />
      </Routes>
    </Router>
  );
}
