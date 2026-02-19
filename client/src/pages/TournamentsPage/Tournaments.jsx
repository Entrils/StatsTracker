import { useNavigate } from "react-router-dom";
import styles from "./Tournaments.module.css";
import { useLang } from "@/i18n/LanguageContext";
import { useAuth } from "@/auth/AuthContext";
import StateMessage from "@/components/StateMessage/StateMessage";
import Button from "@/components/ui/Button";
import useTournamentsController from "@/hooks/tournaments/useTournamentsController";
import TournamentTabs from "@/components/tournaments/TournamentTabs";
import TournamentBoardRow from "@/components/tournaments/TournamentBoardRow";
import { formatCountdown } from "@/shared/tournaments/tournamentFormatting";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export default function TournamentsPage() {
  const { t, lang } = useLang();
  const { user, claims } = useAuth();
  const navigate = useNavigate();

  const tt = t?.tournaments?.list || {};
  const isAdmin = claims?.admin === true || claims?.role === "admin";

  const {
    tabs,
    tab,
    setTab,
    rows,
    loading,
    error,
    notice,
    registeringId,
    teamSelectByTournament,
    participatingByTournament,
    nowMs,
    availableTeamsForTournament,
    requirementState,
    setTeamSelectByTournament,
    onRegisterTeam,
  } = useTournamentsController({
    user,
    tt,
    backendUrl: BACKEND_URL,
  });

  const onTeamSelect = (tournamentId, teamId) => {
    setTeamSelectByTournament((prev) => ({
      ...prev,
      [tournamentId]: teamId,
    }));
  };

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{tt.title || "Tournaments"}</h1>
          <p className={styles.subtitle}>{tt.empty || "No tournaments yet"}</p>
        </div>
        <div className={styles.actions}>
          {isAdmin && (
            <Button
              size="sm"
              className={styles.createBtn}
              onClick={() => navigate("/tournaments/create")}
            >
              {tt.create || "Create tournament"}
            </Button>
          )}
        </div>
      </header>

      <TournamentTabs tabs={tabs} currentTab={tab} onChange={setTab} />

      {notice ? <StateMessage text={notice} tone="neutral" /> : null}
      {error ? <StateMessage text={error} tone="error" /> : null}
      {loading ? <StateMessage text={tt.loading || "Loading tournaments..."} tone="neutral" /> : null}

      {!loading && !rows.length ? (
        <p className={styles.hint}>{tt.empty || "No tournaments yet"}</p>
      ) : null}

      {!loading && rows.length > 0 ? (
        <section className={styles.board}>
          <div className={styles.boardHead}>
            <div className={styles.headTournament}>{tt?.columns?.tournament || "Tournament"}</div>
            <div>{tt?.columns?.start || "Start"}</div>
            <div>{tt?.columns?.format || "Format"}</div>
            <div>{tt?.columns?.participants || "Participants"}</div>
            <div>{tt?.columns?.requirements || "Requirements"}</div>
            <div>{tt?.columns?.prizePool || "Prize pool"}</div>
            <div className={styles.headStatus}>{tt?.columns?.status || "Status"}</div>
          </div>

          <div className={styles.boardBody}>
            {rows.map((row) => (
              <TournamentBoardRow
                key={row.id}
                row={row}
                tt={tt}
                lang={lang}
                user={user}
                registeringId={registeringId}
                selectedTeamId={teamSelectByTournament[row.id] || ""}
                countdownText={formatCountdown(Number(row.startsAt || 0) - nowMs)}
                participating={Boolean(participatingByTournament[row.id])}
                teamOptions={availableTeamsForTournament(row)}
                reqState={requirementState(row)}
                onTeamSelect={onTeamSelect}
                onRegister={onRegisterTeam}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
