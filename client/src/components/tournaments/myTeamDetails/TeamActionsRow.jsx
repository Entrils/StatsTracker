import Button from "@/components/ui/Button";
import styles from "@/pages/MyTeamDetails/MyTeamDetails.module.css";

export default function TeamActionsRow({
  row,
  tm,
  onStartEdit,
  onDeleteTeam,
  onLeaveTeam,
}) {
  return (
    <div className={`${styles.teamActionsRow} ${styles.teamDetailsActionsRow}`}>
      {row.isCaptain ? (
        <div className={styles.actions}>
          <Button variant="secondary" size="sm" onClick={onStartEdit}>
            {tm.editTeam || "Edit team"}
          </Button>
          <Button variant="secondary" size="sm" onClick={onDeleteTeam}>
            {tm.deleteTeam || "Delete team"}
          </Button>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={onLeaveTeam}>
          {tm.leaveTeam || "Leave team"}
        </Button>
      )}
    </div>
  );
}

