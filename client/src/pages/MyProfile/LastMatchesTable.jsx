import styles from "@/pages/MyProfile/MyProfile.module.css";

export default function LastMatchesTable({
  matches = [],
  t,
  round1,
  formatTimeAgo,
  lang,
  avgKda = 0,
  title,
}) {
  const getKda = (m) => round1((Number(m.kills || 0) + Number(m.assists || 0)) / Math.max(1, Number(m.deaths || 0)));
  const getKdaToneStyle = (kda) => {
    const value = Number(kda);
    if (!Number.isFinite(value)) return undefined;

    if (value > 2) {
      const maxValue = 2 * 1.5;
      const intensity = Math.max(0, Math.min(1, (value - 2) / (maxValue - 2)));
      const lightness = Math.round(68 - intensity * 26);
      const alpha = (0.14 + intensity * 0.34).toFixed(2);
      return {
        color: `hsl(120 78% ${lightness}%)`,
        fontWeight: 800,
        textShadow: `0 0 ${Math.round(6 + intensity * 10)}px rgba(80, 255, 140, ${alpha})`,
      };
    }

    const avg = Number(avgKda);
    if (Number.isFinite(avg) && avg > 0 && value < avg) {
      const minValue = avg * 0.5;
      const intensity = Math.max(0, Math.min(1, (avg - value) / (avg - minValue)));
      const lightness = Math.round(74 - intensity * 28);
      const alpha = (0.14 + intensity * 0.34).toFixed(2);
      return {
        color: `hsl(0 85% ${lightness}%)`,
        fontWeight: 800,
        textShadow: `0 0 ${Math.round(6 + intensity * 10)}px rgba(255, 60, 80, ${alpha})`,
      };
    }

    return undefined;
  };

  return (
    <div className={`${styles.card} ${styles.fadeIn}`}>
      <h2 className={styles.cardTitle}>{title || t.me?.lastMatches || "Last matches"}</h2>
      {!matches.length ? (
        <p className={styles.hint}>{t.me?.matchesEmptyFiltered || "No matches for selected filters"}</p>
      ) : null}
      {matches.length ? (
        <>
          <div className={`${styles.tableWrap} ${styles.matchesTableWrap}`}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t.me?.index || "#"}</th>
                  <th>{t.me?.result || "Result"}</th>
                  <th>{t.me?.score || "Score"}</th>
                  <th>{t.me?.kills || "Kills"}</th>
                  <th>{t.me?.deaths || "Deaths"}</th>
                  <th>{t.me?.assists || "Assists"}</th>
                  <th className={styles.kdaHeader}>{t.me?.kda || "KDA"}</th>
                  <th>{t.me?.damage || "Damage"}</th>
                  <th>{t.me?.damageShare || "Dmg%"}</th>
                  <th>{t.me?.date || "Date"}</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr className={styles.matchRow} key={m.id || `${m.ownerUid}-${m.createdAt}-${m.index}`}>
                    <td className={styles.metricCell}>{m.index}</td>

                    <td className={styles.resultCell}>
                      <span
                        className={`${styles.resultBadge} ${
                          m.result === "victory"
                            ? styles.resultBadgeWin
                            : m.result === "defeat"
                            ? styles.resultBadgeLoss
                            : styles.resultBadgeNeutral
                        }`}
                      >
                        {m.result === "victory"
                          ? t.me?.win || "WIN"
                          : m.result === "defeat"
                          ? t.me?.loss || "LOSS"
                          : t.me?.unknown || "-"}
                      </span>
                    </td>

                    <td className={styles.metricCell}>{m.score}</td>
                    <td className={`${styles.metricCell} ${styles.centerCell}`}>{m.kills}</td>
                    <td className={`${styles.metricCell} ${styles.centerCell}`}>{m.deaths}</td>
                    <td className={`${styles.metricCell} ${styles.centerCell}`}>{m.assists}</td>
                    <td className={styles.kdaCell}>
                      <span className={styles.kdaBadge} style={getKdaToneStyle(getKda(m))}>
                        {getKda(m)}
                      </span>
                    </td>
                    <td className={styles.metricCell}>{m.damage}</td>
                    <td className={styles.metricCell}>{round1(m.damageShare)}%</td>
                    <td className={styles.dateCell}>
                      <span className={styles.dateBadge}>
                        {formatTimeAgo(m.createdAt, t.me?.unknown || "-", lang)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.mobileList}>
            {matches.map((m) => (
              <div className={styles.matchCard} key={m.id || `${m.ownerUid}-${m.createdAt}-${m.index}`}>
                <div className={styles.matchHeader}>
                  <span className={styles.matchIndex}>#{m.index}</span>
                  <span
                    className={`${styles.matchResult} ${
                      m.result === "victory"
                        ? styles.good
                        : m.result === "defeat"
                        ? styles.bad
                        : ""
                    }`}
                  >
                    {m.result === "victory"
                      ? t.me?.win || "WIN"
                      : m.result === "defeat"
                      ? t.me?.loss || "LOSS"
                      : t.me?.unknown || "-"}
                  </span>
                  <span className={styles.matchDate}>
                    {formatTimeAgo(m.createdAt, t.me?.unknown || "-", lang)}
                  </span>
                </div>
                <div className={styles.matchStats}>
                  <div className={styles.matchItem}>
                    <span className={styles.matchLabel}>{t.me?.score || "Score"}</span>
                    <span className={styles.matchValue}>{m.score}</span>
                  </div>
                  <div className={styles.matchItem}>
                    <span className={styles.matchLabel}>{t.me?.kills || "Kills"}</span>
                    <span className={styles.matchValue}>{m.kills}</span>
                  </div>
                  <div className={styles.matchItem}>
                    <span className={styles.matchLabel}>{t.me?.deaths || "Deaths"}</span>
                    <span className={styles.matchValue}>{m.deaths}</span>
                  </div>
                  <div className={styles.matchItem}>
                    <span className={styles.matchLabel}>{t.me?.assists || "Assists"}</span>
                    <span className={styles.matchValue}>{m.assists}</span>
                  </div>
                  <div className={styles.matchItem}>
                    <span className={styles.matchLabel}>{t.me?.kda || "KDA"}</span>
                    <span className={styles.matchValue} style={getKdaToneStyle(getKda(m))}>
                      {getKda(m)}
                    </span>
                  </div>
                  <div className={styles.matchItem}>
                    <span className={styles.matchLabel}>{t.me?.damage || "Damage"}</span>
                    <span className={styles.matchValue}>{m.damage}</span>
                  </div>
                  <div className={styles.matchItem}>
                    <span className={styles.matchLabel}>{t.me?.damageShare || "Dmg%"}</span>
                    <span className={styles.matchValue}>{round1(m.damageShare)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
