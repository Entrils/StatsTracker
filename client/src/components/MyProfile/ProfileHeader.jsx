import styles from "@/pages/MyProfile/MyProfile.module.css";

export default function ProfileHeader({
  t,
  summary,
  profileAvatarUrl,
  handleCopyShare,
  shareStatus,
  banInfo,
}) {
  return (
    <>
      <div className={styles.profileHeader}>
        {profileAvatarUrl && (
          <img
            src={profileAvatarUrl}
            alt={summary.name}
            className={styles.avatar}
            loading="lazy"
          />
        )}
        <div className={styles.nameBlock}>
          <div className={styles.nameRow}>
            <h1 className={styles.nickname}>
              {summary.name}{" "}
              <span className={styles.meBadge}>{t.me?.meBadge || "Me"}</span>
            </h1>
            <button
              type="button"
              className={styles.shareButton}
              onClick={handleCopyShare}
              title={t.me?.share || "Share profile"}
              aria-label={t.me?.share || "Share profile"}
            >
              <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
                <path
                  d="M18 16a3 3 0 0 0-2.4 1.2L8.9 13a3.1 3.1 0 0 0 0-2l6.7-4.2A3 3 0 1 0 15 5a3 3 0 0 0 .1.7L8.4 9.9a3 3 0 1 0 0 4.2l6.7 4.2A3 3 0 1 0 18 16Z"
                  fill="currentColor"
                />
              </svg>
            </button>
            {shareStatus && <span className={styles.shareHint}>{shareStatus}</span>}
          </div>
        </div>
      </div>
      {banInfo?.active && (
        <div className={styles.banBanner}>
          <div className={styles.banTitle}>
            {t.me?.bannedTitle || "YOU ARE BANNED"}
          </div>
          <div className={styles.banText}>
            {banInfo?.reason
              ? `${t.me?.bannedReason || "Reason"}: ${banInfo.reason}`
              : t.me?.bannedHint ||
                "You cannot upload screenshots or appear on the leaderboard."}
          </div>
        </div>
      )}
    </>
  );
}

