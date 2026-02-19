import styles from "@/components/Achievements/Achievements.module.css";
import { buildAchievements } from "@/utils/achievements";
import { useLang } from "@/i18n/LanguageContext";

const formatDate = (ts) => {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleDateString();
  } catch {
    return "";
  }
};

const labels = (t) => ({
  matches: t.achievements?.matchesTitle || "Uploaded matches",
  friends: t.achievements?.friendsTitle || "Friends",
  kills: t.achievements?.killsTitle || "Max kills",
  streak: t.achievements?.streakTitle || "Win streak",
});

const valueLabel = (key, value, t) => {
  if (key === "matches") {
    return `${value} ${t.achievements?.matchesLabel || "matches"}`;
  }
  if (key === "friends") {
    return `${value} ${t.achievements?.friendsLabel || "friends"}`;
  }
  if (key === "kills") {
    return `${value} ${t.achievements?.killsLabel || "kills"}`;
  }
  return `${value} ${t.achievements?.streakLabel || "wins"}`;
};

export default function Achievements({
  matches = [],
  friends = [],
  friendDates = [],
  friendCount = null,
  friendMilestones = null,
  mode = "full",
}) {
  const { t } = useLang();
  const data = buildAchievements({ matches, friends, friendDates, friendCount, friendMilestones });
  const titles = labels(t);
  const isSummary = mode === "summary";

  const summaryItems = Object.entries(data)
    .map(([key, items]) => {
      const unlocked = items.filter((i) => i.unlocked);
      if (!unlocked.length) return null;
      const best = unlocked[unlocked.length - 1];
      return { key, item: best, title: titles[key] };
    })
    .filter(Boolean);

  if (isSummary) {
    return (
      <div className={styles.wrapper}>
        <section className={`${styles.section} ${styles.summarySection}`}>
          <h3 className={`${styles.sectionTitle} ${styles.summaryTitle}`}>
            {t.achievements?.summaryTitle || "Best achievements"}
          </h3>
          {summaryItems.length ? (
            <div className={`${styles.grid} ${styles.summaryGrid}`}>
              {summaryItems.map(({ key, item, title }) => (
                <div key={key} className={`${styles.item} ${styles.summaryItem}`}>
                  <img
                    src={item.image}
                    alt={valueLabel(key, item.value, t)}
                    className={styles.icon}
                    loading="lazy"
                  />
                  <div className={styles.label}>{title}</div>
                  <div className={`${styles.meta} ${styles.summaryMeta}`}>
                    {valueLabel(key, item.value, t)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.meta}>
              {t.achievements?.summaryEmpty || "No achievements yet"}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {Object.entries(data).map(([key, items]) => (
        <section key={key} className={styles.section}>
          <h3 className={styles.sectionTitle}>{titles[key]}</h3>
          <div className={styles.grid}>
            {items.map((item) => (
              <div
                key={`${key}-${item.value}`}
                className={`${styles.item} ${item.unlocked ? "" : styles.locked}`}
              >
                <img
                  src={item.image}
                  alt={valueLabel(key, item.value, t)}
                  className={styles.icon}
                  loading="lazy"
                />
                <div className={styles.label}>{valueLabel(key, item.value, t)}</div>
                {item.unlocked ? (
                  <div className={styles.meta}>
                    {t.achievements?.unlockedAt || "Unlocked"}:{" "}
                    {formatDate(item.unlockedAt)}
                  </div>
                ) : (
                  <div className={styles.progress}>
                    <div className={styles.bar}>
                      <div
                        className={styles.barFill}
                        style={{ width: `${item.progress * 100}%` }}
                      />
                    </div>
                    <div className={styles.progressText}>
                      {t.achievements?.remaining || "Remaining"}:{" "}
                      {item.remaining}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
