import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import styles from "./TournamentDetails.module.css";
import { useLang } from "@/i18n/LanguageContext";
import { useAuth } from "@/auth/AuthContext";
import Button from "@/components/ui/Button";
import StateMessage from "@/components/StateMessage/StateMessage";
import OverviewTab from "@/components/tournaments/details/OverviewTab";
import RulesTab from "@/components/tournaments/details/RulesTab";
import ParticipantsTab from "@/components/tournaments/details/ParticipantsTab";
import BracketTab from "@/components/tournaments/details/BracketTab";
import ScoreModal from "@/components/tournaments/details/ScoreModal";
import {
  buildGroupStatsByGroup,
  buildRoundsForStage,
  buildStageBuckets,
  buildStageTabs,
  buildVisibleBuckets,
  DETAILS_TABS,
  EMPTY_MATCHES,
  formatDate,
  parseRulesList,
  resolveCanFinishGroupStage,
  resolveGrandFinalMatch,
  resolveTreeStage,
  STAGE_LABELS,
} from "@/shared/tournaments/detailsLogic";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

function getTeamScoreClass(match, side) {
  const status = String(match?.status || "");
  if (status !== "completed") return styles.matchScorePending;
  const winnerTeamId = String(match?.winnerTeamId || "");
  const teamId = String((side === "A" ? match?.teamA?.teamId : match?.teamB?.teamId) || "");
  if (!winnerTeamId || !teamId) return styles.matchScoreDone;
  return winnerTeamId === teamId ? styles.matchScoreWin : styles.matchScoreLose;
}

function hasTeamIdentity(team) {
  return Boolean(team?.teamId || team?.teamName);
}

function toDateTimeLocalValue(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function bestOfLabel(match) {
  const value = Number(match?.bestOf);
  return `BO${[1, 3, 5].includes(value) ? value : 1}`;
}

function entityHrefFromSide(side, isSolo) {
  const id = String(side?.teamId || "").trim();
  if (!id) return "";
  return isSolo ? `/player/${encodeURIComponent(id)}` : `/teams/${encodeURIComponent(id)}`;
}

export default function TournamentDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const { user, claims } = useAuth();

  const td = t?.tournaments?.details || {};
  const isAdmin = claims?.admin === true || claims?.role === "admin";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tournament, setTournament] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [matches, setMatches] = useState([]);
  const [tab, setTab] = useState("overview");
  const [stageFilter, setStageFilter] = useState("all");
  const [generating, setGenerating] = useState(false);
  const [generatingPlayoff, setGeneratingPlayoff] = useState(false);
  const [deletingTournament, setDeletingTournament] = useState(false);
  const [savingResultId, setSavingResultId] = useState("");
  const isSolo = String(tournament?.teamFormat || "") === "1x1";
  const [scoreModal, setScoreModal] = useState({
    open: false,
    matchId: "",
    teamAId: "",
    teamBId: "",
    teamAName: "",
    teamBName: "",
    teamAScore: 0,
    teamBScore: 0,
    winnerTeamId: "",
    scheduledAt: "",
    bestOf: 1,
    error: "",
  });

  const doubleElimRef = useRef(null);
  const upperFinalRef = useRef(null);
  const lowerFinalRef = useRef(null);
  const grandFinalRef = useRef(null);
  const grandTopRowRef = useRef(null);
  const grandBottomRowRef = useRef(null);

  const loadTournament = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setError(td.notFound || "Tournament not found");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${BACKEND_URL}/tournaments/${id}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || td.notFound || "Tournament not found");
      setTournament(data?.tournament || null);
      setRegistrations(Array.isArray(data?.registrations) ? data.registrations : []);
      setMatches(Array.isArray(data?.matches) ? data.matches : []);
    } catch (err) {
      setTournament(null);
      setRegistrations([]);
      setMatches([]);
      setError(err?.message || td.notFound || "Tournament not found");
    } finally {
      setLoading(false);
    }
  }, [id, td.notFound]);

  useEffect(() => {
    loadTournament();
  }, [loadTournament]);

  const tabs = useMemo(
    () =>
      DETAILS_TABS.map((item) => ({
        key: item.key,
        label: td?.tabs?.[item.key] || item.key,
      })),
    [td?.tabs]
  );

  const matchesSource = matches || EMPTY_MATCHES;
  const stageTabs = useMemo(() => buildStageTabs(matchesSource), [matchesSource]);

  useEffect(() => {
    if (!stageTabs.includes(stageFilter)) {
      setStageFilter(stageTabs[0] || "all");
    }
  }, [stageTabs, stageFilter]);

  const stageLabels = useMemo(() => {
    const map = {};
    Object.keys(STAGE_LABELS).forEach((key) => {
      map[key] = td?.stage?.[key] || STAGE_LABELS[key];
    });
    return map;
  }, [td?.stage]);

  const stageBuckets = useMemo(() => buildStageBuckets(matchesSource), [matchesSource]);
  const visibleBuckets = useMemo(
    () => buildVisibleBuckets(stageBuckets, stageFilter),
    [stageBuckets, stageFilter]
  );

  const groupStageMatches = useMemo(
    () => matchesSource.filter((m) => String(m?.stage || "") === "group"),
    [matchesSource]
  );
  const groupStatsByGroup = useMemo(
    () => buildGroupStatsByGroup(groupStageMatches),
    [groupStageMatches]
  );

  const treeStage = useMemo(
    () => resolveTreeStage(matchesSource, stageFilter),
    [matchesSource, stageFilter]
  );
  const treeRounds = useMemo(
    () => (treeStage ? buildRoundsForStage(matchesSource, treeStage) : []),
    [matchesSource, treeStage]
  );
  const upperRounds = useMemo(
    () => buildRoundsForStage(matchesSource, "upper"),
    [matchesSource]
  );
  const lowerRounds = useMemo(
    () => buildRoundsForStage(matchesSource, "lower"),
    [matchesSource]
  );

  const grandFinalMatch = useMemo(() => resolveGrandFinalMatch(matchesSource), [matchesSource]);
  const isDoubleAllView =
    stageFilter === "all" &&
    matchesSource.some((m) => String(m?.stage || "") === "upper") &&
    matchesSource.some((m) => String(m?.stage || "") === "lower");

  const canGenerateBracket = registrations.length >= 2;
  const canFinishGroupStage = useMemo(
    () => resolveCanFinishGroupStage(tournament?.bracketType, groupStageMatches, matchesSource),
    [tournament?.bracketType, groupStageMatches, matchesSource]
  );

  const rulesItems = useMemo(() => parseRulesList(tournament?.rules), [tournament?.rules]);

  const getMatchScoreText = useCallback(
    (match, side = "A") => {
      const status = String(match?.status || "");
      if (status === "completed") {
        return side === "A" ? match?.teamAScore ?? 0 : match?.teamBScore ?? 0;
      }
      const scheduledAt = Number(match?.scheduledAt || 0);
      if (Number.isFinite(scheduledAt) && scheduledAt > 0) {
        const d = new Date(scheduledAt);
        if (!Number.isNaN(d.getTime())) {
          const datePart = d.toLocaleDateString(lang || "en", {
            day: "2-digit",
            month: "2-digit",
          });
          const timePart = d.toLocaleTimeString(lang || "en", {
            hour: "2-digit",
            minute: "2-digit",
          });
          return side === "A" ? datePart : timePart;
        }
      }
      return "—";
    },
    [lang]
  );

  const renderTree = (rounds, keyPrefix = "tree", embedded = false, containerRef = null) => {
    if (!rounds.length) return null;
    return (
      <div
        className={`${styles.bracketTree} ${embedded ? styles.bracketTreeEmbedded : ""}`}
        ref={containerRef}
      >
        {rounds.map((round) => (
          <div key={`${keyPrefix}-${round.round}`} className={styles.bracketRound}>
            <h4 className={styles.bracketRoundTitle}>
              {(td?.bracket?.round || "Round {n}").replace("{n}", round.round)}
            </h4>
            <div className={styles.roundCol}>
              {round.matches.map((match) => (
                <div key={match.id} className={styles.bracketMatch}>
                  <div className={styles.matchTeamRow}>
                    <div className={styles.matchTeamInfo}>
                      {hasTeamIdentity(match.teamA) ? (
                        <img
                          src={match.teamA?.avatarUrl || "/nologoteam.png"}
                          alt={`${match.teamA?.teamName || (isSolo ? "Player A" : "Team A")} avatar`}
                          className={styles.teamAvatar}
                        />
                      ) : null}
                      <p className={styles.meta}>
                        {entityHrefFromSide(match.teamA, isSolo) ? (
                          <Link className={styles.entityLink} to={entityHrefFromSide(match.teamA, isSolo)}>
                            {match.teamA?.teamName || td?.bracket?.tbd || "TBD"}
                          </Link>
                        ) : (match.teamA?.teamName || td?.bracket?.tbd || "TBD")}
                      </p>
                    </div>
                    <span className={`${styles.matchScore} ${getTeamScoreClass(match, "A")}`}>
                      {getMatchScoreText(match, "A")}
                    </span>
                  </div>
                  <div className={styles.matchTeamRow}>
                    <div className={styles.matchTeamInfo}>
                      {hasTeamIdentity(match.teamB) ? (
                        <img
                          src={match.teamB?.avatarUrl || "/nologoteam.png"}
                          alt={`${match.teamB?.teamName || (isSolo ? "Player B" : "Team B")} avatar`}
                          className={styles.teamAvatar}
                        />
                      ) : null}
                      <p className={styles.meta}>
                        {entityHrefFromSide(match.teamB, isSolo) ? (
                          <Link className={styles.entityLink} to={entityHrefFromSide(match.teamB, isSolo)}>
                            {match.teamB?.teamName || td?.bracket?.tbd || "TBD"}
                          </Link>
                        ) : (match.teamB?.teamName || td?.bracket?.tbd || "TBD")}
                      </p>
                    </div>
                    <span className={`${styles.matchScore} ${getTeamScoreClass(match, "B")}`}>
                      {getMatchScoreText(match, "B")}
                    </span>
                  </div>
                  {isAdmin ? (
                    <div className={styles.matchEditFloating}>
                      <button
                        type="button"
                        className={styles.matchEditBtn}
                        aria-label={td?.modal?.editScore || "Edit match score"}
                        title={td?.modal?.editScore || "Edit match score"}
                        disabled={!match?.teamA?.teamId || !match?.teamB?.teamId || savingResultId === match.id}
                        onClick={() => onOpenScoreModal(match)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.04a1.003 1.003 0 0 0 0-1.42L18.21 3.29a1.003 1.003 0 0 0-1.42 0L14.96 5.12l3.75 3.75 1.99-1.66z" />
                        </svg>
                      </button>
                    </div>
                  ) : null}
                  {id ? (
                    <div className={styles.matchCompactFooter}>
                      <span className={styles.bestOfChip}>{bestOfLabel(match)}</span>
                      <Link className={styles.detailsLink} to={buildMatchHref(match.id)}>
                        {td?.match?.open || "Open match"}
                      </Link>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const onGenerate = async () => {
    if (!user || !isAdmin || !tournament?.id) return;
    setGenerating(true);
    setNotice("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/tournaments/${tournament.id}/generate-bracket`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || td?.bracket?.empty || "Failed to generate bracket");
      setNotice(`${td?.bracket?.generate || "Generate bracket"}: ${data?.matches ?? 0}`);
      await loadTournament();
    } catch (err) {
      setNotice(err?.message || td?.bracket?.empty || "Failed to generate bracket");
    } finally {
      setGenerating(false);
    }
  };

  const buildMatchHref = useCallback(
    (nextMatchId) => {
      if (!id || !nextMatchId) return "#";
      return `/tournaments/${id}/matches/${nextMatchId}`;
    },
    [id]
  );

  const onOpenScoreModal = (match) => {
    setScoreModal({
      open: true,
      matchId: String(match?.id || ""),
      teamAId: String(match?.teamA?.teamId || ""),
      teamBId: String(match?.teamB?.teamId || ""),
      teamAName: match?.teamA?.teamName || (isSolo ? "Player A" : "Team A"),
      teamBName: match?.teamB?.teamName || (isSolo ? "Player B" : "Team B"),
      teamAScore: Number(match?.teamAScore || 0),
      teamBScore: Number(match?.teamBScore || 0),
      winnerTeamId: String(match?.winnerTeamId || ""),
      scheduledAt: toDateTimeLocalValue(match?.scheduledAt),
      bestOf: [1, 3, 5].includes(Number(match?.bestOf)) ? Number(match.bestOf) : 1,
      error: "",
    });
  };

  const onCloseScoreModal = () => {
    setScoreModal((prev) => ({ ...prev, open: false, error: "" }));
  };

  const onSubmitScore = async (e) => {
    e.preventDefault();
    const matchId = String(scoreModal.matchId || "");
    const winnerTeamId = String(scoreModal.winnerTeamId || "");
    const hasWinner = Boolean(winnerTeamId);
    const scheduledAtValue = String(scoreModal.scheduledAt || "").trim();
    const bestOfValue = [1, 3, 5].includes(Number(scoreModal.bestOf)) ? Number(scoreModal.bestOf) : 1;
    if (!matchId) {
      setScoreModal((prev) => ({ ...prev, error: td?.modal?.save || "Save result" }));
      return;
    }

    const teamAScore = Math.max(0, Number(scoreModal.teamAScore || 0));
    const teamBScore = Math.max(0, Number(scoreModal.teamBScore || 0));

    if (scheduledAtValue && !Number.isFinite(Date.parse(scheduledAtValue))) {
      setScoreModal((prev) => ({ ...prev, error: td?.modal?.scheduledAt || "Match date and time" }));
      return;
    }

    if (!user || !isAdmin || !tournament?.id) return;

    setSavingResultId(matchId);
    setNotice("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/tournaments/${tournament.id}/matches/${matchId}/result`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          hasWinner
            ? {
                winnerTeamId,
                teamAScore,
                teamBScore,
                scheduledAt: scheduledAtValue || null,
                bestOf: bestOfValue,
              }
            : { scheduledAt: scheduledAtValue || null, bestOf: bestOfValue }
        ),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || td?.modal?.save || "Save result");
      onCloseScoreModal();
      await loadTournament();
    } catch (err) {
      setScoreModal((prev) => ({
        ...prev,
        error: err?.message || td?.modal?.save || "Save result",
      }));
    } finally {
      setSavingResultId("");
    }
  };

  const onResetScore = async () => {
    const matchId = String(scoreModal.matchId || "");
    if (!matchId) return;

    if (!user || !isAdmin || !tournament?.id) return;

    setSavingResultId(matchId);
    setNotice("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/tournaments/${tournament.id}/matches/${matchId}/result`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reset: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || td?.modal?.reset || "Reset result");
      onCloseScoreModal();
      await loadTournament();
    } catch (err) {
      setScoreModal((prev) => ({
        ...prev,
        error: err?.message || td?.modal?.reset || "Reset result",
      }));
    } finally {
      setSavingResultId("");
    }
  };

  const onFinishGroupStage = async () => {
    if (!canFinishGroupStage || !tournament?.id) return;

    if (!user || !isAdmin) return;

    setGeneratingPlayoff(true);
    setNotice("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/tournaments/${tournament.id}/generate-playoff`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || td?.bracket?.finishGroup || "Finish group stage");
      setNotice(`${td?.bracket?.finishGroup || "Finish group stage"}: ${data?.matches ?? 0}`);
      await loadTournament();
    } catch (err) {
      setNotice(err?.message || td?.bracket?.finishGroup || "Finish group stage");
    } finally {
      setGeneratingPlayoff(false);
    }
  };

  const onDeleteTournament = async () => {
    if (!user || !isAdmin || !tournament?.id || deletingTournament) return;
    const confirmText = td?.deleteConfirm || "Delete this tournament? This action cannot be undone.";
    if (!window.confirm(confirmText)) return;

    setDeletingTournament(true);
    setNotice("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/tournaments/${tournament.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || td?.delete || "Delete tournament");
      navigate("/tournaments");
    } catch (err) {
      setNotice(err?.message || td?.delete || "Delete tournament");
    } finally {
      setDeletingTournament(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.wrapper}>
        <StateMessage text={td.loading || "Loading tournament..."} tone="neutral" />
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className={styles.wrapper}>
        <StateMessage text={error || td.notFound || "Tournament not found"} tone="error" />
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <div className={styles.cardTitleWrap}>
            {tournament.logoUrl ? (
              <img
                src={tournament.logoUrl}
                alt={`${tournament.title || "Tournament"} logo`}
                className={styles.cardLogo}
              />
            ) : null}
            <h1 className={styles.title}>{tournament.title || "Tournament"}</h1>
          </div>
        </div>
        <div className={styles.actions}>
          <Link className={styles.detailsLink} to="/tournaments">
            {td.backToList || "Back to list"}
          </Link>
          {isAdmin ? (
            <Button
              variant="danger"
              size="sm"
              disabled={deletingTournament}
              onClick={onDeleteTournament}
            >
              {deletingTournament
                ? td?.deleting || "Deleting..."
                : td?.delete || "Delete tournament"}
            </Button>
          ) : null}
        </div>
      </header>

      {notice ? <StateMessage text={notice} tone="neutral" /> : null}

      <div className={styles.tabs}>
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`${styles.tab} ${tab === item.key ? styles.tabActive : ""}`}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <OverviewTab tournament={tournament} td={td} lang={lang} formatDate={formatDate} />
      ) : null}

      {tab === "rules" ? (
        <RulesTab
          td={td}
          tournament={tournament}
          lang={lang}
          rulesItems={rulesItems}
          formatDate={formatDate}
        />
      ) : null}

      {tab === "participants" ? (
        <ParticipantsTab td={td} tournament={tournament} registrations={registrations} />
      ) : null}

      {tab === "bracket" ? (
        <BracketTab
          td={td}
          isSolo={isSolo}
          tournamentId={id}
          isAdmin={isAdmin}
          generating={generating}
          canGenerateBracket={canGenerateBracket}
          onGenerate={onGenerate}
          matchesSource={matchesSource}
          stageTabs={stageTabs}
          stageFilter={stageFilter}
          onStageFilterChange={setStageFilter}
          stageLabels={stageLabels}
          groupStageMatches={groupStageMatches}
          groupStatsByGroup={groupStatsByGroup}
          getTeamScoreClass={getTeamScoreClass}
          hasTeamIdentity={hasTeamIdentity}
          savingResultId={savingResultId}
          onOpenScoreModal={onOpenScoreModal}
          onFinishGroupStage={onFinishGroupStage}
          canFinishGroupStage={canFinishGroupStage}
          generatingPlayoff={generatingPlayoff}
          isDoubleAllView={isDoubleAllView}
          doubleElimRef={doubleElimRef}
          doubleElimOverlay={{ width: 1, height: 1, upper: "", lower: "" }}
          upperRounds={upperRounds}
          lowerRounds={lowerRounds}
          renderTree={renderTree}
          upperFinalRef={upperFinalRef}
          lowerFinalRef={lowerFinalRef}
          grandFinalRef={grandFinalRef}
          grandTopRowRef={grandTopRowRef}
          grandBottomRowRef={grandBottomRowRef}
          grandFinalMatch={grandFinalMatch}
          treeRounds={treeRounds}
          visibleBuckets={visibleBuckets}
          getMatchScoreText={getMatchScoreText}
          buildMatchHref={buildMatchHref}
        />
      ) : null}

      <ScoreModal
        scoreModal={scoreModal}
        setScoreModal={setScoreModal}
        td={td}
        savingResultId={savingResultId}
        onCloseScoreModal={onCloseScoreModal}
        onSubmitScore={onSubmitScore}
        onResetScore={onResetScore}
      />
    </div>
  );
}

