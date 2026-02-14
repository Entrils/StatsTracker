import styles from "@/pages/MyProfile/MyProfile.module.css";
import Mini from "@/components/MyProfile/Mini";
import CompareRow from "@/components/MyProfile/CompareRow";

export default function DetailsSectionGrid({
  t,
  summary,
  friends,
  friendsLoading,
  friendId,
  setFriendId,
  selectedFriend,
  diffAccent,
  round1,
  sign,
  activity,
  activityLayout,
  activityGridWrapRef,
}) {
  return (
    <div className={`${styles.sectionGrid} ${styles.fadeIn} ${styles.stagger4}`}>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>{t.me?.totals || "Totals"}</h2>
        <div className={styles.twoCol}>
          <Mini label={t.me?.score || "Score"} value={summary.totalScore} />
          <Mini label={t.me?.kills || "Kills"} value={summary.totalKills} />
          <Mini label={t.me?.deaths || "Deaths"} value={summary.totalDeaths} />
          <Mini label={t.me?.assists || "Assists"} value={summary.totalAssists} />
          <Mini label={t.me?.damage || "Damage"} value={summary.totalDamage} />
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>{t.me?.compareTitle || "Compare"}</h2>
        <p className={styles.hint}>
          {t.me?.compareHint || "Compare your stats with a friend"}
        </p>
        <div className={styles.compareSelectWrap}>
          <select
            className={styles.compareSelect}
            value={friendId}
            onChange={(e) => setFriendId(e.target.value)}
            disabled={!friends.length}
          >
            <option value="">{t.me?.compareSelect || "Choose a friend"}</option>
            {friends.map((f) => (
              <option key={f.uid} value={f.uid}>
                {f.name || f.uid}
              </option>
            ))}
          </select>
        </div>

        {friendsLoading && (
          <p className={styles.hint}>{t.friends?.loading || "Loading..."}</p>
        )}

        {!friendsLoading && !selectedFriend && (
          <p className={styles.hint}>
            {t.me?.compareEmpty || "No friends to compare"}
          </p>
        )}

        {!friendsLoading && selectedFriend && (
          <div className={styles.compareGrid}>
            <CompareRow
              label={t.me?.score || "Score"}
              you={summary.avgScore}
              global={round1(selectedFriend.avgScore)}
              delta={round1(summary.avgScore - selectedFriend.avgScore)}
              accent={diffAccent(summary.avgScore - selectedFriend.avgScore, true)}
              compareSep={t.me?.compareSep || "vs"}
            />
            <CompareRow
              label={t.me?.kills || "Kills"}
              you={summary.avgKills}
              global={round1(selectedFriend.avgKills)}
              delta={round1(summary.avgKills - selectedFriend.avgKills)}
              accent={diffAccent(summary.avgKills - selectedFriend.avgKills, true)}
              compareSep={t.me?.compareSep || "vs"}
            />
            <CompareRow
              label={t.me?.deaths || "Deaths"}
              you={summary.avgDeaths}
              global={round1(selectedFriend.avgDeaths)}
              delta={round1(summary.avgDeaths - selectedFriend.avgDeaths)}
              accent={diffAccent(summary.avgDeaths - selectedFriend.avgDeaths, false)}
              compareSep={t.me?.compareSep || "vs"}
            />
            <CompareRow
              label={t.me?.assists || "Assists"}
              you={summary.avgAssists}
              global={round1(selectedFriend.avgAssists)}
              delta={round1(summary.avgAssists - selectedFriend.avgAssists)}
              accent={diffAccent(summary.avgAssists - selectedFriend.avgAssists, true)}
              compareSep={t.me?.compareSep || "vs"}
            />
            <CompareRow
              label={t.me?.damage || "Damage"}
              you={summary.avgDamage}
              global={round1(selectedFriend.avgDamage)}
              delta={round1(summary.avgDamage - selectedFriend.avgDamage)}
              accent={diffAccent(summary.avgDamage - selectedFriend.avgDamage, true)}
              compareSep={t.me?.compareSep || "vs"}
            />
            <CompareRow
              label={t.me?.kda || "KDA"}
              you={summary.kda}
              global={round1(selectedFriend.kda)}
              delta={round1(summary.kda - selectedFriend.kda)}
              accent={diffAccent(summary.kda - selectedFriend.kda, true)}
              compareSep={t.me?.compareSep || "vs"}
            />
            <CompareRow
              label={t.me?.winrate || "Winrate"}
              you={`${summary.winrate}%`}
              global={`${round1(selectedFriend.winrate)}%`}
              delta={`${sign(round1(summary.winrate - selectedFriend.winrate))}${round1(
                summary.winrate - selectedFriend.winrate
              )}%`}
              accent={diffAccent(summary.winrate - selectedFriend.winrate, true)}
              compareSep={t.me?.compareSep || "vs"}
            />
          </div>
        )}
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>{t.me?.activity || "Activity"}</h2>
        <p className={styles.hint}>{t.me?.activityHint || "Last 90 days"}</p>
        {activity && (
          <div
            className={styles.activityWrap}
            style={{
              "--activity-cell": `${activityLayout.cellSize}px`,
              "--activity-gap": `${activityLayout.gap}px`,
            }}
          >
            <div className={styles.activityWeekdays}>
              {(t.me?.weekdaysShort || [
                "Mon",
                "Tue",
                "Wed",
                "Thu",
                "Fri",
                "Sat",
                "Sun",
              ]).map((label, i) => (
                <div
                  className={styles.activityWeekday}
                  key={label}
                  style={{ gridRow: i + 1 }}
                >
                  {label}
                </div>
              ))}
            </div>
            <div className={styles.activityGridWrap} ref={activityGridWrapRef}>
              <div
                className={styles.activityGrid}
                style={{
                  gridTemplateColumns: `repeat(${activity.weeks}, var(--activity-cell))`,
                }}
              >
                {activity.days.map((d, i) => {
                  const week = Math.floor((i + activity.startDow) / 7) + 1;
                  const row = ((d.date.getDay() + 6) % 7) + 1;
                  const winrate =
                    d.wins + d.losses > 0 ? d.wins / (d.wins + d.losses) : 0;
                  const baseDot = Math.max(
                    4,
                    Math.floor(activityLayout.cellSize * 0.35)
                  );
                  const maxDot = Math.max(baseDot, activityLayout.cellSize - 4);
                  const size =
                    d.count === 0
                      ? baseDot
                      : Math.min(
                          maxDot,
                          baseDot +
                            Math.round(
                              (d.count / activity.maxCount) * (maxDot - baseDot)
                            )
                        );
                  const red = Math.round(255 - winrate * 180);
                  const green = Math.round(80 + winrate * 175);
                  const color =
                    d.count === 0
                      ? "rgba(255,255,255,0.08)"
                      : `rgb(${red}, ${green}, 90)`;
                  return (
                    <div
                      key={d.key}
                      className={styles.activityCell}
                      style={{ gridColumn: week, gridRow: row }}
                      aria-label={`${d.key} ${t.me?.wins || "Wins"} ${d.wins} ${
                        t.me?.losses || "Losses"
                      } ${d.losses}`}
                    >
                      <span
                        className={styles.activityDot}
                        style={{
                          width: size,
                          height: size,
                          background: color,
                        }}
                      />
                      <div className={styles.activityTooltip}>
                        <div className={styles.activityTooltipDate}>{d.key}</div>
                        <div className={styles.activityTooltipRow}>
                          {t.me?.wins || "Wins"}: {d.wins}
                        </div>
                        <div className={styles.activityTooltipRow}>
                          {t.me?.losses || "Losses"}: {d.losses}
                        </div>
                        <div className={styles.activityTooltipRow}>
                          {t.me?.matches || "Matches"}: {d.count}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={`${styles.card} ${styles.trendsCard}`}>
        <h2 className={styles.cardTitle}>
          {t.me?.trends || "Trends (last 5 vs prev 5)"}
        </h2>
        <div className={styles.trendRow}>
          <Mini
            label={t.me?.score || "Score"}
            value={`${summary.trendScore >= 0 ? "+" : ""}${summary.trendScore}`}
            accent={summary.trendScore >= 0 ? "good" : "bad"}
          />
          <Mini
            label={t.me?.kills || "Kills"}
            value={`${summary.trendKills >= 0 ? "+" : ""}${summary.trendKills}`}
            accent={summary.trendKills >= 0 ? "good" : "bad"}
          />
          <Mini
            label={t.me?.deaths || "Deaths"}
            value={`${summary.trendDeaths >= 0 ? "+" : ""}${summary.trendDeaths}`}
            accent={summary.trendDeaths >= 0 ? "bad" : "good"}
          />
          <Mini
            label={t.me?.assists || "Assists"}
            value={`${summary.trendAssists >= 0 ? "+" : ""}${summary.trendAssists}`}
            accent={summary.trendAssists >= 0 ? "good" : "bad"}
          />
          <Mini
            label={t.me?.damage || "Damage"}
            value={`${summary.trendDamage >= 0 ? "+" : ""}${summary.trendDamage}`}
            accent={summary.trendDamage >= 0 ? "good" : "bad"}
          />
        </div>
        <p className={styles.hint}>
          {t.me?.trendsHint ||
            "Difference between average of last 5 matches and previous 5."}
        </p>
      </div>
    </div>
  );
}

