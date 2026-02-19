import { useCallback, useEffect, useMemo, useState } from "react";
import { fileToOptimizedDataUrl } from "@/shared/tournaments/imageDataUrl";

export default function useMyTeamDetailsController({
  id,
  navigate,
  user,
  tm,
  backendUrl,
}) {
  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [inviteUid, setInviteUid] = useState("");
  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [selectedFriendUid, setSelectedFriendUid] = useState("");
  const [friendSearch, setFriendSearch] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [editAvatarPreview, setEditAvatarPreview] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const row = teamData?.row || null;
  const roster = Array.isArray(teamData?.roster) ? teamData.roster : [];
  const recentTournaments = Array.isArray(teamData?.recentTournaments) ? teamData.recentTournaments : [];
  const matchHistory = Array.isArray(teamData?.matchHistory) ? teamData.matchHistory : [];
  const stats = teamData?.stats || { wins: 0, losses: 0, matchesPlayed: 0, winRate: 0 };

  const slotsLeft = useMemo(() => {
    if (!row) return 0;
    return Math.max(0, Number(row.maxMembers || 0) - Number(row.memberCount || 0));
  }, [row]);

  const inviteableFriends = useMemo(() => {
    const memberSet = new Set(Array.isArray(row?.memberUids) ? row.memberUids : []);
    return friends.filter((f) => {
      const uid = String(f?.uid || "");
      return uid && !memberSet.has(uid);
    });
  }, [friends, row?.memberUids]);

  const filteredInviteableFriends = useMemo(() => {
    const q = String(friendSearch || "").trim().toLowerCase();
    if (!q) return inviteableFriends;
    return inviteableFriends.filter((f) => {
      const name = String(f?.name || "").toLowerCase();
      const uid = String(f?.uid || "").toLowerCase();
      return name.includes(q) || uid.includes(q);
    });
  }, [inviteableFriends, friendSearch]);

  const onLoadTeam = useCallback(async () => {
    if (!user || !id) {
      setTeamData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setNotice("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${backendUrl}/teams/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || tm.loadTeamFailed || "Failed to load team");
      setTeamData(data || null);
    } catch (err) {
      setTeamData(null);
      setNotice(err?.message || tm.loadTeamFailed || "Failed to load team");
    } finally {
      setLoading(false);
    }
  }, [backendUrl, id, tm.loadTeamFailed, user]);

  useEffect(() => {
    onLoadTeam();
  }, [onLoadTeam]);

  useEffect(() => {
    const onLoadFriends = async () => {
      if (!user) {
        setFriends([]);
        return;
      }
      setFriendsLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${backendUrl}/friends/list?view=compact`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
        setFriends(Array.isArray(data?.rows) ? data.rows : []);
      } catch {
        setFriends([]);
      } finally {
        setFriendsLoading(false);
      }
    };
    onLoadFriends();
  }, [user, backendUrl]);

  const onInviteByUid = async (targetUid) => {
    if (!user || !row?.id) return;
    setNotice("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${backendUrl}/teams/${row.id}/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid: targetUid }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || tm.inviteFailed || "Failed to invite player");
      setNotice(tm.inviteSent || "Invite sent");
      setInviteUid("");
      setSelectedFriendUid("");
      onLoadTeam();
    } catch (err) {
      setNotice(err?.message || tm.inviteFailed || "Failed to invite player");
    }
  };

  const onInvite = async () => {
    const targetUid = String(inviteUid || "").trim();
    if (!targetUid) {
      setNotice(tm?.placeholders?.playerUid || "Player UID");
      return;
    }
    await onInviteByUid(targetUid);
  };

  const onInviteFriend = async (uid = "") => {
    const targetUid = String(uid || selectedFriendUid || "").trim();
    if (!targetUid) return;
    await onInviteByUid(targetUid);
  };

  const onDeleteTeam = async () => {
    if (!user || !row?.id) return;
    if (!window.confirm(tm.confirmDelete || "Delete team?")) return;
    setNotice("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${backendUrl}/teams/${row.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || tm.deleteFailed || "Failed to delete team");
      navigate("/my-teams");
    } catch (err) {
      setNotice(err?.message || tm.deleteFailed || "Failed to delete team");
    }
  };

  const onStartEdit = () => {
    if (!row) return;
    setEditName(String(row.name || ""));
    setEditAvatarUrl(String(row.avatarUrl || ""));
    setEditAvatarPreview(String(row.avatarUrl || ""));
    setIsEditing(true);
  };

  const onCancelEdit = () => {
    setIsEditing(false);
    setSavingEdit(false);
  };

  const onEditAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToOptimizedDataUrl(file, {
        maxLength: 850_000,
        maxSide: 768,
        minSide: 256,
        tooLargeMessage: tm.avatarTooLarge || "Team avatar is too large. Use a smaller image.",
      });
      setEditAvatarUrl(dataUrl);
      setEditAvatarPreview(dataUrl);
      setNotice("");
    } catch (err) {
      setNotice(err?.message || tm.avatarUploadFailed || "Failed to upload avatar");
    }
  };

  const onSaveEdit = async () => {
    if (!user || !row?.id) return;
    const safeName = String(editName || "").trim();
    if (!safeName) {
      setNotice(tm?.placeholders?.teamName || "Team name");
      return;
    }
    setSavingEdit(true);
    setNotice("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${backendUrl}/teams/${row.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: safeName,
          avatarUrl: editAvatarUrl || "",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || tm.updateFailed || "Failed to update team");
      setIsEditing(false);
      await onLoadTeam();
    } catch (err) {
      setNotice(err?.message || tm.updateFailed || "Failed to update team");
    } finally {
      setSavingEdit(false);
    }
  };

  const onLeaveTeam = async () => {
    if (!user || !row?.id) return;
    if (!window.confirm(tm.confirmLeave || "Leave team?")) return;
    setNotice("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${backendUrl}/teams/${row.id}/leave`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || tm.leaveFailed || "Failed to leave team");
      navigate("/my-teams");
    } catch (err) {
      setNotice(err?.message || tm.leaveFailed || "Failed to leave team");
    }
  };

  const onKickMember = async (targetUid) => {
    if (!user || !row?.id || !targetUid) return;
    if (!window.confirm(tm.confirmKick || "Kick player from team?")) return;
    setNotice("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${backendUrl}/teams/${row.id}/kick`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid: targetUid }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || tm.kickFailed || "Failed to kick player");
      setNotice(tm.kickSuccess || "Player removed");
      await onLoadTeam();
    } catch (err) {
      setNotice(err?.message || tm.kickFailed || "Failed to kick player");
    }
  };

  const onTransferCaptain = async (targetUid) => {
    if (!user || !row?.id || !targetUid) return;
    if (!window.confirm(tm.confirmTransferCaptain || "Transfer captain role to this player?")) return;
    setNotice("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${backendUrl}/teams/${row.id}/transfer-captain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid: targetUid }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || tm.transferCaptainFailed || "Failed to transfer captain role");
      setNotice(tm.transferCaptainSuccess || "Captain role transferred");
      await onLoadTeam();
    } catch (err) {
      setNotice(err?.message || tm.transferCaptainFailed || "Failed to transfer captain role");
    }
  };

  return {
    loading,
    notice,
    row,
    roster,
    recentTournaments,
    matchHistory,
    stats,
    slotsLeft,
    inviteUid,
    setInviteUid,
    friendsLoading,
    selectedFriendUid,
    setSelectedFriendUid,
    friendSearch,
    setFriendSearch,
    inviteableFriends,
    filteredInviteableFriends,
    isEditing,
    editName,
    setEditName,
    editAvatarPreview,
    savingEdit,
    onInvite,
    onInviteFriend,
    onDeleteTeam,
    onStartEdit,
    onCancelEdit,
    onEditAvatarChange,
    onSaveEdit,
    onLeaveTeam,
    onKickMember,
    onTransferCaptain,
  };
}

