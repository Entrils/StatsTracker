import Button from "@/components/ui/Button";
import styles from "@/pages/MyTeamDetails/MyTeamDetails.module.css";

export default function TeamRosterSection({
  row,
  roster,
  tm,
  onTransferCaptain,
  onKickMember,
}) {
  const membersCount = Array.isArray(roster) ? roster.length : Number(row?.memberCount || 0);
  const maxMembers = Number(row?.maxMembers || 0);

  return (
    <>
      <h3 className={`${styles.formTitle} ${styles.teamDetailsSectionTitle}`}>
        {tm.members || "Members"} ({membersCount}/{maxMembers || membersCount})
      </h3>
      <div className={styles.teamRosterGrid}>
        {roster.map((member) => (
          <div key={member.uid} className={styles.teamMemberCard}>
            <img
              src={member.avatarUrl || "/nologoteam.png"}
              alt={`${member.name} avatar`}
              className={styles.teamMemberAvatar}
            />
            <div>
              <p className={styles.participantName}>{member.name}</p>
              <p className={styles.meta}>
                {member.role === "captain" ? (tm.captainRole || "Captain") : (tm.playerRole || "Player")}
              </p>
              <p className={styles.meta}>
                FragPunk ID: {member.fragpunkId || "—"}
              </p>
              {row.isCaptain && member.uid !== row.captainUid && (
                <div className={styles.teamMemberActions}>
                  <Button variant="secondary" size="sm" onClick={() => onTransferCaptain(member.uid)}>
                    {tm.transferCaptain || "Transfer captain"}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => onKickMember(member.uid)}>
                    {tm.kickMember || "Kick"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

