import styles from "@/pages/MyProfile/MyProfile.module.css";
import Record from "@/components/MyProfile/Record";
import { formatDate } from "@/utils/myProfile/formatters";

export default function RecordsCard({ t, summary }) {
  return (
    <div className={`${styles.card} ${styles.fadeIn} ${styles.stagger5}`}>
      <h2 className={styles.cardTitle}>{t.me?.records || "Records"}</h2>
      <div className={styles.recordsGrid}>
        <Record
          label={t.me?.bestScore || "Best score"}
          value={summary.bestScore.score}
          sub={formatDate(summary.bestScore.createdAt, t.me?.unknown || "-")}
        />
        <Record
          label={t.me?.worstScore || "Worst score"}
          value={summary.worstScore.score}
          sub={formatDate(summary.worstScore.createdAt, t.me?.unknown || "-")}
        />
        <Record
          label={t.me?.maxKills || "Max kills"}
          value={summary.maxKills.kills}
          sub={formatDate(summary.maxKills.createdAt, t.me?.unknown || "-")}
        />
        <Record
          label={t.me?.maxDamage || "Max damage"}
          value={summary.maxDamage.damage}
          sub={formatDate(summary.maxDamage.createdAt, t.me?.unknown || "-")}
        />
      </div>
    </div>
  );
}
