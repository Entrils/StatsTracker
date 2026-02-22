import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSoloFormat, teamSizeByFormat } from "@/shared/tournaments/teamUtils";

function deriveTournamentStatus(row, now = Date.now()) {
  const startsAt = Number(row?.startsAt || 0);
  const endsAt = Number(row?.endsAt || 0);
  const champion = row?.champion ?? null;
  if (champion) return "past";
  if (Number.isFinite(endsAt) && endsAt > 0 && now >= endsAt) return "past";
  if (Number.isFinite(startsAt) && startsAt > 0 && now < startsAt) return "upcoming";
  if (Number.isFinite(startsAt) && startsAt > 0 && now >= startsAt) return "ongoing";
  return "upcoming";
}

export default function useTournamentsController({
  user,
  tt,
  backendUrl,
}) {
  const cacheKeyForStatus = (status) => `tournaments-cache:${status}`;
  const tabs = useMemo(
    () => [
      { key: "upcoming", label: tt?.tabs?.upcoming || "Upcoming" },
      { key: "ongoing", label: tt?.tabs?.ongoing || "Ongoing" },
      { key: "past", label: tt?.tabs?.past || "Finished" },
    ],
    [tt?.tabs?.ongoing, tt?.tabs?.past, tt?.tabs?.upcoming]
  );

  const [tab, setTab] = useState("upcoming");
  const [rows, setRows] = useState([]);
  const [teams, setTeams] = useState([]);
  const [selfStats, setSelfStats] = useState({ elo: 0, matches: 0, fragpunkId: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [registeringId, setRegisteringId] = useState("");
  const [teamSelectByTournament, setTeamSelectByTournament] = useState({});
  const [participatingByTournament, setParticipatingByTournament] = useState({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const tournamentsRequestRef = useRef({ id: 0, controller: null });
  const registrationContextRef = useRef({ uid: "", loaded: false });

  const tabLabel = useMemo(
    () => tabs.find((row) => row.key === tab)?.label || tabs[0].label,
    [tab, tabs]
  );

  const loadTournaments = useCallback(
    async (status) => {
      const requestId = tournamentsRequestRef.current.id + 1;
      tournamentsRequestRef.current.id = requestId;
      tournamentsRequestRef.current.controller?.abort();
      const controller = new AbortController();
      tournamentsRequestRef.current.controller = controller;

      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${backendUrl}/tournaments?status=${status}&limit=30`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (res.status === 304) {
          let cachedRows = [];
          try {
            const raw = localStorage.getItem(cacheKeyForStatus(status));
            cachedRows = raw ? JSON.parse(raw) : [];
          } catch {
            cachedRows = [];
          }
          if (tournamentsRequestRef.current.id !== requestId) return;
          const safeRows = (Array.isArray(cachedRows) ? cachedRows : []).filter(
            (row) => deriveTournamentStatus(row) === status
          );
          setRows(safeRows);
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          const message = String(data?.error || "Failed to load tournaments");
          const error = new Error(message);
          error.status = res.status;
          throw error;
        }
        const data = await res.json();
        if (tournamentsRequestRef.current.id !== requestId) return;
        const safeRows = (Array.isArray(data?.rows) ? data.rows : []).filter(
          (row) => deriveTournamentStatus(row) === status
        );
        setRows(safeRows);
        try {
          localStorage.setItem(cacheKeyForStatus(status), JSON.stringify(safeRows));
        } catch {
          // ignore cache write errors
        }
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (tournamentsRequestRef.current.id !== requestId) return;
        let cachedRows = [];
        try {
          const raw = localStorage.getItem(cacheKeyForStatus(status));
          cachedRows = raw ? JSON.parse(raw) : [];
        } catch {
          cachedRows = [];
        }
        const safeRows = (Array.isArray(cachedRows) ? cachedRows : []).filter(
          (row) => deriveTournamentStatus(row) === status
        );
        setRows(safeRows);
        setError(err?.message || "Failed to load tournaments");
      } finally {
        const isLatestRequest = tournamentsRequestRef.current.id === requestId;
        if (isLatestRequest) {
          setLoading(false);
        }
      }
    },
    [backendUrl]
  );

  useEffect(() => {
    loadTournaments(tab);
  }, [loadTournaments, tab]);

  useEffect(() => {
    const requestState = tournamentsRequestRef.current;
    return () => {
      requestState.controller?.abort();
    };
  }, []);

  useEffect(() => {
    const uid = String(user?.uid || "");
    if (!uid) {
      registrationContextRef.current = { uid: "", loaded: false };
      setTeams([]);
      setSelfStats({ elo: 0, matches: 0, fragpunkId: "" });
      setParticipatingByTournament({});
      return;
    }
    if (tab !== "upcoming") return;
    if (
      registrationContextRef.current.loaded &&
      registrationContextRef.current.uid === uid
    ) {
      return;
    }

    let alive = true;
    const loadRegistrationContext = async () => {
      try {
        const token = await user.getIdToken();
        const contextRes = await fetch(`${backendUrl}/tournaments/context/my`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const contextData = await contextRes.json().catch(() => null);
        if (!alive) return;
        if (!contextRes.ok) throw new Error(contextData?.error || "Failed to load tournaments context");

        setTeams(Array.isArray(contextData?.teams) ? contextData.teams : []);
        const fragpunkId = String(contextData?.selfStats?.fragpunkId || "").trim();
        setSelfStats({
          elo: Number.isFinite(Number(contextData?.selfStats?.elo))
            ? Number(contextData.selfStats.elo)
            : 0,
          matches: Number.isFinite(Number(contextData?.selfStats?.matches))
            ? Number(contextData.selfStats.matches)
            : 0,
          fragpunkId,
        });
        const ids = Array.isArray(contextData?.tournamentIds) ? contextData.tournamentIds : [];
        const next = {};
        ids.forEach((id) => {
          next[id] = true;
        });
        setParticipatingByTournament(next);
        registrationContextRef.current = { uid, loaded: true };
      } catch {
        if (!alive) return;
        setTeams([]);
        setSelfStats({ elo: 0, matches: 0, fragpunkId: "" });
        setParticipatingByTournament({});
      }
    };

    loadRegistrationContext();
    return () => {
      alive = false;
    };
  }, [backendUrl, tab, user]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const onRegisterTeam = async (tournament) => {
    if (!user) {
      setNotice(tt.loginRequired || "Login required to register");
      return;
    }
    const solo = isSoloFormat(tournament?.teamFormat);
    const selectedTeamId = teamSelectByTournament[tournament.id];
    if (!solo && !selectedTeamId) {
      setNotice(tt.selectTeam || "Select a team");
      return;
    }
    setRegisteringId(tournament.id);
    setNotice("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${backendUrl}/tournaments/${tournament.id}/register-team`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(solo ? {} : { teamId: selectedTeamId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to register team");
      setNotice(data?.alreadyRegistered ? tt.registered || "You are participating" : tt.register || "Registration");
      setParticipatingByTournament((prev) => ({ ...prev, [tournament.id]: true }));
      loadTournaments(tab);
    } catch (err) {
      setNotice(err?.message || "Registration error");
    } finally {
      setRegisteringId("");
    }
  };

  const availableTeamsForTournament = (tournament) =>
    teams.filter(
      (team) =>
        team.isCaptain &&
        String(team.teamFormat || "") === String(tournament?.teamFormat || "") &&
        team.memberCount >= teamSizeByFormat(tournament.teamFormat) &&
        team.memberCount <= teamSizeByFormat(tournament.teamFormat) + 1
    );

  const requirementState = (tournament) => {
    const reqMinElo = Number(tournament?.requirements?.minElo || 0);
    const reqMinMatches = Number(tournament?.requirements?.minMatches || 0);
    const solo = isSoloFormat(tournament?.teamFormat);
    const compare = (value, required) => Number(value) >= Number(required);

    if (solo) {
      const eloOk = compare(selfStats.elo, reqMinElo);
      const matchesOk = compare(selfStats.matches, reqMinMatches);
      const fragpunkOk = Boolean(String(selfStats.fragpunkId || "").trim());
      return { eloOk, matchesOk, fragpunkOk };
    }

    const eligibleTeam = availableTeamsForTournament(tournament).find((team) => {
      const stats = Array.isArray(team?.membersStats) ? team.membersStats : [];
      if (!stats.length) return false;
      return stats.every(
        (member) =>
          compare(member?.elo || 0, reqMinElo) &&
          compare(member?.matches || 0, reqMinMatches) &&
          Boolean(String(member?.fragpunkId || "").trim())
      );
    });
    if (eligibleTeam) return { eloOk: true, matchesOk: true, fragpunkOk: true };
    return { eloOk: false, matchesOk: false, fragpunkOk: false };
  };

  return {
    tabs,
    tab,
    setTab,
    tabLabel,
    rows,
    loading,
    error,
    notice,
    user,
    registeringId,
    teamSelectByTournament,
    participatingByTournament,
    nowMs,
    availableTeamsForTournament,
    requirementState,
    setTeamSelectByTournament,
    onRegisterTeam,
  };
}


