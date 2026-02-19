import styles from "@/pages/MyTeamDetails/MyTeamDetails.module.css";
import TeamCountryBadge from "@/components/tournaments/TeamCountryBadge";
import { teamFormatByMembers } from "@/shared/tournaments/teamUtils";

export default function TeamOverviewSection({
  row,
  stats,
  recentTournaments,
  slotsLeft,
  tm,
}) {
  return (
    <>
      <div className={styles.teamOverviewCard}>
        <div className={styles.teamOverviewIdentity}>
          <img
            src={row.avatarUrl || "/nologoteam.png"}
            alt={`${row.name} avatar`}
            className={styles.teamOverviewAvatar}
          />
          <h2 className={styles.teamOverviewName}>{row.name}</h2>
        </div>

        <div className={styles.teamOverviewStats}>
          <p className={styles.meta}>{tm.matchesPlayed || "Matches played"}: {stats.matchesPlayed || 0}</p>
          <div className={styles.teamOverviewStatGrid}>
            <p className={styles.teamWin}>{tm.wins || "Wins"}: {stats.wins || 0}</p>
            <p className={styles.teamLoss}>{tm.losses || "Losses"}: {stats.losses || 0}</p>
            <p className={styles.meta}>{tm.winRate || "Winrate"}: {stats.winRate || 0}%</p>
          </div>
          <div className={styles.teamProgressTrack}>
            <div className={styles.teamProgressWin} style={{ width: `${stats.winRate || 0}%` }} />
          </div>
        </div>

        <div className={styles.teamOverviewRecent}>
          <p className={styles.formTitle}>{tm.recentTournaments || "Recent tournaments"}</p>
          {!recentTournaments.length ? (
            <p className={styles.hint}>{tm.noData || "No data"}</p>
          ) : (
            <ul className={styles.teamMiniList}>
              {recentTournaments.map((item) => (
                <li key={item.id}>
                  {item.title} {item.placement ? `- #${item.placement}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className={styles.teamInfoBar}>
        <div>
          <p className={styles.metaLabel}>{tm.format || "Format"}</p>
          <p className={styles.meta}>{teamFormatByMembers(row.maxMembers)}</p>
        </div>
        <div>
          <p className={styles.metaLabel}>{tm.teamSize || tm.members || "Members"}</p>
          <p className={styles.meta}>{row.memberCount}/{row.maxMembers}</p>
        </div>
        <div>
          <p className={styles.metaLabel}>{tm.country || "Country"}</p>
          <p className={styles.meta}><TeamCountryBadge country={row.country} /></p>
        </div>
        <div>
          <p className={styles.metaLabel}>{tm.status || "Status"}</p>
          <p className={styles.meta}>{slotsLeft === 0 ? (tm.formed || "Formed") : (tm.forming || "Forming")}</p>
        </div>
        <div>
          <p className={styles.metaLabel}>{tm.freeSlots || "Free slots"}</p>
          <p className={styles.meta}>{slotsLeft}</p>
        </div>
      </div>
    </>
  );
}


