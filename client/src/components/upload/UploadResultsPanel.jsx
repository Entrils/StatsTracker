import styles from "@/pages/UploadTab/UploadTab.module.css";
import PageState from "@/components/StateMessage/PageState";

export default function UploadResultsPanel({
  t,
  status,
  statusTone,
  batchResults,
  ocrRemaining,
  lastMatch,
}) {
  const isIdle =
    !status &&
    (!Array.isArray(batchResults) || batchResults.length === 0) &&
    typeof ocrRemaining !== "number" &&
    !lastMatch;

  return (
    <PageState
      empty={isIdle}
      emptyText={t.upload?.idle || "Select a screenshot to start analysis"}
    >
      <>
      <p
        data-cy="upload-status"
        className={`${styles.status} ${
          statusTone === "good"
            ? styles.statusOk
            : statusTone === "bad"
            ? styles.statusError
            : ""
        }`}
      >
        {status}
      </p>

      {batchResults.length > 0 && (
        <div className={styles.batchPanel} data-cy="upload-batch">
          <div className={styles.batchTitle}>
            {t.upload.batchTitle || "Batch results"}
          </div>
          <div className={styles.batchSummary}>
            {(t.upload.batchSummary || "OK: {ok} • Errors: {err} • Skipped: {skip}")
              .replace("{ok}", String(batchResults.filter((r) => r.status === "ok").length))
              .replace(
                "{err}",
                String(batchResults.filter((r) => r.status === "error").length)
              )
              .replace(
                "{skip}",
                String(batchResults.filter((r) => r.status === "skip").length)
              )}
          </div>
          <ul className={styles.batchList}>
            {batchResults.map((item, idx) => (
              <li
                key={`${item.name}-${idx}`}
                data-cy="upload-batch-item"
                data-status={item.status}
                className={`${styles.batchItem} ${
                  item.status === "ok"
                    ? styles.batchItemOk
                    : item.status === "skip"
                    ? styles.batchItemSkip
                    : styles.batchItemErr
                }`}
              >
                <span className={styles.batchItemName}>{item.name}</span>
                <span className={styles.batchItemMsg}>{item.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {typeof ocrRemaining === "number" && (
        <p
          className={`${styles.ocrRemaining} ${
            ocrRemaining < 3 ? styles.ocrRemainingLow : ""
          }`}
        >
          {(t.upload.ocrRemaining || "OCR left today: {count}").replace(
            "{count}",
            String(ocrRemaining)
          )}
        </p>
      )}

      {lastMatch && (
        <div className={styles.matchCard} data-cy="upload-last-match">
          <div className={styles.matchCardHeader}>
            <span className={styles.matchCardTitle}>
              {t.upload.matchCardTitle || "Last match"}
            </span>
            <span
              className={`${styles.matchCardResult} ${
                lastMatch.result === "victory"
                  ? styles.matchCardWin
                  : lastMatch.result === "defeat"
                  ? styles.matchCardLoss
                  : ""
              }`}
            >
              {lastMatch.result === "victory"
                ? t.upload.resultVictory || "Victory"
                : lastMatch.result === "defeat"
                ? t.upload.resultDefeat || "Defeat"
                : t.upload.resultUnknown || "Result"}
            </span>
          </div>
          <div className={styles.matchCardGrid}>
            <div className={styles.matchCardItem}>
              <span className={styles.matchCardLabel}>{t.upload.score || "Score"}</span>
              <span className={styles.matchCardValue}>{lastMatch.score}</span>
            </div>
            <div className={styles.matchCardItem}>
              <span className={styles.matchCardLabel}>{t.upload.kills || "K"}</span>
              <span className={styles.matchCardValue}>{lastMatch.kills}</span>
            </div>
            <div className={styles.matchCardItem}>
              <span className={styles.matchCardLabel}>{t.upload.deaths || "D"}</span>
              <span className={styles.matchCardValue}>{lastMatch.deaths}</span>
            </div>
            <div className={styles.matchCardItem}>
              <span className={styles.matchCardLabel}>{t.upload.assists || "A"}</span>
              <span className={styles.matchCardValue}>{lastMatch.assists}</span>
            </div>
            <div className={styles.matchCardItem}>
              <span className={styles.matchCardLabel}>{t.upload.damage || "Damage"}</span>
              <span className={styles.matchCardValue}>{lastMatch.damage}</span>
            </div>
            <div className={styles.matchCardItem}>
              <span className={styles.matchCardLabel}>
                {t.upload.damageShare || "Dmg %"}
              </span>
              <span className={styles.matchCardValue}>
                {typeof lastMatch.damageShare === "number"
                  ? `${lastMatch.damageShare}%`
                  : lastMatch.damageShare}
              </span>
            </div>
          </div>
          <div className={styles.matchCardMeta}>
            {t.upload.matchIdLabel || "Match ID"}: {lastMatch.matchId}
          </div>
        </div>
      )}
      </>
    </PageState>
  );
}
