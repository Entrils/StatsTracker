import styles from "@/pages/TournamentDetails/TournamentDetails.module.css";
import { formatBracketTypeLabel } from "@/shared/tournaments/tournamentFormatting";

export default function RulesTab({ td, tournament, lang, rulesItems, formatDate }) {
  return (
    <section className={styles.teamsSection}>
      <div className={styles.rulesShell}>
        <div className={styles.rulesHeader}>
          <h2 className={styles.formTitle}>{td?.rules?.title || "Rules"}</h2>
          <span className={styles.rulesBadge}>{td?.rules?.badge || "Official"}</span>
        </div>

        {rulesItems.length > 0 ? (
          <ul className={styles.rulesList}>
            {rulesItems.map((item, idx) => (
              <li key={`${idx}-${item.slice(0, 20)}`} className={styles.rulesListItem}>
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.hint}>{td?.rules?.empty || "Rules are not specified yet."}</p>
        )}

        <div className={styles.rulesMetaGrid}>
          <div className={styles.rulesMetaCard}>
            <span className={styles.rulesMetaLabel}>{td?.overview?.format || "Format"}</span>
            <strong className={styles.rulesMetaValue}>{tournament.teamFormat || "-"}</strong>
          </div>
          <div className={styles.rulesMetaCard}>
            <span className={styles.rulesMetaLabel}>{td?.overview?.bracket || "Bracket"}</span>
            <strong className={styles.rulesMetaValue}>
              {formatBracketTypeLabel(tournament.bracketType)}
            </strong>
          </div>
          <div className={styles.rulesMetaCard}>
            <span className={styles.rulesMetaLabel}>{td?.overview?.start || "Start"}</span>
            <strong className={styles.rulesMetaValue}>{formatDate(tournament.startsAt, lang)}</strong>
          </div>
        </div>

        <div className={styles.overviewRequirementRow}>
          <span className={styles.overviewRequirementChip}>
            Min {tournament?.requirements?.minElo ?? 0} ELO
          </span>
          <span className={styles.overviewRequirementChip}>
            Min {tournament?.requirements?.minMatches ?? 0} Matches
          </span>
        </div>
      </div>
    </section>
  );
}

