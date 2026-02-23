import styles from "@/pages/UploadTab/UploadTab.module.css";
import PageState from "@/components/StateMessage/PageState";

export default function UploadResultsPanel({
  t,
  status,
  statusTone,
  batchResults,
  ocrRemaining,
  lastMatch,
  onRetry,
  canRetry = false,
}) {
  const isIdle =
    !status &&
    (!Array.isArray(batchResults) || batchResults.length === 0) &&
    typeof ocrRemaining !== "number" &&
    !lastMatch;
  const latestIssue = Array.isArray(batchResults)
    ? [...batchResults]
        .reverse()
        .find((item) => item && item.status && item.status !== "ok")
    : null;
  const issueCode = String(latestIssue?.code || latestIssue?.status || "")
    .trim()
    .toLowerCase();
  const recovery = resolveRecovery(issueCode, t);

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
              {(t.upload.batchSummary || "OK: {ok} | Errors: {err} | Skipped: {skip}")
                .replace(
                  "{ok}",
                  String(batchResults.filter((r) => r.status === "ok").length)
                )
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

        {latestIssue && recovery ? (
          <div className={styles.recoveryPanel} data-cy="upload-recovery">
            <div className={styles.recoveryTitle}>{recovery.title}</div>
            <div className={styles.recoveryText}>{recovery.text}</div>
            {Array.isArray(recovery.tips) && recovery.tips.length > 0 ? (
              <ul className={styles.recoveryTips}>
                {recovery.tips.map((tip, idx) => (
                  <li key={`${tip}-${idx}`}>{tip}</li>
                ))}
              </ul>
            ) : null}
            <div className={styles.recoveryActions}>
              <button
                type="button"
                className={styles.recoveryActionBtn}
                onClick={onRetry}
                disabled={!canRetry}
              >
                {t.upload?.recoveryRetry || "Retry analyze"}
              </button>
              <label htmlFor="upload-file" className={styles.recoveryActionBtn}>
                {t.upload?.recoveryChooseOther || "Choose another screenshot"}
              </label>
              <a href="/help#match-upload-errors" className={styles.recoveryLink}>
                {t.upload?.recoveryHelp || "Open upload help"}
              </a>
            </div>
          </div>
        ) : null}

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

function resolveRecovery(code, t) {
  const generic = {
    title: t.upload?.recoveryTitle || "How to recover",
    text:
      t.upload?.recoveryGeneric ||
      "Retry with a full-screen, clear screenshot and keep match history fully visible.",
    tips: [
      t.upload?.recoveryTipFullscreen || "Use full-screen screenshot, no crop.",
      t.upload?.recoveryTipSharp || "Avoid blur and compression.",
      t.upload?.recoveryTipRow || "Keep your player row and match ID visible.",
    ],
  };
  if (!code) return generic;
  if (code === "too_large") {
    return {
      title: t.upload?.recoveryTitle || "How to recover",
      text:
        t.upload?.recoveryTooLarge ||
        "Image is too large. Export screenshot as PNG/JPG with lower resolution and retry.",
      tips: [
        t.upload?.recoveryTipResize || "Resize screenshot to 1920px width or less.",
        t.upload?.recoveryTipPng || "Prefer PNG/JPG without extra filters.",
      ],
    };
  }
  if (code === "match_id_missing") {
    return {
      title: t.upload?.recoveryTitle || "How to recover",
      text:
        t.upload?.recoveryMatchId ||
        "Match ID was not detected. Capture the full top area of match history and retry.",
      tips: [
        t.upload?.recoveryTipHeader || "Include top header with match identifier.",
        t.upload?.recoveryTipNoCrop || "Do not crop the top area.",
      ],
    };
  }
  if (code === "player_not_recognized") {
    return {
      title: t.upload?.recoveryTitle || "How to recover",
      text:
        t.upload?.recoveryPlayerRow ||
        "Player row was not recognized. Keep your own row clearly visible and avoid blur.",
      tips: [
        t.upload?.recoveryTipHighlightRow || "Make sure your row is visible in full width.",
        t.upload?.recoveryTipContrast || "Increase contrast/brightness if UI is too dark.",
      ],
    };
  }
  if (code === "ocr_failed") {
    return {
      title: t.upload?.recoveryTitle || "How to recover",
      text:
        t.upload?.recoveryOcr ||
        "OCR failed. Retry with better contrast, no crop, and original screenshot scale.",
      tips: [
        t.upload?.recoveryTipOriginalScale || "Use original scale screenshot.",
        t.upload?.recoveryTipCleanUi || "Hide overlays/popups before screenshot.",
      ],
    };
  }
  if (code === "manual_skipped") {
    return {
      title: t.upload?.recoveryTitle || "How to recover",
      text:
        t.upload?.recoveryManual ||
        "Result was skipped. Start scan again and select Victory/Defeat in manual step.",
      tips: [
        t.upload?.recoveryTipManualChoice || "On manual step choose Victory or Defeat.",
      ],
    };
  }
  if (code === "already_uploaded") {
    return {
      title: t.upload?.recoveryTitle || "How to recover",
      text:
        t.upload?.recoveryDuplicate ||
        "This match is already uploaded. Use a newer match screenshot.",
      tips: [
        t.upload?.recoveryTipNewMatch || "Upload a newer match not present in history.",
      ],
    };
  }
  if (code === "banned") {
    return {
      title: t.upload?.recoveryTitle || "How to recover",
      text:
        t.upload?.recoveryBanned ||
        "Upload is blocked for this account. Contact support if you think this is a mistake.",
      tips: [
        t.upload?.recoveryTipContact || "Open support request with your UID and screenshot.",
      ],
    };
  }
  if (code === "backend_unavailable") {
    return {
      title: t.upload?.recoveryTitle || "How to recover",
      text:
        t.upload?.recoveryNetwork ||
        "Service is temporarily unavailable. Retry in a minute or check your connection.",
      tips: [
        t.upload?.recoveryTipRetryLater || "Retry after 30-60 seconds.",
        t.upload?.recoveryTipCheckNet || "Check internet/VPN/proxy settings.",
      ],
    };
  }
  return generic;
}
