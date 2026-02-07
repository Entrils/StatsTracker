import styles from "@/pages/MyProfile/MyProfile.module.css";
import Stat from "@/components/MyProfile/StatCard";
import { IconLoss, IconMatches, IconRate, IconWin } from "@/components/MyProfile/StatIcons";

export default function OverviewSection({
  t,
  summary,
  sparkScore,
  sparkWinrate,
  showRanks,
  globalRanks,
}) {
  return (
    <div className={`${styles.statsSection} ${styles.fadeIn} ${styles.stagger1}`}>
      <div className={styles.statsHeader}>
        <h2 className={styles.statsTitle}>{t.me?.overview || "Overview"}</h2>
        <p className={styles.statsSubtitle}>
          {t.me?.overviewHint || "Match results and consistency"}
        </p>
      </div>
      <div className={styles.statStrip}>
        <div className={styles.stripItem}>
          <span className={styles.stripLabel}>{t.me?.matches || "Matches"}</span>
          <span className={styles.stripValue}>{summary.matchesCount}</span>
          <span className={styles.stripBar}>
            <span
              className={styles.stripFill}
              style={{
                width: "100%",
                background: "linear-gradient(90deg, #00f5d4, #a3ff12)",
              }}
            />
          </span>
        </div>
        <div className={styles.stripItem}>
          <span className={styles.stripLabel}>{t.me?.wins || "Wins"}</span>
          <span className={styles.stripValue}>{summary.wins}</span>
          <span className={styles.stripBar}>
            <span
              className={styles.stripFill}
              style={{
                width: `${Math.min(100, summary.winrate)}%`,
                background: "linear-gradient(90deg, #00f5d4, #a3ff12)",
              }}
            />
          </span>
        </div>
        <div className={styles.stripItem}>
          <span className={styles.stripLabel}>{t.me?.winrate || "Winrate"}</span>
          <span className={styles.stripValue}>{summary.winrate}%</span>
          <span className={styles.stripBar}>
            <span
              className={styles.stripFill}
              style={{
                width: `${Math.min(100, summary.winrate)}%`,
                background: "linear-gradient(90deg, #00f5d4, #a3ff12)",
              }}
            />
          </span>
        </div>
      </div>
      <div className={styles.statsMosaic}>
        <Stat
          label={t.me?.matches || "Matches"}
          value={summary.matchesCount}
          icon={<IconMatches />}
          variant="hero"
          trend={sparkScore}
          bar={{ value: summary.matchesCount, max: summary.matchesCount || 1 }}
          rank={showRanks ? globalRanks?.matches : null}
          rankLabel={t.me?.topPercent || "Top"}
        />
        <Stat
          label={t.me?.winrate || "Winrate"}
          value={`${summary.winrate}%`}
          icon={<IconRate />}
          accent="rate"
          variant="hero"
          trend={sparkWinrate}
          bar={{ value: summary.winrate, max: 100 }}
          rank={showRanks ? globalRanks?.winrate : null}
          rankLabel={t.me?.topPercent || "Top"}
        />
        <Stat
          label={t.me?.wins || "Wins"}
          value={summary.wins}
          icon={<IconWin />}
          accent="win"
          variant="compact"
          bar={{ value: summary.wins, max: summary.matchesCount || 1 }}
          rank={showRanks ? globalRanks?.wins : null}
          rankLabel={t.me?.topPercent || "Top"}
        />
        <Stat
          label={t.me?.losses || "Losses"}
          value={summary.losses}
          icon={<IconLoss />}
          accent="loss"
          variant="compact"
          bar={{ value: summary.losses, max: summary.matchesCount || 1 }}
          rank={showRanks ? globalRanks?.losses : null}
          rankLabel={t.me?.topPercent || "Top"}
        />
      </div>
    </div>
  );
}

