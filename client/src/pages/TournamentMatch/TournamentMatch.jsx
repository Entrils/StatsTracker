import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import styles from "./TournamentMatch.module.css";
import { useAuth } from "@/auth/AuthContext";
import { useLang } from "@/i18n/LanguageContext";
import StateMessage from "@/components/StateMessage/StateMessage";
import PageState from "@/components/StateMessage/PageState";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
const EMPTY_OBJECT = Object.freeze({});
const EMPTY_ARRAY = Object.freeze([]);

function formatCountdown(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "00:00";
  const totalSec = Math.floor(value / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatMatchDate(ms, lang = "en") {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(lang, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatChatTime(ms, lang = "en") {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "--:--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString(lang, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapImageSrc(mapName) {
  const key = String(mapName || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_-]/g, "");
  return `/maps/${key}.png`;
}

function resolveSoloPlayer(side = {}, fallbackName = "Player") {
  const members = Array.isArray(side?.members) ? side.members : [];
  const captain = members.find((m) => String(m?.role || "") === "captain");
  const first = captain || members[0] || null;
  if (first) return first;
  return {
    uid: String(side?.teamId || "solo"),
    name: String(side?.teamName || fallbackName),
    avatarUrl: String(side?.avatarUrl || ""),
    elo: Number(side?.avgElo || 0),
    fragpunkId: "",
  };
}

function entityHrefFromSide(side, isSolo) {
  const id = String(side?.teamId || "").trim();
  if (!id) return "";
  return isSolo ? `/player/${encodeURIComponent(id)}` : `/teams/${encodeURIComponent(id)}`;
}

function TeamLineup({ side, fallbackTeamName = "Team", eloLabel = "ELO", entityHref = "" }) {
  const title = side?.teamName || fallbackTeamName;
  const members = Array.isArray(side?.members) ? side.members : [];
  return (
    <section className={styles.sidePanel}>
      <div className={styles.sideHeader}>
        <img
          src={side?.avatarUrl || "/nologoteam.png"}
          alt={title}
          className={styles.teamAvatar}
        />
        {entityHref ? (
          <Link className={styles.entityLink} to={entityHref}>
            <h2 className={styles.teamName}>{title}</h2>
          </Link>
        ) : (
          <h2 className={styles.teamName}>{title}</h2>
        )}
      </div>
      <div className={styles.membersList}>
        {members.map((m) => (
          <div key={m.uid} className={styles.memberRow}>
            <img src={m.avatarUrl || "/nologoteam.png"} alt={m.name} className={styles.memberAvatar} />
            <div className={styles.memberText}>
              <span className={styles.memberName}>{m.name || "-"}</span>
              {m.role === "captain" ? (
                <span className={styles.memberFragId}>FragPunk ID: {m.fragpunkId || "-"}</span>
              ) : null}
              <span className={styles.memberElo}>{eloLabel} {Number(m.elo || 0)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SoloPlayerCard({ player, fallbackName = "Player", eloLabel = "ELO", entityHref = "" }) {
  const name = String(player?.name || fallbackName);
  const avatar = String(player?.avatarUrl || "");
  const elo = Number(player?.elo || 0);
  const fragpunkId = String(player?.fragpunkId || "").trim();
  return (
    <section className={styles.sidePanel}>
      <div className={styles.sideHeader}>
        <img src={avatar || "/nologoteam.png"} alt={name} className={styles.teamAvatar} />
        {entityHref ? (
          <Link className={styles.entityLink} to={entityHref}>
            <h2 className={styles.teamName}>{name}</h2>
          </Link>
        ) : (
          <h2 className={styles.teamName}>{name}</h2>
        )}
        <p className={styles.soloElo}>{eloLabel} {elo}</p>
        <p className={styles.soloFragId}>FragPunk ID: {fragpunkId || "-"}</p>
      </div>
    </section>
  );
}

export default function TournamentMatchPage() {
  const { id, matchId } = useParams();
  const { user, claims } = useAuth();
  const { t, lang } = useLang();

  const td = t?.tournaments?.details || EMPTY_OBJECT;
  const tm = td?.match || EMPTY_OBJECT;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [payload, setPayload] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [submittingMap, setSubmittingMap] = useState("");
  const [submittingReady, setSubmittingReady] = useState(false);
  const [failedMapImages, setFailedMapImages] = useState(() => new Set());
  const [isPageVisible, setIsPageVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible"
  );
  const [chatRows, setChatRows] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatAccessDenied, setChatAccessDenied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const lastChatCountRef = useRef(0);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!id || !matchId) return;
    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const res = await fetch(`${BACKEND_URL}/tournaments/${id}/matches/${matchId}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || tm.loadFailed || "Failed to load match");
      setPayload(data || null);
    } catch (err) {
      if (!silent) {
        setPayload(null);
        setError(err?.message || tm.loadFailed || "Failed to load match");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id, matchId, tm]);

  useEffect(() => {
    load();
  }, [load]);

  const loadChat = useCallback(async ({ silent = false } = {}) => {
    if (!id || !matchId || !user) return;
    if (!silent) {
      setChatLoading(true);
      setChatError("");
    }
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/tournaments/${id}/matches/${matchId}/chat?limit=60`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 403) {
          setChatAccessDenied(true);
          setChatRows([]);
          return;
        }
        throw new Error(data?.error || "Failed to load chat");
      }
      setChatAccessDenied(false);
      setChatRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err) {
      if (!silent) {
        setChatError(err?.message || "Failed to load chat");
      }
    } finally {
      if (!silent) setChatLoading(false);
    }
  }, [id, matchId, user]);

  useEffect(() => {
    if (!user) {
      setChatRows([]);
      setChatError("");
      setChatAccessDenied(false);
      setChatOpen(false);
      setChatUnread(0);
      lastChatCountRef.current = 0;
      return;
    }
    loadChat();
  }, [user, loadChat]);

  useEffect(() => {
    if (!user || !chatOpen || chatAccessDenied) return;
    loadChat();
  }, [user, chatOpen, chatAccessDenied, loadChat]);

  useEffect(() => {
    const count = Array.isArray(chatRows) ? chatRows.length : 0;
    const prev = Number(lastChatCountRef.current || 0);
    if (count > prev && !chatOpen) {
      setChatUnread((v) => v + (count - prev));
    }
    if (chatOpen) setChatUnread(0);
    lastChatCountRef.current = count;
  }, [chatRows, chatOpen]);

  const isMatchCompleted = String(payload?.match?.status || "") === "completed";

  useEffect(() => {
    if (!isMatchCompleted) return;
    setChatOpen(false);
    setChatUnread(0);
  }, [isMatchCompleted]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const onVisibilityChange = () => {
      setIsPageVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const shouldPollMatch = (() => {
    if (!isPageVisible || isMatchCompleted) return false;
    const m = payload?.match || null;
    if (!m) return true;
    const readyStatus = String(m?.readyCheck?.status || "");
    const vetoStatus = String(m?.veto?.status || "");
    if (["in_progress", "ready_countdown", "ready"].includes(readyStatus)) return true;
    if (vetoStatus && vetoStatus !== "done") return true;
    return false;
  })();

  useEffect(() => {
    if (!shouldPollMatch) return undefined;
    const timer = window.setInterval(() => {
      load({ silent: true });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [load, shouldPollMatch]);

  useEffect(() => {
    if (!user || !chatOpen || !isPageVisible || chatAccessDenied) return undefined;
    const timer = window.setInterval(() => {
      loadChat({ silent: true });
    }, 20000);
    return () => window.clearInterval(timer);
  }, [user, chatOpen, isPageVisible, chatAccessDenied, loadChat]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const match = payload?.match || null;
  const tournament = payload?.tournament || null;
  const isSolo = String(tournament?.teamFormat || "") === "1x1";
  const teamA = match?.teamA || EMPTY_OBJECT;
  const teamB = match?.teamB || EMPTY_OBJECT;
  const soloA = resolveSoloPlayer(teamA, tm.playerA || "Player A");
  const soloB = resolveSoloPlayer(teamB, tm.playerB || "Player B");
  const sideAHref = entityHrefFromSide(teamA, isSolo);
  const sideBHref = entityHrefFromSide(teamB, isSolo);
  const chatAuthorNames = useMemo(() => {
    const out = new Map();
    const addMember = (member) => {
      const uid = String(member?.uid || "").trim();
      const name = String(member?.name || "").trim();
      if (!uid || !name) return;
      out.set(uid, name);
    };
    (Array.isArray(teamA?.members) ? teamA.members : []).forEach(addMember);
    (Array.isArray(teamB?.members) ? teamB.members : []).forEach(addMember);
    addMember(soloA);
    addMember(soloB);
    return out;
  }, [teamA, teamB, soloA, soloB]);
  const scheduledAt = Number(match?.scheduledAt || 0);
  const hasSchedule = Number.isFinite(scheduledAt) && scheduledAt > 0;
  const startsIn = hasSchedule ? scheduledAt - nowMs : 0;
  const hasStarted = !hasSchedule || startsIn <= 0;

  const isCaptainA = Boolean(user?.uid) && String(user.uid) === String(teamA?.captainUid || "");
  const isCaptainB = Boolean(user?.uid) && String(user.uid) === String(teamB?.captainUid || "");
  const myTeamId = isCaptainA ? teamA.teamId : isCaptainB ? teamB.teamId : "";
  const isCaptain = isCaptainA || isCaptainB;
  const isAdmin = claims?.admin === true || claims?.role === "admin";
  const isOperator = isCaptain || isAdmin;

  const veto = match?.veto || null;
  const readyCheck = match?.readyCheck || null;
  const mapPool = Array.isArray(tournament?.mapPool) && tournament.mapPool.length
    ? tournament.mapPool
    : ["Yggdrasil", "Naos", "Dongtian", "Blackmarket", "Akhet", "Outpost", "Tundra", "Itzamna", "Caesarea", "Tulix"];
  const bestOfValue = [1, 3, 5].includes(Number(match?.bestOf)) ? Number(match.bestOf) : 1;
  const availableMaps = Array.isArray(veto?.availableMaps) ? veto.availableMaps : [];
  const vetoBans = Array.isArray(veto?.bans) ? veto.bans : EMPTY_ARRAY;
  const vetoDone = String(veto?.status || "") === "done";
  const seriesMaps = useMemo(() => {
    const direct = Array.isArray(veto?.seriesMaps) ? veto.seriesMaps.filter(Boolean) : [];
    if (direct.length) return direct;
    const picks = Array.isArray(veto?.picks) ? veto.picks.filter(Boolean) : [];
    const decider = String(veto?.decider || veto?.pick || "").trim();
    if (!decider) return picks;
    return picks.includes(decider) ? picks : [...picks, decider];
  }, [veto]);
  const mapScores = useMemo(
    () =>
      Array.isArray(match?.mapScores)
        ? match.mapScores.map((row) => ({
            teamAScore: Number(row?.teamAScore || 0),
            teamBScore: Number(row?.teamBScore || 0),
          }))
        : [],
    [match?.mapScores]
  );
  const nextVetoAction = String(veto?.nextAction || "ban").toLowerCase();
  const bannedMaps = useMemo(() => {
    const out = new Set();
    vetoBans.forEach((step) => {
      if (String(step?.action || "").toLowerCase() !== "ban") return;
      const name = String(step?.map || "").trim();
      if (!name) return;
      out.add(name);
    });
    return out;
  }, [vetoBans]);
  const pickedMaps = useMemo(() => {
    const out = new Set();
    const directPicks = Array.isArray(veto?.picks) ? veto.picks : [];
    directPicks.forEach((name) => {
      const clean = String(name || "").trim();
      if (!clean) return;
      out.add(clean);
    });
    vetoBans.forEach((step) => {
      const action = String(step?.action || "").toLowerCase();
      if (!["pick", "decider"].includes(action)) return;
      const name = String(step?.map || "").trim();
      if (!name) return;
      out.add(name);
    });
    return out;
  }, [veto, vetoBans]);
  const turnStartedAt = Number(
    veto?.turnStartedAt || veto?.updatedAt || veto?.openedAt || 0
  );
  const turnEndsAt = turnStartedAt > 0 ? turnStartedAt + 30 * 1000 : 0;
  const turnTimeLeftMs = turnEndsAt > 0 ? turnEndsAt - nowMs : 0;
  const readyDeadlineAt = Number(
    readyCheck?.deadlineAt || (hasSchedule ? scheduledAt + 5 * 60 * 1000 : 0)
  );
  const vetoOpensAt = Number(readyCheck?.vetoOpensAt || 0);
  const vetoStartsIn = vetoOpensAt > 0 ? vetoOpensAt - nowMs : 0;
  const teamAReady = readyCheck?.teamAReady === true;
  const teamBReady = readyCheck?.teamBReady === true;
  const bothReady = teamAReady && teamBReady;
  const vetoUnlocked = hasSchedule && hasStarted && bothReady && (vetoOpensAt <= 0 || nowMs >= vetoOpensAt);
  const readyExpired =
    hasSchedule && hasStarted && nowMs > readyDeadlineAt && (!teamAReady || !teamBReady);
  const myReady = isCaptainA ? teamAReady : isCaptainB ? teamBReady : false;
  const canConfirmReady =
    Boolean(myTeamId) &&
    hasSchedule &&
    hasStarted &&
    !readyExpired &&
    !bothReady &&
    !myReady &&
    String(match?.status || "") !== "completed";
  const myTurn = Boolean(myTeamId) && String(veto?.nextTeamId || "") === String(myTeamId);
  const readyNeededForVeto = hasSchedule && hasStarted;
  const canUseVeto =
    Boolean(myTeamId) &&
    hasStarted &&
    vetoUnlocked &&
    (!readyNeededForVeto || bothReady) &&
    !readyExpired &&
    !vetoDone &&
    ["ban", "pick"].includes(nextVetoAction) &&
    String(match?.status || "") !== "completed";

  const onConfirmReady = async () => {
    if (!canConfirmReady || !id || !matchId) return;

    if (!user) return;
    setSubmittingReady(true);
    setNotice("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/tournaments/${id}/matches/${matchId}/ready`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || tm.readyFailed || "Failed to confirm readiness");
      await load({ silent: true });
    } catch (err) {
      setNotice(err?.message || tm.readyFailed || "Failed to confirm readiness");
    } finally {
      setSubmittingReady(false);
    }
  };

  const onVeto = async (mapName) => {
    if (!canUseVeto || !myTurn || !id || !matchId) return;

    if (!user) return;
    setSubmittingMap(mapName);
    setNotice("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/tournaments/${id}/matches/${matchId}/veto`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: nextVetoAction, map: mapName }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || tm.vetoFailed || "Failed to apply veto");
      await load({ silent: true });
    } catch (err) {
      setNotice(err?.message || tm.vetoFailed || "Failed to apply veto");
    } finally {
      setSubmittingMap("");
    }
  };

  const onSendChat = async () => {
    const text = String(chatInput || "").trim();
    if (!user || !id || !matchId || !text || chatSending) return;
    setChatSending(true);
    setChatError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/tournaments/${id}/matches/${matchId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to send message");
      setChatOpen(true);
      setChatUnread(0);
      setChatInput("");
      const nextMessage = data?.message || null;
      if (nextMessage?.id) {
        setChatRows((prev) => {
          const merged = [...prev, nextMessage];
          if (merged.length <= 60) return merged;
          return merged.slice(merged.length - 60);
        });
      } else {
        await loadChat({ silent: true });
      }
    } catch (err) {
      setChatError(err?.message || "Failed to send message");
    } finally {
      setChatSending(false);
    }
  };
  const canShowChat = Boolean(user) && !chatAccessDenied && !isMatchCompleted;

  const statusText = useMemo(() => {
    if (!match) return "-";
    if (String(match.status || "") === "completed") {
      return `${match.teamAScore ?? 0}:${match.teamBScore ?? 0}`;
    }
    if (!hasSchedule) return td?.bracket?.notScheduled || "Not scheduled";
    if (!hasStarted) return `${tm.countdown || "Starts in"}: ${formatCountdown(startsIn)}`;
    if (bothReady && !vetoUnlocked) {
      return `${tm.vetoStartsIn || "Ban/Pick starts in"}: ${formatCountdown(Math.max(0, vetoStartsIn))}`;
    }
    if (!bothReady && !readyExpired) {
      return `${tm.readyInProgress || "Ready check"}: ${formatCountdown(Math.max(0, readyDeadlineAt - nowMs))}`;
    }
    if (readyExpired) return tm.readyExpired || "Ready check expired";
    return tm.live || "Live / ready";
  }, [
    match,
    hasSchedule,
    hasStarted,
    startsIn,
    td?.bracket?.notScheduled,
    tm.countdown,
    tm.live,
    bothReady,
    readyExpired,
    vetoUnlocked,
    vetoStartsIn,
    tm.readyInProgress,
    tm.readyExpired,
    tm.vetoStartsIn,
    readyDeadlineAt,
    nowMs,
  ]);

  const matchFlowSteps = useMemo(() => {
    const labels = {
      ready: tm.stepReady || "Ready",
      veto: tm.stepVeto || "Veto",
      live: tm.stepLive || "Live",
      result: tm.stepResult || "Result",
    };
    const order = ["ready", "veto", "live", "result"];
    let currentKey = "ready";

    if (isMatchCompleted) {
      currentKey = "result";
    } else if (vetoUnlocked && vetoDone) {
      currentKey = "live";
    } else if (vetoUnlocked && !vetoDone) {
      currentKey = "veto";
    }

    const currentIdx = order.indexOf(currentKey);
    return order.map((key, idx) => ({
      key,
      label: labels[key],
      state: idx < currentIdx ? "done" : idx === currentIdx ? "current" : "upcoming",
    }));
  }, [tm.stepReady, tm.stepVeto, tm.stepLive, tm.stepResult, isMatchCompleted, vetoUnlocked, vetoDone]);

  const keyMoments = useMemo(() => {
    const items = [];
    if (hasSchedule) {
      items.push({
        key: "schedule",
        label: tm.timelineSchedule || "Scheduled",
        value: formatMatchDate(scheduledAt, lang),
      });
    } else {
      items.push({
        key: "schedule",
        label: tm.timelineSchedule || "Scheduled",
        value: td?.bracket?.notScheduled || "Not scheduled",
      });
    }
    items.push({
      key: "ready",
      label: tm.readyCheck || "Ready check",
      value: bothReady
        ? tm.readyCompleted || "Both captains confirmed readiness"
        : readyExpired
          ? tm.readyExpired || "Ready check expired"
          : tm.readyInProgress || "In progress",
    });
    items.push({
      key: "veto",
      label: tm.veto || "Ban/Pick",
      value: vetoDone
        ? tm.timelineVetoDone || "Completed"
        : vetoUnlocked
          ? tm.timelineVetoActive || "In progress"
          : tm.timelineVetoLocked || "Locked",
    });

    if (bestOfValue > 1) {
      items.push({
        key: "maps",
        label: tm.seriesMaps || "Series maps",
        value:
          seriesMaps.length > 0
            ? seriesMaps.join(", ")
            : tm.timelineMapsPending || "Pending",
      });
    } else {
      items.push({
        key: "map",
        label: tm.picked || "Picked map",
        value: String(veto?.pick || tm.timelineMapPending || "Pending"),
      });
    }

    if (isMatchCompleted) {
      items.push({
        key: "result",
        label: tm.stepResult || "Result",
        value: `${match?.teamAScore ?? 0}:${match?.teamBScore ?? 0}`,
      });
    }
    return items;
  }, [
    hasSchedule,
    scheduledAt,
    lang,
    td?.bracket?.notScheduled,
    tm.timelineSchedule,
    tm.readyCheck,
    bothReady,
    tm.readyCompleted,
    readyExpired,
    tm.readyExpired,
    tm.readyInProgress,
    tm.veto,
    tm.timelineVetoDone,
    vetoDone,
    vetoUnlocked,
    tm.timelineVetoActive,
    tm.timelineVetoLocked,
    bestOfValue,
    tm.seriesMaps,
    seriesMaps,
    tm.timelineMapsPending,
    tm.picked,
    veto?.pick,
    tm.timelineMapPending,
    isMatchCompleted,
    tm.stepResult,
    match?.teamAScore,
    match?.teamBScore,
  ]);

  const pageError =
    error ||
    (!loading && (!payload || !match || !tournament)
      ? tm.notFound || "Match not found"
      : "");

  if (loading || pageError) {
    return (
      <div className={styles.wrapper}>
        <PageState
          loading={loading}
          error={pageError}
          loadingText={tm.loading || "Loading match..."}
          errorText={pageError}
        />
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <h1 className={styles.title}>{tournament.title || tm.pageTitle || "Match"}</h1>
        <Link className={styles.backLink} to={`/tournaments/${id}`}>
          {tm.backToTournament || td.backToList || "Back to tournament"}
        </Link>
      </header>

      <section className={styles.mainCard}>
        {isSolo ? (
          <SoloPlayerCard
            player={soloA}
            fallbackName={tm.playerA || "Player A"}
            eloLabel={tm.eloShort || "ELO"}
            entityHref={sideAHref}
          />
        ) : (
          <TeamLineup
            side={teamA}
            fallbackTeamName={tm.teamA || "Team A"}
            eloLabel={tm.eloShort || "ELO"}
            entityHref={sideAHref}
          />
        )}

        <div className={styles.centerCol}>
          <p className={styles.matchMeta}>R{match.round} | {String(match.stage || "single")} | BO{bestOfValue}</p>
          {isSolo ? (
            <p className={styles.soloVs}>
              {sideAHref ? (
                <Link className={styles.entityLink} to={sideAHref}>{soloA.name}</Link>
              ) : soloA.name}
              {" vs "}
              {sideBHref ? (
                <Link className={styles.entityLink} to={sideBHref}>{soloB.name}</Link>
              ) : soloB.name}
            </p>
          ) : null}
          <p className={styles.status}>{statusText}</p>
          <p className={styles.modeBadge}>
            {isCaptain
              ? (tm.modeCaptain || "Captain mode")
              : isAdmin
                ? (tm.modeAdmin || "Admin viewer mode")
                : (tm.modeViewer || "Viewer mode")}
          </p>
          <div className={styles.matchFlow} aria-label={tm.flowLabel || "Match flow"}>
            {matchFlowSteps.map((step, idx) => (
              <div
                key={step.key}
                className={`${styles.matchFlowStep} ${
                  step.state === "done"
                    ? styles.matchFlowStepDone
                    : step.state === "current"
                      ? styles.matchFlowStepCurrent
                      : styles.matchFlowStepUpcoming
                }`}
              >
                <span className={styles.matchFlowDot}>{idx + 1}</span>
                <span className={styles.matchFlowLabel}>{step.label}</span>
              </div>
            ))}
          </div>
          <div className={styles.timelineCard}>
            <h3 className={styles.timelineTitle}>
              {tm.timelineTitle || "Key moments"}
            </h3>
            <div className={styles.timelineList}>
              {keyMoments.map((item) => (
                <div key={item.key} className={styles.timelineRow}>
                  <span className={styles.timelineLabel}>{item.label}</span>
                  <span className={styles.timelineValue}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
          {hasSchedule ? <p className={styles.schedule}>{formatMatchDate(scheduledAt, lang)}</p> : null}
          {canShowChat ? (
            <button
              type="button"
              className={styles.chatToggle}
              onClick={() => {
                setChatOpen((v) => !v);
                setChatUnread(0);
              }}
            >
              {chatOpen ? (tm.chatHide || "Hide chat") : (tm.chatOpen || "Open chat")}
              {chatUnread > 0 ? <span className={styles.chatUnread}>{chatUnread}</span> : null}
            </button>
          ) : null}
          {!isOperator ? (
            <div className={styles.viewerSummaryCard}>
              <h3 className={styles.blockTitle}>
                {tm.viewerSummaryTitle || "Viewer summary"}
              </h3>
              {!hasSchedule ? (
                <p className={styles.hint}>
                  {tm.noScheduleForReady || "Set match time to start ready check"}
                </p>
              ) : null}
              {hasSchedule && !hasStarted ? (
                <p className={styles.hint}>
                  {tm.readyLocked || "Ready check opens at match start time"}
                </p>
              ) : null}
              {hasSchedule && hasStarted && !bothReady && !readyExpired ? (
                <p className={styles.hint}>
                  {(tm.readyTimeLeft || "Time to confirm")}:{" "}
                  {formatCountdown(Math.max(0, readyDeadlineAt - nowMs))}
                </p>
              ) : null}
              {hasSchedule && hasStarted && bothReady && !vetoUnlocked ? (
                <p className={styles.hint}>
                  {(tm.vetoStartsIn || "Ban/Pick starts in")}:{" "}
                  {formatCountdown(Math.max(0, vetoStartsIn))}
                </p>
              ) : null}
              {readyExpired ? (
                <p className={styles.hint}>
                  {tm.readyExpired || "Ready check expired"}
                </p>
              ) : null}
              {vetoUnlocked && !vetoDone ? (
                <p className={styles.hint}>
                  {tm.viewerHintVeto || "Captains are currently running Ban/Pick"}
                </p>
              ) : null}
              <div className={styles.readyRows}>
                <div className={styles.readyRow}>
                  <span>{isSolo ? soloA.name : teamA.teamName}</span>
                  <strong>{teamAReady ? (tm.readyYes || "Ready") : (tm.readyNo || "Not ready")}</strong>
                </div>
                <div className={styles.readyRow}>
                  <span>{isSolo ? soloB.name : teamB.teamName}</span>
                  <strong>{teamBReady ? (tm.readyYes || "Ready") : (tm.readyNo || "Not ready")}</strong>
                </div>
              </div>
            </div>
          ) : null}
          {!vetoUnlocked && isOperator ? (
            <div className={styles.readyCard}>
              <h3 className={styles.blockTitle}>{tm.readyCheck || "Ready check"}</h3>
              {!hasSchedule ? (
                <p className={styles.hint}>{tm.noScheduleForReady || "Set match time to start ready check"}</p>
              ) : null}
              {hasSchedule && !hasStarted ? (
                <p className={styles.hint}>{tm.readyLocked || "Ready check opens at match start time"}</p>
              ) : null}
              {hasSchedule && hasStarted && !bothReady && !readyExpired ? (
                <p className={styles.hint}>
                  {(tm.readyTimeLeft || "Time to confirm")}: {formatCountdown(Math.max(0, readyDeadlineAt - nowMs))}
                </p>
              ) : null}
              {hasSchedule && hasStarted && bothReady ? (
                <p className={styles.hint}>{tm.readyCompleted || "Both captains confirmed readiness"}</p>
              ) : null}
              {hasSchedule && hasStarted && bothReady && !vetoUnlocked ? (
                <p className={styles.hint}>
                  {(tm.vetoStartsIn || "Ban/Pick starts in")}: {formatCountdown(Math.max(0, vetoStartsIn))}
                </p>
              ) : null}
              {readyExpired ? <p className={styles.hint}>{tm.readyExpired || "Ready check expired"}</p> : null}

              <div className={styles.readyRows}>
                <div className={styles.readyRow}>
                  <span>{isSolo ? soloA.name : teamA.teamName}</span>
                  <strong>{teamAReady ? (tm.readyYes || "Ready") : (tm.readyNo || "Not ready")}</strong>
                </div>
                <div className={styles.readyRow}>
                  <span>{isSolo ? soloB.name : teamB.teamName}</span>
                  <strong>{teamBReady ? (tm.readyYes || "Ready") : (tm.readyNo || "Not ready")}</strong>
                </div>
              </div>

              {canConfirmReady ? (
                <button
                  type="button"
                  className={styles.readyButton}
                  onClick={onConfirmReady}
                  disabled={submittingReady}
                >
                  {submittingReady ? (tm.confirming || "Confirming...") : (tm.confirmReady || "Confirm readiness")}
                </button>
              ) : null}
              {hasSchedule && hasStarted && !bothReady && isCaptain && !myTeamId ? (
                <p className={styles.hint}>{tm.readyCaptainsOnly || "Only captains can confirm readiness"}</p>
              ) : null}
            </div>
          ) : null}

          {vetoUnlocked && !vetoDone && isOperator ? (
            <div className={styles.vetoCard}>
              <h3 className={styles.blockTitle}>{tm.veto || "Ban/Pick"}</h3>
              {hasStarted && bothReady && isCaptain && !canUseVeto ? (
                <p className={styles.hint}>{tm.captainsOnly || "Only captains can use veto"}</p>
              ) : null}
              {notice ? <StateMessage text={notice} tone="error" /> : null}

              <div className={styles.mapGrid}>
                {mapPool.map((mapName) => {
                  const isAvailable = availableMaps.includes(mapName);
                  const isBanned = bannedMaps.has(mapName);
                  const isPicked = pickedMaps.has(mapName);
                  const canClickMap = isCaptain && isAvailable && canUseVeto && myTurn && submittingMap !== mapName;
                  return (
                    canClickMap ? (
                      <button
                        key={mapName}
                        type="button"
                        className={`${styles.mapCard} ${isAvailable ? "" : styles.mapCardDisabled}`}
                        disabled={!canClickMap}
                        onClick={() => onVeto(mapName)}
                      >
                        <div className={styles.mapThumb}>
                          {!failedMapImages.has(mapName) ? (
                            <img
                              src={mapImageSrc(mapName)}
                              alt={mapName}
                              className={styles.mapImage}
                              loading="lazy"
                              onError={() => {
                                setFailedMapImages((prev) => {
                                  if (prev.has(mapName)) return prev;
                                  const next = new Set(prev);
                                  next.add(mapName);
                                  return next;
                                });
                              }}
                            />
                          ) : (
                            <span className={styles.mapThumbFallback}>IMG</span>
                          )}
                          {isBanned ? <span className={styles.mapBannedTag}>BANNED</span> : null}
                          {isPicked ? <span className={styles.mapPickedTag}>PICKED</span> : null}
                        </div>
                        <div className={styles.mapLabel}>{mapName}</div>
                      </button>
                    ) : (
                      <div
                        key={mapName}
                        className={`${styles.mapCard} ${styles.mapCardReadonly} ${isAvailable ? "" : styles.mapCardDisabled}`}
                      >
                        <div className={styles.mapThumb}>
                          {!failedMapImages.has(mapName) ? (
                            <img
                              src={mapImageSrc(mapName)}
                              alt={mapName}
                              className={styles.mapImage}
                              loading="lazy"
                              onError={() => {
                                setFailedMapImages((prev) => {
                                  if (prev.has(mapName)) return prev;
                                  const next = new Set(prev);
                                  next.add(mapName);
                                  return next;
                                });
                              }}
                            />
                          ) : (
                            <span className={styles.mapThumbFallback}>IMG</span>
                          )}
                          {isBanned ? <span className={styles.mapBannedTag}>BANNED</span> : null}
                          {isPicked ? <span className={styles.mapPickedTag}>PICKED</span> : null}
                        </div>
                        <div className={styles.mapLabel}>{mapName}</div>
                      </div>
                    )
                  );
                })}
              </div>

              {!vetoDone && String(veto?.nextTeamId || "") ? (
                <>
                <p className={styles.turnText}>
                  {(tm.turn || "Turn")} ({String(nextVetoAction || "ban").toUpperCase()}): {
                    String(veto?.nextTeamId || "") === String(teamA.teamId || "")
                      ? (isSolo ? soloA.name : teamA.teamName)
                      : (isSolo ? soloB.name : teamB.teamName)
                    }
                  </p>
                  <p className={styles.turnTimer}>
                    {(tm.turnTimeLeft || "Ban timer")}: {formatCountdown(Math.max(0, turnTimeLeftMs))}
                  </p>
                </>
              ) : null}
            </div>
          ) : null}

          {vetoUnlocked && vetoDone ? (
            <div className={styles.vetoCard}>
              <h3 className={styles.blockTitle}>
                {bestOfValue > 1 ? (tm.seriesMaps || "Series maps") : (tm.picked || "Picked map")}
              </h3>
              {bestOfValue > 1 && seriesMaps.length > 0 ? (
                <div className={styles.seriesList}>
                  {seriesMaps.map((mapName, idx) => {
                    const isDecider = String(veto?.decider || "").trim() === String(mapName);
                    return (
                      <div key={`${idx}-${mapName}`} className={styles.seriesRow}>
                        <div className={styles.seriesThumb}>
                          {!failedMapImages.has(mapName) ? (
                            <img
                              src={mapImageSrc(mapName)}
                              alt={mapName}
                              className={styles.mapImage}
                              loading="lazy"
                              onError={() => {
                                setFailedMapImages((prev) => {
                                  if (prev.has(mapName)) return prev;
                                  const next = new Set(prev);
                                  next.add(mapName);
                                  return next;
                                });
                              }}
                            />
                          ) : (
                            <span className={styles.mapThumbFallback}>IMG</span>
                          )}
                          <span className={styles.mapPickedTag}>PICKED</span>
                        </div>
                        <div className={styles.seriesLabel}>
                          {isDecider ? "Decider" : `Map ${idx + 1}`}: {mapName}
                          {mapScores[idx]
                            ? ` (${mapScores[idx].teamAScore}-${mapScores[idx].teamBScore})`
                            : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.finalMapCard}>
                  <div className={styles.finalMapThumb}>
                    {!failedMapImages.has(veto.pick) ? (
                      <img
                        src={mapImageSrc(veto.pick)}
                        alt={veto.pick}
                        className={styles.mapImage}
                        loading="lazy"
                        onError={() => {
                          setFailedMapImages((prev) => {
                            if (prev.has(veto.pick)) return prev;
                            const next = new Set(prev);
                            next.add(veto.pick);
                            return next;
                          });
                        }}
                      />
                    ) : (
                      <span className={styles.mapThumbFallback}>IMG</span>
                    )}
                    <span className={styles.mapPickedTag}>PICKED</span>
                  </div>
                  <div className={styles.finalMapLabel}>{veto.pick || "-"}</div>
                  {mapScores[0] ? (
                    <div className={styles.finalMapScore}>
                      {mapScores[0].teamAScore}-{mapScores[0].teamBScore}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {vetoUnlocked && vetoBans.length > 0 ? (
            <div className={styles.vetoCard}>
              <h3 className={styles.blockTitle}>Ban/Pick log</h3>
              <div className={styles.logList}>
                {vetoBans.map((step) => (
                  <div key={`${step.idx}-${step.map}`} className={styles.logRow}>
                    <span className={styles.logIdx}>{step.idx}.</span>
                    <span>
                      {step.teamId === teamA.teamId
                        ? (isSolo ? soloA.name : teamA.teamName)
                        : (isSolo ? soloB.name : teamB.teamName)}
                    </span>
                    <span
                      className={`${styles.logAction} ${
                        ["pick", "decider"].includes(String(step.action || "").toLowerCase())
                          ? styles.logActionPick
                          : ""
                      }`}
                    >
                      {step.action}
                    </span>
                    <strong>{step.map}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {isSolo ? (
          <SoloPlayerCard
            player={soloB}
            fallbackName={tm.playerB || "Player B"}
            eloLabel={tm.eloShort || "ELO"}
            entityHref={sideBHref}
          />
        ) : (
          <TeamLineup
            side={teamB}
            fallbackTeamName={tm.teamB || "Team B"}
            eloLabel={tm.eloShort || "ELO"}
            entityHref={sideBHref}
          />
        )}
      </section>

      {canShowChat ? (
        <section className={`${styles.chatSection} ${chatOpen ? "" : styles.chatSectionHidden}`}>
          <div className={styles.chatCard}>
            <div className={styles.chatHeaderRow}>
              <h3 className={styles.blockTitle}>{tm.chatTitle || "Match chat"}</h3>
              <button
                type="button"
                className={styles.chatClose}
                onClick={() => setChatOpen(false)}
              >
                {tm.chatHide || "Hide chat"}
              </button>
            </div>
            <div className={styles.chatFeed}>
              {chatLoading ? (
                <p className={styles.chatHint}>{tm.chatLoading || "Loading chat..."}</p>
              ) : null}
              {!chatLoading && chatRows.length === 0 ? (
                <p className={styles.chatHint}>{tm.chatEmpty || "No messages yet"}</p>
              ) : null}
              {chatRows.map((row) => {
                const mine = String(row?.uid || "") === String(user?.uid || "");
                const authorUid = String(row?.uid || "");
                const authorName = chatAuthorNames.get(authorUid)
                  || (mine ? (tm.chatYou || "You") : authorUid.slice(0, 8));
                return (
                  <div key={row.id} className={`${styles.chatRow} ${mine ? styles.chatRowMine : ""}`}>
                    <div className={styles.chatMeta}>
                      <span>{authorName}</span>
                      <span>{formatChatTime(row?.createdAt, lang)}</span>
                    </div>
                    <div className={styles.chatText}>{String(row?.text || "")}</div>
                  </div>
                );
              })}
            </div>
            {chatError ? <p className={styles.chatError}>{chatError}</p> : null}
            <div className={styles.chatComposer}>
              <textarea
                className={styles.chatInput}
                value={chatInput}
                maxLength={500}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSendChat();
                  }
                }}
                placeholder={tm.chatPlaceholder || "Type a message..."}
                disabled={chatSending}
              />
              <button
                type="button"
                className={styles.chatSend}
                disabled={chatSending || !String(chatInput || "").trim()}
                onClick={onSendChat}
              >
                {chatSending ? (tm.chatSending || "Sending...") : (tm.chatSend || "Send")}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {canShowChat && !chatOpen ? (
        <button
          type="button"
          className={styles.chatFab}
          onClick={() => {
            setChatOpen(true);
            setChatUnread(0);
          }}
        >
          {tm.chatOpen || "Open chat"}
          {chatUnread > 0 ? <span className={styles.chatUnread}>{chatUnread}</span> : null}
        </button>
      ) : null}
    </div>
  );
}
