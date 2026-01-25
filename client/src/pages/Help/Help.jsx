import styles from "@/pages/Help/Help.module.css";
import { useLang } from "@/i18n/LanguageContext";

export default function Help() {
  const { t } = useLang();

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t.help?.title || "Help"}</h1>
        <p className={styles.subtitle}>
          {t.help?.subtitle ||
            "Short guides on uploading screenshots and using profile buttons."}
        </p>
      </div>

      <div className={styles.content}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {t.help?.uploadTitle || "How to upload a screenshot"}
          </h2>
          <p className={styles.sectionText}>
            {t.help?.uploadBody ||
              "Use full-screen PNG/JPG for best OCR quality."}
          </p>
          {Array.isArray(t.help?.uploadSteps) && (
            <ol className={styles.list}>
              {t.help.uploadSteps.map((item, idx) => (
                <li key={`upload-step-${idx}`}>{item}</li>
              ))}
            </ol>
          )}
          {Array.isArray(t.help?.uploadTips) && (
            <ul className={styles.listMuted}>
              {t.help.uploadTips.map((item, idx) => (
                <li key={`upload-tip-${idx}`}>{item}</li>
              ))}
            </ul>
          )}
          <div className={styles.imageWrap}>
            <img
              src="/screenshotGuide.png"
              alt={t.help?.uploadAlt || "Screenshot upload guide"}
              loading="lazy"
            />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {t.help?.profileTitle || "Profile buttons"}
          </h2>
          <p className={styles.sectionText}>
            {t.help?.profileBody ||
              "Where to find share, friends, and comparison actions."}
          </p>
          {Array.isArray(t.help?.profileButtons) && (
            <ul className={styles.list}>
              {t.help.profileButtons.map((item, idx) => (
                <li key={`profile-btn-${idx}`}>{item}</li>
              ))}
            </ul>
          )}
          {Array.isArray(t.help?.profileTips) && (
            <ul className={styles.listMuted}>
              {t.help.profileTips.map((item, idx) => (
                <li key={`profile-tip-${idx}`}>{item}</li>
              ))}
            </ul>
          )}
          <div className={styles.imageWrap}>
            <img
              src="/ProfileGuide.png"
              alt={t.help?.profileAlt || "Profile actions guide"}
              loading="lazy"
            />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {t.help?.playerProfileTitle || "Player profile"}
          </h2>
          <p className={styles.sectionText}>
            {t.help?.playerProfileBody ||
              "How to read the player profile and use its actions."}
          </p>
          {Array.isArray(t.help?.playerProfileSteps) && (
            <ol className={styles.list}>
              {t.help.playerProfileSteps.map((item, idx) => (
                <li key={`player-profile-step-${idx}`}>{item}</li>
              ))}
            </ol>
          )}
          {Array.isArray(t.help?.playerProfileTips) && (
            <ul className={styles.listMuted}>
              {t.help.playerProfileTips.map((item, idx) => (
                <li key={`player-profile-tip-${idx}`}>{item}</li>
              ))}
            </ul>
          )}
          <div className={styles.imageWrap}>
            <img
              src="/PlayerProfileGuide.png"
              alt={t.help?.playerProfileAlt || "Player profile guide"}
              loading="lazy"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
