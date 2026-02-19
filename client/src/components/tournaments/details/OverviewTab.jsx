import styles from "@/pages/TournamentDetails/TournamentDetails.module.css";
import { formatBracketTypeLabel } from "@/shared/tournaments/tournamentFormatting";

export default function OverviewTab({ tournament, td, lang, formatDate }) {
  return (
    <section className={styles.card}>
      <div className={styles.overviewShell}>
        <div className={styles.overviewHeader}>
          <div>
            <p className={styles.overviewEyebrow}>{td?.overview?.eyebrow || "Tournament overview"}</p>
            <h3 className={styles.overviewTitle}>{tournament.title || "Tournament"}</h3>
          </div>
          <span className={styles.overviewStatus}>{tournament.status || "-"}</span>
        </div>

        <p className={styles.overviewDescription}>
          {tournament.description || td.noDescription || "No description provided."}
        </p>

        <div className={styles.overviewKpiGrid}>
          <div className={styles.overviewKpi}>
            <p className={styles.overviewKpiLabel}>{td?.overview?.participants || "Participants"}</p>
            <p className={styles.overviewKpiValue}>
              {tournament.registeredTeams}/{tournament.maxTeams}
            </p>
          </div>
          <div className={styles.overviewKpi}>
            <p className={styles.overviewKpiLabel}>{td?.overview?.format || "Format"}</p>
            <p className={styles.overviewKpiValue}>{tournament.teamFormat || "-"}</p>
          </div>
          <div className={styles.overviewKpi}>
            <p className={styles.overviewKpiLabel}>{td?.overview?.bracket || "Bracket"}</p>
            <p className={styles.overviewKpiValue}>
              {formatBracketTypeLabel(tournament.bracketType)}
            </p>
          </div>
          <div className={styles.overviewKpi}>
            <p className={styles.overviewKpiLabel}>{td?.overview?.start || "Start"}</p>
            <p className={styles.overviewKpiValue}>{formatDate(tournament.startsAt, lang)}</p>
          </div>
          <div className={styles.overviewKpi}>
            <p className={styles.overviewKpiLabel}>{td?.overview?.prizePool || "Prize pool"}</p>
            <p className={styles.overviewKpiValue}>{tournament.prizePool || "-"}</p>
          </div>
          {!!tournament.champion?.teamName && (
            <div className={styles.overviewKpi}>
              <p className={styles.overviewKpiLabel}>{td?.overview?.champion || "Champion"}</p>
              <p className={styles.overviewKpiValue}>{tournament.champion.teamName}</p>
            </div>
          )}
        </div>

        <div className={styles.overviewRequirementRow}>
          <span className={styles.overviewRequirementChip}>
            {tournament?.requirements?.minElo ?? 0} ELO
          </span>
          <span className={styles.overviewRequirementChip}>
            {tournament?.requirements?.minMatches ?? 0} Matches
          </span>
        </div>
      </div>
    </section>
  );
}

