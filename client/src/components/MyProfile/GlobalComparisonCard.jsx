import styles from "@/pages/MyProfile/MyProfile.module.css";
import CompareRow from "@/components/MyProfile/CompareRow";

export default function GlobalComparisonCard({
  t,
  loadingGlobal,
  vsGlobal,
  summary,
  sign,
  diffAccent,
}) {
  return (
    <div className={`${styles.card} ${styles.fadeIn} ${styles.stagger3}`}>
      <h2 className={styles.cardTitle}>
        {t.me?.vsGlobal || "vs Global average"}
        {!loadingGlobal && vsGlobal?.globalSample ? (
          <span className={styles.smallNote}>
            {" "}
            ({t.me?.globalSample || "sample"}: {vsGlobal.globalSample})
          </span>
        ) : null}
      </h2>

      {loadingGlobal && (
        <p className={styles.hint}>
          {t.me?.globalLoading || "Loading global averages..."}
        </p>
      )}

      {!loadingGlobal && !vsGlobal && (
        <p className={styles.hint}>
          {t.me?.globalUnavailable || "Global averages unavailable yet."}
        </p>
      )}

      {!loadingGlobal && vsGlobal && (
        <div className={styles.compareGrid}>
          <CompareRow
            label={t.me?.score || "Score"}
            you={summary.avgScore}
            global={vsGlobal.global.avgScore}
            delta={vsGlobal.delta.score}
            accent={diffAccent(vsGlobal.delta.score, true)}
            compareSep={t.me?.compareSep || "vs"}
          />
          <CompareRow
            label={t.me?.kills || "Kills"}
            you={summary.avgKills}
            global={vsGlobal.global.avgKills}
            delta={vsGlobal.delta.kills}
            accent={diffAccent(vsGlobal.delta.kills, true)}
            compareSep={t.me?.compareSep || "vs"}
          />
          <CompareRow
            label={t.me?.deaths || "Deaths"}
            you={summary.avgDeaths}
            global={vsGlobal.global.avgDeaths}
            delta={vsGlobal.delta.deaths}
            accent={diffAccent(vsGlobal.delta.deaths, false)}
            compareSep={t.me?.compareSep || "vs"}
          />
          <CompareRow
            label={t.me?.assists || "Assists"}
            you={summary.avgAssists}
            global={vsGlobal.global.avgAssists}
            delta={vsGlobal.delta.assists}
            accent={diffAccent(vsGlobal.delta.assists, true)}
            compareSep={t.me?.compareSep || "vs"}
          />
          <CompareRow
            label={t.me?.damage || "Damage"}
            you={summary.avgDamage}
            global={vsGlobal.global.avgDamage}
            delta={vsGlobal.delta.damage}
            accent={diffAccent(vsGlobal.delta.damage, true)}
            compareSep={t.me?.compareSep || "vs"}
          />
          <CompareRow
            label={t.me?.damageShare || "Dmg share"}
            you={`${summary.avgDamageShare}%`}
            global={`${vsGlobal.global.avgDamageShare}%`}
            delta={`${sign(vsGlobal.delta.damageShare)}${vsGlobal.delta.damageShare}%`}
            accent={diffAccent(vsGlobal.delta.damageShare, true)}
            compareSep={t.me?.compareSep || "vs"}
          />
          <CompareRow
            label={t.me?.kda || "KDA"}
            you={summary.kda}
            global={vsGlobal.global.kda}
            delta={`${sign(vsGlobal.delta.kda)}${vsGlobal.delta.kda}`}
            accent={diffAccent(vsGlobal.delta.kda, true)}
            compareSep={t.me?.compareSep || "vs"}
          />
        </div>
      )}
    </div>
  );
}

