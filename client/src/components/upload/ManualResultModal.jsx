import styles from "@/pages/UploadTab/UploadTab.module.css";

export default function ManualResultModal({
  t,
  request,
  onVictory,
  onDefeat,
  onSkip,
}) {
  if (!request) return null;

  return (
    <div className={styles.manualResultOverlay}>
      <div className={styles.manualResultModal}>
        <div className={styles.manualResultTitle}>
          {t.upload.manualResultTitle || "Result not recognized"}
        </div>
        <div className={styles.manualResultHint}>
          {(t.upload.manualResultHint ||
            "Choose the match result to continue upload") +
            `: ${request.fileLabel}`}
        </div>
        <div className={styles.manualResultActions}>
          <button
            type="button"
            className={`${styles.manualResultBtn} ${styles.manualResultVictory}`}
            onClick={onVictory}
          >
            {t.upload.manualVictory || "Victory"}
          </button>
          <button
            type="button"
            className={`${styles.manualResultBtn} ${styles.manualResultDefeat}`}
            onClick={onDefeat}
          >
            {t.upload.manualDefeat || "Defeat"}
          </button>
          <button
            type="button"
            className={`${styles.manualResultBtn} ${styles.manualResultSkip}`}
            onClick={onSkip}
          >
            {t.upload.manualSkip || "Skip"}
          </button>
        </div>
      </div>
    </div>
  );
}

