import styles from "@/pages/Roadmap/Roadmap.module.css";
import { useLang } from "@/i18n/LanguageContext";
import Badge from "@/components/ui/Badge";
import SurfaceCard from "@/components/ui/SurfaceCard";

export default function Roadmap() {
  const { t } = useLang();

  const sections = [
    {
      key: "soon",
      status: "SOON",
      statusHint: t.roadmap?.soonHint || t.roadmap?.soon || "Soon",
      tone: "soon",
      rows: t.roadmap?.soonItems || [
        "Fix text encoding issues",
        "OCR error clarity + hints",
        "Smoke tests for core API",
      ],
    },
    {
      key: "inProgress",
      status: "IN PROGRESS",
      statusHint:
        t.roadmap?.inProgressHint || t.roadmap?.inProgress || "In progress",
      tone: "progress",
      rows: t.roadmap?.inProgressItems || [
        "Help/FAQ expansion",
        "New empty states with CTA",
        "Release notes page",
      ],
    },
    {
      key: "inFuture",
      status: "IN FUTURE",
      statusHint: t.roadmap?.inFutureHint || t.roadmap?.inFuture || "In future",
      tone: "future",
      rows: t.roadmap?.inFutureItems || [
        "Weekly growth leaderboard",
        "More achievement categories",
        "OCR queue for peak load",
      ],
    },
    {
      key: "wishlist",
      status: "WISHLIST",
      statusHint: t.roadmap?.wishlistHint || t.roadmap?.wishlist || "Wishlist",
      tone: "wishlist",
      rows: t.roadmap?.wishlistItems || [
        "Team/clan pages",
        "Season rewind reports",
        "Public API for stats",
      ],
    },
  ];

  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>
        {t.roadmap?.title || "Project Roadmap"}
      </h1>
      <p className={styles.subtitle}>
        {t.roadmap?.subtitle || "Planned updates focused on player experience"}
      </p>

      <SurfaceCard className={styles.feedback}>
        <div className={styles.feedbackTitle}>
          {t.roadmap?.feedbackTitle || "We value your feedback"}
        </div>
        <div className={styles.feedbackText}>
          {t.roadmap?.feedbackLine1 ||
            "These plans are based on what users ask for most often."}
        </div>
        <div className={styles.feedbackText}>
          {t.roadmap?.feedbackLine2 ||
            "If you have ideas, write to us in support and we will consider them."}
        </div>
      </SurfaceCard>

      <div className={styles.flow}>
        {sections.map((section, idx) => (
          <div key={section.status} className={styles.flowItem}>
            <SurfaceCard className={`${styles.table} ${styles[section.tone]}`}>
              <div className={styles.tableHead}>
                <Badge
                  className={styles.statusBadge}
                  tone={section.tone}
                  title={section.statusHint}
                  aria-label={section.statusHint}
                >
                  <span className={styles.statusDot} />
                  {section.status}
                </Badge>
                <span className={styles.statusCount}>{section.rows.length}</span>
              </div>
              <ul className={styles.taskList}>
                {section.rows.map((row) => (
                  <li key={`${section.key}-${row}`} className={styles.taskItem}>
                    {row}
                  </li>
                ))}
              </ul>
            </SurfaceCard>
            {idx < sections.length - 1 && (
              <div className={styles.arrow} aria-hidden="true">
                <span className={styles.arrowLine} />
                <span className={styles.arrowHead} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
