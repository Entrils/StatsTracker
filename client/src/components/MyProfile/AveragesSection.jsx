import styles from "@/pages/MyProfile/MyProfile.module.css";
import Stat from "@/components/MyProfile/StatCard";
import {
  IconAssists,
  IconDamage,
  IconDamageShare,
  IconDeaths,
  IconKda,
  IconKills,
  IconScore,
} from "@/components/MyProfile/StatIcons";

export default function AveragesSection({
  t,
  summary,
  sparkScore,
  sparkKda,
  showRanks,
  globalRanks,
}) {
  const buildRangeStyle = (value, min, max) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || max <= min) {
      return { width: "2%", background: "linear-gradient(90deg, hsl(0 85% 55%), #f5f5f5)" };
    }

    const clamped = Math.max(min, Math.min(max, numeric));
    const ratio = (clamped - min) / (max - min);
    const minWidthPct = 2;
    const widthPct = Math.round((minWidthPct + ratio * (100 - minWidthPct)) * 10) / 10;
    const hue = Math.round(120 * ratio);

    return {
      width: `${widthPct}%`,
      background: `linear-gradient(90deg, hsl(${hue} 85% 55%), #f5f5f5)`,
    };
  };

  const scoreStyle = buildRangeStyle(summary.avgScoreRaw, 4000, 10000);
  const kdaStyle = buildRangeStyle(summary.kdaRaw, 1.5, 3.5);
  const damageStyle = buildRangeStyle(summary.avgDamageRaw, 800, 2000);

  return (
    <div className={`${styles.statsSection} ${styles.denseCard} ${styles.fadeIn} ${styles.stagger2}`}>
      <div className={styles.statsHeader}>
        <h2 className={styles.statsTitle}>{t.me?.averages || "Averages"}</h2>
        <p className={styles.statsSubtitle}>
          {t.me?.averagesHint || "Per-match performance"}
        </p>
      </div>
      <div className={styles.statStrip}>
        <div className={styles.stripItem}>
          <span className={styles.stripLabel}>{t.me?.score || "Score"}</span>
          <span className={styles.stripValue}>{summary.avgScore}</span>
          <span className={styles.stripBar}>
            <span className={styles.stripFill} style={scoreStyle} />
          </span>
        </div>
        <div className={styles.stripItem}>
          <span className={styles.stripLabel}>{t.me?.kda || "KDA"}</span>
          <span className={styles.stripValue}>{summary.kda}</span>
          <span className={styles.stripBar}>
            <span className={styles.stripFill} style={kdaStyle} />
          </span>
        </div>
        <div className={styles.stripItem}>
          <span className={styles.stripLabel}>{t.me?.damage || "Damage"}</span>
          <span className={styles.stripValue}>{summary.avgDamage}</span>
          <span className={styles.stripBar}>
            <span className={styles.stripFill} style={damageStyle} />
          </span>
        </div>
      </div>
      <div className={styles.statsMosaicWide}>
        <Stat
          label={t.me?.score || "Score"}
          value={summary.avgScore}
          icon={<IconScore />}
          variant="hero"
          trend={sparkScore}
          bar={{ value: summary.avgScore, max: summary.bestScore?.score || 1 }}
          rank={showRanks ? globalRanks?.avgScore : null}
          rankLabel={t.me?.topPercent || "Top"}
        />
        <Stat
          label={t.me?.kda || "KDA"}
          value={summary.kda}
          icon={<IconKda />}
          variant="hero"
          trend={sparkKda}
          bar={{ value: summary.kda, max: summary.maxKda || 1 }}
          rank={showRanks ? globalRanks?.kda : null}
          rankLabel={t.me?.topPercent || "Top"}
        />
        <Stat
          label={t.me?.kills || "Kills"}
          value={summary.avgKills}
          icon={<IconKills />}
          variant="compact"
          bar={{ value: summary.avgKills, max: summary.maxKills?.kills || 1 }}
          rank={showRanks ? globalRanks?.avgKills : null}
          rankLabel={t.me?.topPercent || "Top"}
        />
        <Stat
          label={t.me?.deaths || "Deaths"}
          value={summary.avgDeaths}
          icon={<IconDeaths />}
          variant="compact"
          bar={{ value: summary.avgDeaths, max: summary.maxDeaths?.deaths || 1 }}
          rank={showRanks ? globalRanks?.avgDeaths : null}
          rankLabel={t.me?.topPercent || "Top"}
        />
        <Stat
          label={t.me?.assists || "Assists"}
          value={summary.avgAssists}
          icon={<IconAssists />}
          variant="compact"
          bar={{ value: summary.avgAssists, max: summary.maxAssists?.assists || 1 }}
          rank={showRanks ? globalRanks?.avgAssists : null}
          rankLabel={t.me?.topPercent || "Top"}
        />
        <Stat
          label={t.me?.damage || "Damage"}
          value={summary.avgDamage}
          icon={<IconDamage />}
          variant="compact"
          bar={{ value: summary.avgDamage, max: summary.maxDamage?.damage || 1 }}
          rank={showRanks ? globalRanks?.avgDamage : null}
          rankLabel={t.me?.topPercent || "Top"}
        />
        <Stat
          label={t.me?.damageShare || "Dmg share"}
          value={`${summary.avgDamageShare}%`}
          icon={<IconDamageShare />}
          variant="compact"
          bar={{ value: summary.avgDamageShare, max: 100 }}
          rank={showRanks ? globalRanks?.avgDamageShare : null}
          rankLabel={t.me?.topPercent || "Top"}
        />
      </div>
    </div>
  );
}
