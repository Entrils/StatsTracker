import Button from "@/components/ui/Button";
import { Link } from "react-router-dom";
import styles from "@/pages/MyTeams/MyTeams.module.css";

export default function MyTeamInvitesSection({ tm, invites, onInviteDecision }) {
  const rows = Array.isArray(invites) ? invites : [];

  return (
    <section className={styles.teamsSection}>
      <h2 className={styles.formTitle}>{tm.incomingInvites || "Incoming invites"}</h2>
      {!rows.length ? (
        <p className={styles.hint}>{tm.noIncomingInvites || "No incoming invites yet"}</p>
      ) : (
        <div className={styles.invites}>
          {rows.map((invite) => (
            <div key={invite.id} className={styles.inviteItem}>
              <div className={styles.inviteMain}>
                <img
                  src={invite.teamAvatarUrl || "/nologoteam.png"}
                  alt={invite.teamName || "Team"}
                  className={styles.inviteTeamAvatar}
                />
                <div className={styles.inviteMeta}>
                  <Link to={`/teams/${invite.teamId}`} className={styles.inviteTeamLink}>
                    {invite.teamName || "Team"}
                  </Link>
                  <p className={styles.inviteCaptain}>
                    {tm.captainRole || "Captain"}: {invite.captainName || invite.captainUid || "-"}
                  </p>
                </div>
              </div>
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
      )}
    </section>
  );
}

