import { useState } from "react";
import { fileToOptimizedDataUrl } from "@/shared/tournaments/imageDataUrl";

export default function useMyTeamCreateForm({ user, tm, backendUrl, navigate }) {
  const [teamName, setTeamName] = useState("");
  const [teamMaxMembers, setTeamMaxMembers] = useState(5);
  const [teamCountry, setTeamCountry] = useState("");
  const [teamAvatarUrl, setTeamAvatarUrl] = useState("");
  const [teamAvatarPreview, setTeamAvatarPreview] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [notice, setNotice] = useState("");

  const onCreateTeam = async (e) => {
    e.preventDefault();
    if (!user) {
      setNotice(tm.loginRequired || "Login required");
      return;
    }
    const name = teamName.trim();
    if (!name) {
      setNotice(tm?.placeholders?.teamName || "Team name");
      return;
    }
    setCreatingTeam(true);
    setNotice("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${backendUrl}/teams`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          maxMembers: Number(teamMaxMembers) || 5,
          avatarUrl: teamAvatarUrl || "",
          country: teamCountry || "",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || tm.createFailed || "Failed to create team");
      navigate("/my-teams");
    } catch (err) {
      setNotice(err?.message || tm.createFailed || "Failed to create team");
    } finally {
      setCreatingTeam(false);
    }
  };

  const onAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setTeamAvatarUrl("");
      setTeamAvatarPreview("");
      return;
    }
    try {
      const dataUrl = await fileToOptimizedDataUrl(file, {
        maxLength: 850_000,
        maxSide: 768,
        minSide: 256,
        tooLargeMessage: tm.avatarTooLarge || "Team avatar is too large. Use a smaller image.",
      });
      setTeamAvatarUrl(dataUrl);
      setTeamAvatarPreview(dataUrl);
      setNotice("");
    } catch (err) {
      setNotice(err?.message || tm.avatarUploadFailed || "Failed to upload avatar");
    }
  };

  return {
    teamName,
    setTeamName,
    teamMaxMembers,
    setTeamMaxMembers,
    teamCountry,
    setTeamCountry,
    teamAvatarPreview,
    creatingTeam,
    notice,
    setNotice,
    onCreateTeam,
    onAvatarChange,
  };
}

