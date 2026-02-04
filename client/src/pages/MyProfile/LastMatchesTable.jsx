import styles from "@/pages/MyProfile/MyProfile.module.css";

export default function LastMatchesTable({ last10, t, round1, formatDate }) {
  return (
    <div className={`${styles.card} ${styles.fadeIn}`}>
      <h2 className={styles.cardTitle}>{t.me?.lastMatches || "Last 10 matches"}</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t.me?.index || "#"}</th>
              <th>{t.me?.result || "Result"}</th>
              <th>{t.me?.score || "Score"}</th>
              <th>{t.me?.kills || "Kills"}</th>
              <th>{t.me?.deaths || "Deaths"}</th>
              <th>{t.me?.assists || "Assists"}</th>
              <th>{t.me?.damage || "Damage"}</th>
              <th>{t.me?.damageShare || "Dmg%"}</th>
              <th>{t.me?.date || "Date"}</th>
            </tr>
          </thead>
          <tbody>
            {last10.map((m) => (
              <tr key={`${m.ownerUid}-${m.createdAt}-${m.index}`}>
                <td>{m.index}</td>

                <td
                  className={
                    m.result === "victory"
                      ? styles.good
                      : m.result === "defeat"
                      ? styles.bad
                      : ""
                  }
                >
                  {m.result === "victory"
                    ? t.me?.win || "WIN"
                    : m.result === "defeat"
                    ? t.me?.loss || "LOSS"
                    : t.me?.unknown || "-"}
                </td>

                <td>{m.score}</td>
                <td>{m.kills}</td>
                <td>{m.deaths}</td>
                <td>{m.assists}</td>
                <td>{m.damage}</td>
                <td>{round1(m.damageShare)}%</td>
                <td>{formatDate(m.createdAt, t.me?.unknown || "-")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.mobileList}>
        {last10.map((m) => (
          <div className={styles.matchCard} key={`${m.ownerUid}-${m.createdAt}-${m.index}`}>
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
                {formatDate(m.createdAt, t.me?.unknown || "-")}
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
    </div>
  );
}
