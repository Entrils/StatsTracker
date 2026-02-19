import Button from "@/components/ui/Button";
import styles from "@/pages/MyTeams/MyTeams.module.css";

export default function MyTeamInvitesSection({ tm, invites, onInviteDecision }) {
  if (!invites.length) return null;

  return (
    <section className={styles.teamsSection}>
      <h2 className={styles.formTitle}>{tm.incomingInvites || "Incoming invites"}</h2>
      <div className={styles.invites}>
        {invites.map((invite) => (
          <div key={invite.id} className={styles.inviteItem}>
            <span>
              {invite.teamName} (captain: {invite.captainUid})
            </span>
            <div className={styles.actions}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onInviteDecision(invite.teamId, true)}
              >
                {tm.accept || "Accept"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onInviteDecision(invite.teamId, false)}
              >
                {tm.reject || "Reject"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

