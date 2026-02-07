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
  globalMatchMeans,
  perfColor,
  perfWidth,
  safeDiv,
}) {
  return (
    <div className={`${styles.statsSection} ${styles.fadeIn} ${styles.stagger2}`}>
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
            <span
              className={styles.stripFill}
              style={
                globalMatchMeans?.avgScore
                  ? {
                      width: perfWidth(summary.avgScoreRaw / globalMatchMeans.avgScore),
                      background: `linear-gradient(90deg, ${perfColor(
                        summary.avgScoreRaw / globalMatchMeans.avgScore
                      )}, #f5f5f5)`,
                    }
                  : {
                      width: `${Math.min(
                        100,
                        safeDiv(summary.avgScore * 100, summary.bestScore?.score || 1)
                      )}%`,
                    }
              }
            />
          </span>
        </div>
        <div className={styles.stripItem}>
          <span className={styles.stripLabel}>{t.me?.kda || "KDA"}</span>
          <span className={styles.stripValue}>{summary.kda}</span>
          <span className={styles.stripBar}>
            <span
              className={styles.stripFill}
              style={
                globalMatchMeans?.kda
                  ? {
                      width: perfWidth(summary.kdaRaw / globalMatchMeans.kda),
                      background: `linear-gradient(90deg, ${perfColor(
                        summary.kdaRaw / globalMatchMeans.kda
                      )}, #f5f5f5)`,
                    }
                  : {
                      width: `${Math.min(100, safeDiv(summary.kda * 100, summary.maxKda || 1))}%`,
                    }
              }
            />
          </span>
        </div>
        <div className={styles.stripItem}>
          <span className={styles.stripLabel}>{t.me?.damage || "Damage"}</span>
          <span className={styles.stripValue}>{summary.avgDamage}</span>
          <span className={styles.stripBar}>
            <span
              className={styles.stripFill}
              style={
                globalMatchMeans?.avgDamage
                  ? {
                      width: perfWidth(summary.avgDamageRaw / globalMatchMeans.avgDamage),
                      background: `linear-gradient(90deg, ${perfColor(
                        summary.avgDamageRaw / globalMatchMeans.avgDamage
                      )}, #f5f5f5)`,
                    }
                  : {
                      width: `${Math.min(
                        100,
                        safeDiv(summary.avgDamage * 100, summary.maxDamage?.damage || 1)
                      )}%`,
                    }
              }
            />
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

