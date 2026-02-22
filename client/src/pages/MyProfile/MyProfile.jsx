import { lazy, Suspense, useMemo, useState } from "react";
import styles from "@/pages/MyProfile/MyProfile.module.css";
import { useLang } from "@/i18n/LanguageContext";
import { useAuth } from "@/auth/AuthContext";
import PageState from "@/components/StateMessage/PageState";
import Achievements from "@/components/Achievements/Achievements";
import ProfileHeader from "@/components/MyProfile/ProfileHeader";
import OverviewSection from "@/components/MyProfile/OverviewSection";
import AveragesSection from "@/components/MyProfile/AveragesSection";
import GlobalComparisonCard from "@/components/MyProfile/GlobalComparisonCard";
import RanksCard from "@/components/MyProfile/RanksCard";
import RecordsCard from "@/components/MyProfile/RecordsCard";
import Mini from "@/components/MyProfile/Mini";
import CompareRow from "@/components/MyProfile/CompareRow";
import useProfileMatches from "@/hooks/myProfile/useProfileMatches";
import useProfileRemoteData from "@/hooks/myProfile/useProfileRemoteData";
import useMyProfileViewModel from "@/hooks/myProfile/useMyProfileViewModel";
import { buildSummary } from "@/utils/myProfile/derive";
import {
  diffAccent,
  round1,
  sign,
} from "@/utils/myProfile/math";
import { formatTimeAgo } from "@/utils/myProfile/formatters";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

const ChartSection = lazy(() => import("./ChartSection"));
const LastMatchesTable = lazy(() => import("./LastMatchesTable"));
const MATCHES_STEP = 20;

export default function MyProfile() {
  const { t, lang } = useLang();
  const { user, claims } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [matchesVisible, setMatchesVisible] = useState(MATCHES_STEP);
  const [matchOutcomeFilter, setMatchOutcomeFilter] = useState("all");
  const [matchRange, setMatchRange] = useState(MATCHES_STEP);

  const uid = user?.uid;
  const { matches, loading, loadingMore, hasMore, fetchHistory } = useProfileMatches(uid);
  const summary = useMemo(
    () => buildSummary(matches, claims, user, uid),
    [matches, claims, user, uid]
  );

  const {
    profileRanks,
    profileElo,
    banInfo,
    globalAvg,
    loadingGlobal,
    globalRanks,
    globalMeans,
    loadingRanks,
    friends,
    friendsLoading,
    friendId,
    setFriendId,
  } = useProfileRemoteData({
    uid,
    user,
    summary,
    backendUrl: BACKEND_URL,
  });

  const {
    activity,
    activityGridWrapRef,
    activityLayout,
    chartMetric,
    setChartMetric,
    sparkScore,
    sparkKda,
    sparkWinrate,
    showRanks,
    vsGlobal,
    selectedFriend,
    profileAvatarUrl,
    shareStatus,
    handleCopyShare,
  } = useMyProfileViewModel({
    t,
    lang,
    user,
    claims,
    summary,
    matches,
    globalMeans,
    loadingGlobal,
    loadingRanks,
    globalAvg,
    globalRanks,
    friends,
    friendId,
    backendUrl: BACKEND_URL,
  });
  const recentMatches = useMemo(() => [...matches].reverse(), [matches]);
  const filteredRecentMatches = useMemo(() => {
    if (matchOutcomeFilter === "wins") {
      return recentMatches.filter((m) => m.result === "victory");
    }
    if (matchOutcomeFilter === "losses") {
      return recentMatches.filter((m) => m.result === "defeat");
    }
    return recentMatches;
  }, [recentMatches, matchOutcomeFilter]);
  const currentVisibleLimit = Math.max(matchesVisible, matchRange);
  const visibleMatches = useMemo(
    () => filteredRecentMatches.slice(0, currentVisibleLimit),
    [filteredRecentMatches, currentVisibleLimit]
  );
  const canLoadMoreMatches = hasMore || currentVisibleLimit < filteredRecentMatches.length;

  if (!user) {
    return <p className={styles.wrapper}>{t.me?.loginRequired || "Login required"}</p>;
  }

  if (loading || !matches.length || !summary) {
    return (
      <div className={styles.wrapper}>
        <PageState
          loading={loading}
          empty={!loading}
          loadingText={t.me?.loading || "Loading..."}
          emptyText={t.me?.empty || "No data yet"}
        />
      </div>
    );
  }

  const handleLoadMoreMatches = async () => {
    const nextVisible = matchesVisible + MATCHES_STEP;
    if (nextVisible <= filteredRecentMatches.length) {
      setMatchesVisible(nextVisible);
      return;
    }
    if (hasMore) {
      await fetchHistory(false);
      setMatchesVisible((prev) => prev + MATCHES_STEP);
    }
  };

  const handleRangeChange = (range) => {
    setMatchRange(range);
    setMatchesVisible((prev) => Math.max(prev, range));
  };

  const renderAsyncCardSkeleton = (kind = "chart") => (
    <div className={styles.skeletonCard}>
      <div className={`${styles.skeletonRow} ${styles.skeletonRowWide}`} />
      <div className={`${styles.skeletonRow} ${styles.skeletonRowMedium}`} />
      <div className={styles.skeletonPills}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div className={styles.skeletonPill} key={i} />
        ))}
      </div>
      <div className={kind === "table" ? styles.skeletonTable : styles.skeletonChart} />
    </div>
  );

  const renderActivityCard = () => {
    if (!activity) return null;
    const layout = {
      cellSize: activityLayout?.cellSize || 18,
      gap: activityLayout?.gap || 6,
    };

    return (
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>{t.me?.activity || "Activity"}</h2>
        <p className={styles.hint}>{t.me?.activityHint || "Last 90 days"}</p>
        <div
          className={styles.activityWrap}
          style={{
            "--activity-cell": `${layout.cellSize}px`,
            "--activity-gap": `${layout.gap}px`,
          }}
        >
          <div className={styles.activityWeekdays}>
            {(t.me?.weekdaysShort || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]).map(
              (label, i) => (
                <div
                  className={styles.activityWeekday}
                  key={label}
                  style={{ gridRow: i + 1 }}
                >
                  {label}
                </div>
              )
            )}
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
                const winrate = d.wins + d.losses > 0 ? d.wins / (d.wins + d.losses) : 0;
                const baseDot = Math.max(4, Math.floor(layout.cellSize * 0.35));
                const maxDot = Math.max(baseDot, layout.cellSize - 4);
                const size =
                  d.count === 0
                    ? baseDot
                    : Math.min(
                        maxDot,
                        baseDot + Math.round((d.count / activity.maxCount) * (maxDot - baseDot))
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
                  >
                    <span
                      className={styles.activityDot}
                      style={{ width: size, height: size, background: color }}
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
      </div>
    );
  };

  const renderVsFriends = () => (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>{t.me?.compareTitle || "Compare"}</h2>
      <p className={styles.hint}>{t.me?.compareHint || "Compare your stats with a friend"}</p>
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

      {friendsLoading && <p className={styles.hint}>{t.friends?.loading || "Loading..."}</p>}

      {!friendsLoading && !selectedFriend && (
        <p className={styles.hint}>{t.me?.compareEmpty || "No friends to compare"}</p>
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
  );

  const renderPerformanceTab = () => (
    <>
      <div className={`${styles.card} ${styles.denseCard}`}>
        <h2 className={styles.cardTitle}>{t.me?.totals || "Totals"}</h2>
        <div className={styles.twoCol}>
          <Mini label={t.me?.score || "Score"} value={summary.totalScore} />
          <Mini label={t.me?.kills || "Kills"} value={summary.totalKills} />
          <Mini label={t.me?.deaths || "Deaths"} value={summary.totalDeaths} />
          <Mini label={t.me?.assists || "Assists"} value={summary.totalAssists} />
          <Mini label={t.me?.damage || "Damage"} value={summary.totalDamage} />
        </div>
      </div>

      <div className={`${styles.card} ${styles.denseCard}`}>
        <h2 className={styles.cardTitle}>{t.me?.trends || "Trends (last 5 vs prev 5)"}</h2>
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
      </div>

      <RecordsCard t={t} summary={summary} />

      <Suspense
        fallback={renderAsyncCardSkeleton("chart")}
      >
        <ChartSection
          matches={matches}
          t={t}
          chartMetric={chartMetric}
          setChartMetric={setChartMetric}
        />
      </Suspense>
    </>
  );

  return (
    <div className={styles.wrapper}>
      <ProfileHeader
        t={t}
        summary={summary}
        profileAvatarUrl={profileAvatarUrl}
        handleCopyShare={handleCopyShare}
        shareStatus={shareStatus}
        banInfo={banInfo}
      />
      <div className={styles.tabsRow}>
        {[
          { id: "overview", label: t.me?.tabOverview || "Overview" },
          { id: "matches", label: t.me?.tabMatches || "Matches" },
          { id: "performance", label: t.me?.tabPerformance || "Performance" },
          { id: "friends", label: t.me?.tabFriends || "VS Friends" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${styles.tabBtn} ${
              activeTab === tab.id ? styles.tabBtnActive : ""
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.profileLayout}>
        <aside className={styles.sidebarColumn}>
          <div className={styles.sidebarSlot}>
            <RanksCard t={t} profileRanks={profileRanks} profileElo={profileElo} />
          </div>
          <div className={styles.sidebarSlot}>{renderActivityCard()}</div>
          <div className={styles.sidebarSlot}>
            <Achievements
              matches={matches}
              friends={friends}
              friendDates={friends.map((f) => f.createdAt).filter(Boolean)}
              mode="summary"
            />
          </div>
        </aside>

        <section className={styles.mainColumn}>
          {activeTab === "overview" && (
            <>
              <OverviewSection
                t={t}
                summary={summary}
                sparkScore={sparkScore}
                sparkWinrate={sparkWinrate}
                showRanks={showRanks}
                globalRanks={globalRanks}
              />
              <AveragesSection
                t={t}
                summary={summary}
                sparkScore={sparkScore}
                sparkKda={sparkKda}
                showRanks={showRanks}
                globalRanks={globalRanks}
              />
            </>
          )}

          {activeTab === "matches" && (
            <>
              <div className={styles.matchesToolbar}>
                <div className={styles.matchesFilterGroup}>
                  {[
                    { id: "all", label: t.me?.matchFilterAll || "All" },
                    { id: "wins", label: t.me?.matchFilterWins || "Wins" },
                    { id: "losses", label: t.me?.matchFilterLosses || "Losses" },
                  ].map((opt) => (
                    <button
                      type="button"
                      key={opt.id}
                      className={`${styles.matchesFilterBtn} ${
                        matchOutcomeFilter === opt.id ? styles.matchesFilterBtnActive : ""
                      }`}
                      onClick={() => setMatchOutcomeFilter(opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className={styles.matchesFilterGroup}>
                  {[20, 50, 100].map((range) => (
                    <button
                      type="button"
                      key={range}
                      className={`${styles.matchesFilterBtn} ${
                        matchRange === range ? styles.matchesFilterBtnActive : ""
                      }`}
                      onClick={() => handleRangeChange(range)}
                    >
                      {(t.me?.matchFilterLast || "Last") + ` ${range}`}
                    </button>
                  ))}
                </div>
              </div>
              <Suspense
                fallback={renderAsyncCardSkeleton("table")}
              >
                <LastMatchesTable
                  matches={visibleMatches}
                  t={t}
                  round1={round1}
                  formatTimeAgo={formatTimeAgo}
                  lang={lang}
                  avgKda={summary.kdaRaw}
                  title={t.me?.matchesHistoryTitle || "Match history"}
                />
              </Suspense>
              {canLoadMoreMatches && (
                <div className={styles.loadMoreWrap}>
                  <button
                    className={styles.loadMoreBtn}
                    onClick={handleLoadMoreMatches}
                    disabled={loadingMore}
                  >
                    {loadingMore
                      ? t.me?.loadingMore || "Loading..."
                      : t.me?.loadMore || "Load more"}
                  </button>
                </div>
              )}
            </>
          )}

          {activeTab === "performance" && (
            <>
              {renderPerformanceTab()}
              <GlobalComparisonCard
                t={t}
                loadingGlobal={loadingGlobal}
                vsGlobal={vsGlobal}
                summary={summary}
                sign={sign}
                diffAccent={diffAccent}
              />
            </>
          )}

          {activeTab === "friends" && renderVsFriends()}
        </section>
      </div>
    </div>
  );
}
