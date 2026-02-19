import styles from "@/pages/TournamentDetails/TournamentDetails.module.css";
import Button from "@/components/ui/Button";

export default function ScoreModal({
  scoreModal,
  setScoreModal,
  td,
  savingResultId,
  onCloseScoreModal,
  onSubmitScore,
  onResetScore = null,
}) {
  if (!scoreModal.open) return null;

  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
      <form className={styles.modalCard} onSubmit={onSubmitScore}>
        <h3 className={styles.formTitle}>{td?.modal?.editScore || "Edit match score"}</h3>
        <label className={styles.label}>
          <span>{scoreModal.teamAName}</span>
          <input
            type="number"
            min="0"
            className={styles.input}
            value={scoreModal.teamAScore}
            onChange={(e) =>
              setScoreModal((prev) => ({ ...prev, teamAScore: e.target.value, error: "" }))
            }
          />
        </label>
        <label className={styles.label}>
          <span>{scoreModal.teamBName}</span>
          <input
            type="number"
            min="0"
            className={styles.input}
            value={scoreModal.teamBScore}
            onChange={(e) =>
              setScoreModal((prev) => ({ ...prev, teamBScore: e.target.value, error: "" }))
            }
          />
        </label>
        <div className={styles.modalWinnerPick}>
          <span className={styles.label}>{td?.modal?.winner || "Winner"}</span>
          <label className={styles.modalWinnerOption}>
            <input
              type="radio"
              name="winner-team"
              checked={scoreModal.winnerTeamId === scoreModal.teamAId}
              onChange={() =>
                setScoreModal((prev) => ({
                  ...prev,
                  winnerTeamId: prev.teamAId,
                  error: "",
                }))
              }
            />
            <span>{scoreModal.teamAName}</span>
          </label>
          <label className={styles.modalWinnerOption}>
            <input
              type="radio"
              name="winner-team"
              checked={scoreModal.winnerTeamId === scoreModal.teamBId}
              onChange={() =>
                setScoreModal((prev) => ({
                  ...prev,
                  winnerTeamId: prev.teamBId,
                  error: "",
                }))
              }
            />
            <span>{scoreModal.teamBName}</span>
          </label>
        </div>
        <label className={styles.label}>
          <span>{td?.modal?.scheduledAt || "Match date and time"}</span>
          <input
            type="datetime-local"
            className={styles.input}
            value={scoreModal.scheduledAt || ""}
            onChange={(e) =>
              setScoreModal((prev) => ({ ...prev, scheduledAt: e.target.value, error: "" }))
            }
          />
        </label>
        <label className={styles.label}>
          <span>{td?.modal?.bestOf || "Best of"}</span>
          <select
            className={styles.select}
            value={String(scoreModal.bestOf || 1)}
            onChange={(e) =>
              setScoreModal((prev) => ({ ...prev, bestOf: Number(e.target.value || 1), error: "" }))
            }
          >
            <option value="1">BO1</option>
            <option value="3">BO3</option>
            <option value="5">BO5</option>
          </select>
        </label>
        {!!scoreModal.error && <p className={styles.error}>{scoreModal.error}</p>}
        <div className={styles.formActions}>
          {typeof onResetScore === "function" ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={savingResultId === scoreModal.matchId}
              onClick={onResetScore}
            >
              {td?.modal?.reset || "Reset"}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" size="sm" onClick={onCloseScoreModal}>
            {td?.modal?.cancel || "Cancel"}
          </Button>
          <Button type="submit" size="sm" disabled={savingResultId === scoreModal.matchId}>
            {savingResultId === scoreModal.matchId
              ? td?.modal?.saving || "Saving..."
              : td?.modal?.save || "Save result"}
          </Button>
        </div>
      </form>
    </div>
  );
}

