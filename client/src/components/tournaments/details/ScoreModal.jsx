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
        <div className={styles.mapScoresBlock}>
          <span className={styles.label}>{td?.modal?.mapScores || "Map scores"}</span>
          {(Array.isArray(scoreModal.mapScores) ? scoreModal.mapScores : []).map((row, idx) => (
            <div key={`map-${idx}`} className={styles.mapScoreRow}>
              <span className={styles.mapScoreTitle}>{`Map ${idx + 1}`}</span>
              <label className={styles.mapScoreField}>
                <span>{scoreModal.teamAName}</span>
                <input
                  type="number"
                  min="0"
                  className={styles.input}
                  value={row?.teamAScore ?? 0}
                  onChange={(e) =>
                    setScoreModal((prev) => {
                      const next = Array.isArray(prev.mapScores) ? [...prev.mapScores] : [];
                      next[idx] = {
                        ...(next[idx] || {}),
                        teamAScore: e.target.value,
                      };
                      return { ...prev, mapScores: next, error: "" };
                    })
                  }
                />
              </label>
              <label className={styles.mapScoreField}>
                <span>{scoreModal.teamBName}</span>
                <input
                  type="number"
                  min="0"
                  className={styles.input}
                  value={row?.teamBScore ?? 0}
                  onChange={(e) =>
                    setScoreModal((prev) => {
                      const next = Array.isArray(prev.mapScores) ? [...prev.mapScores] : [];
                      next[idx] = {
                        ...(next[idx] || {}),
                        teamBScore: e.target.value,
                      };
                      return { ...prev, mapScores: next, error: "" };
                    })
                  }
                />
              </label>
            </div>
          ))}
          <div className={styles.mapScoreActions}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setScoreModal((prev) => {
                  const limit = [1, 3, 5].includes(Number(prev.bestOf)) ? Number(prev.bestOf) : 1;
                  const next = Array.isArray(prev.mapScores) ? [...prev.mapScores] : [];
                  if (next.length >= limit) return prev;
                  next.push({ teamAScore: 0, teamBScore: 0 });
                  return { ...prev, mapScores: next, error: "" };
                })
              }
            >
              {td?.modal?.addMap || "Add map"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setScoreModal((prev) => {
                  const next = Array.isArray(prev.mapScores) ? [...prev.mapScores] : [];
                  if (next.length <= 1) return prev;
                  next.pop();
                  return { ...prev, mapScores: next, error: "" };
                })
              }
            >
              {td?.modal?.removeMap || "Remove map"}
            </Button>
          </div>
        </div>
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
              setScoreModal((prev) => {
                const nextBestOf = Number(e.target.value || 1);
                const nextMaps = Array.isArray(prev.mapScores) ? [...prev.mapScores] : [];
                while (nextMaps.length > nextBestOf) nextMaps.pop();
                while (nextMaps.length < 1) nextMaps.push({ teamAScore: 0, teamBScore: 0 });
                return { ...prev, bestOf: nextBestOf, mapScores: nextMaps, error: "" };
              })
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

