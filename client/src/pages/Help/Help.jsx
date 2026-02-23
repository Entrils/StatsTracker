import styles from "@/pages/Help/Help.module.css";
import { useLang } from "@/i18n/LanguageContext";

export default function Help() {
  const { t } = useLang();
  const joinParagraph = (items) =>
    Array.isArray(items) ? items.filter(Boolean).join(" ") : "";
  const paragraphOrJoin = (paragraphKey, listKey) => {
    const direct = t.help?.[paragraphKey];
    if (typeof direct === "string" && direct.trim()) return direct;
    return joinParagraph(t.help?.[listKey]);
  };
  const tocItems = [
    { id: "upload-guide", label: t.help?.uploadTitle || "How to upload a screenshot" },
    { id: "profile-buttons", label: t.help?.profileTitle || "Profile buttons" },
    { id: "match-issues", label: t.help?.matchIssuesTitle || "Why match upload failed" },
    { id: "friends-compare", label: t.help?.friendsCompareTitle || "Friends and comparison" },
    { id: "teams-guide", label: t.help?.teamsTitle || "Teams" },
    { id: "tournaments-guide", label: t.help?.tournamentsTitle || "Tournaments" },
    { id: "elo-rating", label: t.help?.eloTitle || "ELO rating" },
    { id: "player-profile-guide", label: t.help?.playerProfileTitle || "Player profile" },
    { id: "bug-report", label: t.help?.bugReportTitle || "How to report a bug" },
  ];

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t.help?.title || "Help"}</h1>
      </div>

      <nav className={styles.toc} aria-label={t.help?.tocTitle || "Contents"}>
        <h2 className={styles.tocTitle}>{t.help?.tocTitle || "Contents"}</h2>
        <ul className={styles.tocList}>
          {tocItems.map((item) => (
            <li key={item.id}>
              <a className={styles.tocLink} href={`#${item.id}`}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className={styles.content}>
        <section className={styles.section} id="upload-guide">
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIndex}>1.</span>{" "}
            {t.help?.uploadTitle || "How to upload a screenshot"}
          </h2>
          <p className={styles.sectionText}>
            {t.help?.uploadBody ||
              "Use full-screen PNG/JPG for best OCR quality."}
          </p>
          {((Array.isArray(t.help?.uploadSteps) && t.help.uploadSteps.length) ||
            (typeof t.help?.uploadStepsText === "string" && t.help.uploadStepsText.trim())) && (
            <p className={styles.sectionText}>
              {paragraphOrJoin("uploadStepsText", "uploadSteps")}
            </p>
          )}
          {((Array.isArray(t.help?.uploadTips) && t.help.uploadTips.length) ||
            (typeof t.help?.uploadTipsText === "string" && t.help.uploadTipsText.trim())) && (
            <p className={styles.sectionTextMuted}>
              {paragraphOrJoin("uploadTipsText", "uploadTips")}
            </p>
          )}
          <div className={styles.imageWrap}>
            <img
              src="/screenshotGuide.png"
              alt={t.help?.uploadAlt || "Screenshot upload guide"}
              loading="lazy"
            />
          </div>
        </section>

        <section className={styles.section} id="profile-buttons">
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIndex}>2.</span>{" "}
            {t.help?.profileTitle || "Profile buttons"}
          </h2>
          <p className={styles.sectionText}>
            {t.help?.profileBody ||
              "Where to find share, friends, and comparison actions."}
          </p>
          {((Array.isArray(t.help?.profileButtons) && t.help.profileButtons.length) ||
            (typeof t.help?.profileButtonsText === "string" &&
              t.help.profileButtonsText.trim())) && (
            <p className={styles.sectionText}>
              {paragraphOrJoin("profileButtonsText", "profileButtons")}
            </p>
          )}
          {((Array.isArray(t.help?.profileTips) && t.help.profileTips.length) ||
            (typeof t.help?.profileTipsText === "string" &&
              t.help.profileTipsText.trim())) && (
            <p className={styles.sectionTextMuted}>
              {paragraphOrJoin("profileTipsText", "profileTips")}
            </p>
          )}
          <div className={styles.imageWrap}>
            <img
              src="/ProfileGuide.png"
              alt={t.help?.profileAlt || "Profile actions guide"}
              loading="lazy"
            />
          </div>
        </section>

        <section className={styles.section} id="match-issues">
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIndex}>3.</span>{" "}
            {t.help?.matchIssuesTitle || "Why match upload failed"}
          </h2>
          <p className={styles.sectionText}>
            {t.help?.matchIssuesBody ||
              "Common reasons why OCR upload fails and how to fix them quickly."}
          </p>
          {typeof t.help?.matchIssuesText === "string" && t.help.matchIssuesText.trim() && (
            <p className={styles.sectionText}>{t.help.matchIssuesText}</p>
          )}
        </section>

        <section className={styles.section} id="friends-compare">
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIndex}>4.</span>{" "}
            {t.help?.friendsCompareTitle || "Friends and comparison"}
          </h2>
          <p className={styles.sectionText}>
            {t.help?.friendsCompareBody ||
              "How to add friends, accept requests, and compare stats."}
          </p>
          {typeof t.help?.friendsCompareText === "string" &&
            t.help.friendsCompareText.trim() && (
              <p className={styles.sectionText}>{t.help.friendsCompareText}</p>
            )}
        </section>

        <section className={styles.section} id="teams-guide">
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIndex}>5.</span>{" "}
            {t.help?.teamsTitle || "Teams"}
          </h2>
          <p className={styles.sectionText}>
            {t.help?.teamsBody ||
              "How teams work: roster format, reserve slot, invites, and captain controls."}
          </p>
          {typeof t.help?.teamsText === "string" && t.help.teamsText.trim() && (
            <p className={styles.sectionText}>{t.help.teamsText}</p>
          )}
        </section>

        <section className={styles.section} id="tournaments-guide">
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIndex}>6.</span>{" "}
            {t.help?.tournamentsTitle || "Tournaments"}
          </h2>
          <p className={styles.sectionText}>
            {t.help?.tournamentsBody ||
              "How to join a tournament, check status tabs, open bracket/match room, and report results."}
          </p>
          {typeof t.help?.tournamentsText === "string" && t.help.tournamentsText.trim() && (
            <p className={styles.sectionText}>{t.help.tournamentsText}</p>
          )}
          {Array.isArray(t.help?.tournamentsChecklist) && t.help.tournamentsChecklist.length > 0 && (
            <>
              <p className={styles.sectionText}>
                <strong>{t.help?.tournamentsChecklistTitle || "Pre-match checklist"}</strong>
              </p>
              <ul className={styles.list}>
                {t.help.tournamentsChecklist.map((item, idx) => (
                  <li key={`tournaments-check-${idx}`}>{item}</li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className={styles.section} id="elo-rating">
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIndex}>7.</span>{" "}
            {t.help?.eloTitle || "ELO rating"}
          </h2>
          <p className={styles.sectionText}>
            {t.help?.eloBody ||
              "ELO is a composite rating based on recent ranks and match stats."}
          </p>
          {((Array.isArray(t.help?.eloFactors) && t.help.eloFactors.length) ||
            (typeof t.help?.eloFactorsText === "string" && t.help.eloFactorsText.trim())) && (
            <p className={styles.sectionText}>
              {paragraphOrJoin("eloFactorsText", "eloFactors")}
            </p>
          )}
          {((Array.isArray(t.help?.eloRules) && t.help.eloRules.length) ||
            (typeof t.help?.eloRulesText === "string" && t.help.eloRulesText.trim())) && (
            <p className={styles.sectionTextMuted}>
              {paragraphOrJoin("eloRulesText", "eloRules")}
            </p>
          )}
        </section>

        <section className={styles.section} id="player-profile-guide">
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIndex}>8.</span>{" "}
            {t.help?.playerProfileTitle || "Player profile"}
          </h2>
          <p className={styles.sectionText}>
            {t.help?.playerProfileBody ||
              "How to read the player profile and use its actions."}
          </p>
          {((Array.isArray(t.help?.playerProfileSteps) &&
            t.help.playerProfileSteps.length) ||
            (typeof t.help?.playerProfileStepsText === "string" &&
              t.help.playerProfileStepsText.trim())) && (
            <p className={styles.sectionText}>
              {paragraphOrJoin("playerProfileStepsText", "playerProfileSteps")}
            </p>
          )}
          {((Array.isArray(t.help?.playerProfileTips) && t.help.playerProfileTips.length) ||
            (typeof t.help?.playerProfileTipsText === "string" &&
              t.help.playerProfileTipsText.trim())) && (
            <p className={styles.sectionTextMuted}>
              {paragraphOrJoin("playerProfileTipsText", "playerProfileTips")}
            </p>
          )}
          <div className={styles.imageWrap}>
            <img
              src="/PlayerProfileGuide.png"
              alt={t.help?.playerProfileAlt || "Player profile guide"}
              loading="lazy"
            />
          </div>
        </section>

        <section className={styles.section} id="bug-report">
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIndex}>9.</span>{" "}
            {t.help?.bugReportTitle || "How to report a bug"}
          </h2>
          <p className={styles.sectionText}>
            {t.help?.bugReportBody ||
              "What to include in a bug report so it can be fixed faster."}
          </p>
            {typeof t.help?.bugReportText === "string" && t.help.bugReportText.trim() && (
              <p className={styles.sectionText}>{t.help.bugReportText}</p>
            )}
        </section>

      </div>
    </div>
  );
}
