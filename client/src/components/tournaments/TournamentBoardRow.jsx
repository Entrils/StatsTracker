import { Link } from "react-router-dom";
import Button from "@/components/ui/Button";
import styles from "@/pages/TournamentsPage/Tournaments.module.css";
import { isSoloFormat } from "@/shared/tournaments/teamUtils";
import { formatTournamentDate } from "@/shared/tournaments/tournamentFormatting";

function RequirementLine({ ok, value, label }) {
  return (
    <div className={`${styles.requirementLine} ${ok ? styles.requirementOk : styles.requirementBad}`}>
      <span className={styles.requirementIcon}>
        {ok ? (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8.5l3 3 7-7" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        )}
      </span>
      {value} {label}
    </div>
  );
}

export default function TournamentBoardRow({
  row,
  tt,
  lang,
  user,
  isAdmin,
  registeringId,
  generatingId,
  selectedTeamId = "",
  countdownText = "",
  participating = false,
  teamOptions = [],
  reqState = { eloOk: false, matchesOk: false, fragpunkOk: false },
  onTeamSelect,
  onRegister,
  onGenerateBracket,
}) {
  const full = Number(row.registeredTeams) >= Number(row.maxTeams);
  const canGenerateBracket = Number(row.registeredTeams) >= 2;
  const solo = isSoloFormat(row.teamFormat);
  const statusLabel = tt?.tabs?.[row.status] || row.status;

  return (
    <article className={styles.boardRow}>
      <div className={styles.colTournament}>
        <div className={styles.cardTitleWrap}>
          {!!row.logoUrl && (
            <img
              src={row.logoUrl}
              alt={`${row.title} logo`}
              className={styles.cardLogo}
            />
          )}
          <Link className={styles.tournamentLink} to={`/tournaments/${row.id}`}>
            {row.title}
          </Link>
        </div>
      </div>

      <div>{formatTournamentDate(row.startsAt, lang)}</div>
      <div>{row.teamFormat}</div>
      <div>
        {row.registeredTeams}/{row.maxTeams}
      </div>
      <div className={styles.requirementsBlock}>
        <RequirementLine ok={reqState.eloOk} value={row?.requirements?.minElo ?? 0} label="ELO" />
        <RequirementLine
          ok={reqState.matchesOk}
          value={row?.requirements?.minMatches ?? 0}
          label="Matches"
        />
        <RequirementLine ok={reqState.fragpunkOk} value="FragPunk" label="ID" />
      </div>
      <div>{row.prizePool || "-"}</div>

      <div className={styles.colStatus}>
        <span className={styles.status}>{statusLabel}</span>
        {user &&
          !participating &&
          (solo ? null : (
            <select
              className={styles.select}
              value={selectedTeamId}
              onChange={(e) => onTeamSelect(row.id, e.target.value)}
            >
              <option value="">{tt.selectTeam || "Select a team"}</option>
              {teamOptions.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} ({team.memberCount})
                </option>
              ))}
            </select>
          ))}

        {participating ? (
          <span className={styles.rowSubText}>{tt.registered || "You are participating"}</span>
        ) : row.status === "upcoming" ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={
              !user ||
              full ||
              registeringId === row.id ||
              (!solo && !selectedTeamId) ||
              !reqState.fragpunkOk
            }
            onClick={() => onRegister(row)}
          >
            {registeringId === row.id ? tt.registering || "Registering..." : tt.register || "Registration"}
          </Button>
        ) : null}

        {row.status === "upcoming" && (
          <span className={styles.rowSubText}>
            {(tt.countdown || "Until start: {time}").replace("{time}", countdownText)}
          </span>
        )}

        {isAdmin && (
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={generatingId === row.id || !canGenerateBracket}
              onClick={() => onGenerateBracket(row.id)}
            >
              {generatingId === row.id ? tt.generating || "Generating..." : tt.generate || "Generate bracket"}
            </Button>
            {!canGenerateBracket && (
              <span className={styles.rowSubText}>
                {tt.minParticipants || "At least 2 participants required"}
              </span>
            )}
          </>
        )}
      </div>
    </article>
  );
}


