import { useCallback, useEffect, useState } from "react";

export default function useMyTeamsController({ user, tm, backendUrl }) {
  const [teams, setTeams] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const loadTeamsAndInvites = useCallback(async () => {
    if (!user) {
      setTeams([]);
      setInvites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const [teamsRes, invitesRes] = await Promise.all([
        fetch(`${backendUrl}/teams/my`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${backendUrl}/teams/invites/my`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const [teamsData, invitesData] = await Promise.all([
        teamsRes.json().catch(() => null),
        invitesRes.json().catch(() => null),
      ]);
      setTeams(Array.isArray(teamsData?.rows) ? teamsData.rows : []);
      setInvites(Array.isArray(invitesData?.rows) ? invitesData.rows : []);
    } catch {
      setTeams([]);
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, user]);

  useEffect(() => {
    loadTeamsAndInvites();
  }, [loadTeamsAndInvites]);

  const onInviteDecision = async (teamId, accept) => {
    if (!user) return;
    setNotice("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `${backendUrl}/teams/${teamId}/invites/${user.uid}/${accept ? "accept" : "reject"}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || tm.inviteDecisionFailed || "Failed to process invite");
      setNotice(accept ? tm.accept : tm.reject);
      loadTeamsAndInvites();
    } catch (err) {
      setNotice(err?.message || tm.inviteDecisionFailed || "Failed to process invite");
    }
  };

  const onLeaveTeam = async (teamId) => {
    if (!user || !teamId) return;
    if (!window.confirm(tm.confirmLeave || "Leave team?")) return;
    setNotice("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${backendUrl}/teams/${teamId}/leave`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || tm.leaveFailed || "Failed to leave team");
      setNotice(tm.leaveTeam || "Leave team");
      loadTeamsAndInvites();
    } catch (err) {
      setNotice(err?.message || tm.leaveFailed || "Failed to leave team");
    }
  };

  return {
    teams,
    invites,
    loading,
    notice,
    onInviteDecision,
    onLeaveTeam,
  };
}
