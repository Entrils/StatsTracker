import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import TrustMetaBar from "@/components/TrustMetaBar/TrustMetaBar";
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
  const [feedExpanded, setFeedExpanded] = useState(false);

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
  const trustMeta = useMemo(() => {
    const toMs = (value) => {
      if (!value) return 0;
      if (typeof value === "number") return value;
      if (typeof value === "string") return Date.parse(value);
      if (typeof value?.toMillis === "function") return value.toMillis();
      if (typeof value?.seconds === "number") return value.seconds * 1000;
      if (typeof value?._seconds === "number") return value._seconds * 1000;
      return 0;
    };
    const latestMatchMs = matches.reduce((max, row) => {
      const ts = toMs(row?.createdAt);
      return ts > max ? ts : max;
    }, 0);
    const syncLabel = latestMatchMs
      ? formatTimeAgo(latestMatchMs, lang)
      : (t.me?.trustPending || "pending");
    const sourceText = t.me?.trustSource || "Personal match log and global aggregates";
    const coverageText = (t.me?.trustCoverage || "Showing up to {limit} matches")
      .replace("{limit}", "2000");
    const syncedText = (t.me?.trustSynced || "Latest match: {time}")
      .replace("{time}", syncLabel);
    return `${sourceText} | ${coverageText} | ${syncedText}`;
  }, [matches, lang, t.me]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search || "");
    const tabParam = String(params.get("tab") || "").trim().toLowerCase();
    const friendParam = String(params.get("friend") || "").trim();
    if (["overview", "matches", "performance", "friends"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
    if (!friendParam || !Array.isArray(friends) || !friends.length) return;
    const exists = friends.some((f) => String(f?.uid || "") === friendParam);
    if (exists) {
      setActiveTab("friends");
      setFriendId(friendParam);
    }
  }, [friends, setFriendId]);

  const friendsActivityFeed = useMemo(() => {
    const toMs = (value) => {
      if (!value) return 0;
      if (typeof value === "number") return value;
      if (typeof value === "string") return Date.parse(value);
      if (typeof value?.toMillis === "function") return value.toMillis();
      if (typeof value?.seconds === "number") return value.seconds * 1000;
      if (typeof value?._seconds === "number") return value._seconds * 1000;
      return 0;
    };
    const winsInLast5 = (last5 = []) =>
      (Array.isArray(last5) ? last5 : []).filter((r) => r === "W").length;
    if (!Array.isArray(friends) || !friends.length) return [];
    const events = [];
    friends.forEach((friend) => {
      const uid = String(friend?.uid || "").trim();
      if (!uid) return;
      const name = String(friend?.name || uid);
      const createdAtMs = toMs(friend?.createdAt);
      const baseScore = createdAtMs > 0 ? createdAtMs : 0;
      const matchesPlayed = Number(friend?.matches || 0);
      const wins5 = winsInLast5(friend?.last5);
      if (createdAtMs > 0) {
        events.push({
          key: `added-${uid}`,
          uid,
          score: baseScore,
          text: (t.me?.feedAdded || "{name} joined your friends list.")
            .replace("{name}", name),
        });
      }
      if (wins5 >= 3) {
        events.push({
          key: `streak-${uid}`,
          uid,
          score: baseScore - 1,
          text: (t.me?.feedStreak || "{name} has {wins} wins in the last 5 matches.")
            .replace("{name}", name)
            .replace("{wins}", String(wins5)),
        });
      }
      if (matchesPlayed >= 30) {
        events.push({
          key: `grind-${uid}`,
          uid,
          score: baseScore - 2,
          text: (t.me?.feedGrind || "{name} has played {matches} matches.")
            .replace("{name}", name)
            .replace("{matches}", String(matchesPlayed)),
        });
      }
    });
    return events.sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).slice(0, 5);
  }, [friends, t.me]);
  const feedPreviewText = friendsActivityFeed[0]?.text || "";

  useEffect(() => {
    if (activeTab !== "friends") setFeedExpanded(false);
    if (!friendsActivityFeed.length) setFeedExpanded(false);
  }, [activeTab, friendsActivityFeed.length]);

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
      {!!friendsActivityFeed.length && (
        <div className={styles.feedBox}>
          <button
            type="button"
            className={styles.feedToggle}
            onClick={() => setFeedExpanded((prev) => !prev)}
            aria-expanded={feedExpanded ? "true" : "false"}
          >
            <span className={styles.feedTitle}>
              {t.me?.feedTitle || "Friends activity"} ({friendsActivityFeed.length})
            </span>
            <span className={styles.feedPreview}>{feedPreviewText}</span>
            <span className={styles.feedChevron} aria-hidden="true">
              {feedExpanded ? "▴" : "▾"}
            </span>
          </button>
          {feedExpanded ? (
            <div className={styles.feedList}>
              {friendsActivityFeed.map((event) => (
                <button
                  key={event.key}
                  type="button"
                  className={styles.feedItem}
                  onClick={() => setFriendId(event.uid)}
                >
                  <span className={styles.feedDot} aria-hidden="true" />
                  <span className={styles.feedText}>{event.text}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
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
          {(() => {
            const asNumber = (value) => {
              const parsed = Number(value);
              return Number.isFinite(parsed) ? parsed : 0;
            };
            const friend = {
              avgScore: asNumber(selectedFriend.avgScore),
              avgKills: asNumber(selectedFriend.avgKills),
              avgDeaths: asNumber(selectedFriend.avgDeaths),
              avgAssists: asNumber(selectedFriend.avgAssists),
              avgDamage: asNumber(selectedFriend.avgDamage),
              kda: asNumber(selectedFriend.kda),
              winrate: asNumber(selectedFriend.winrate),
            };
            return (
              <>
          <CompareRow
            label={t.me?.score || "Score"}
            you={summary.avgScore}
            global={round1(friend.avgScore)}
            delta={round1(summary.avgScore - friend.avgScore)}
            accent={diffAccent(summary.avgScore - friend.avgScore, true)}
            compareSep={t.me?.compareSep || "vs"}
          />
          <CompareRow
            label={t.me?.kills || "Kills"}
            you={summary.avgKills}
            global={round1(friend.avgKills)}
            delta={round1(summary.avgKills - friend.avgKills)}
            accent={diffAccent(summary.avgKills - friend.avgKills, true)}
            compareSep={t.me?.compareSep || "vs"}
          />
          <CompareRow
            label={t.me?.deaths || "Deaths"}
            you={summary.avgDeaths}
            global={round1(friend.avgDeaths)}
            delta={round1(summary.avgDeaths - friend.avgDeaths)}
            accent={diffAccent(summary.avgDeaths - friend.avgDeaths, false)}
            compareSep={t.me?.compareSep || "vs"}
          />
          <CompareRow
            label={t.me?.assists || "Assists"}
            you={summary.avgAssists}
            global={round1(friend.avgAssists)}
            delta={round1(summary.avgAssists - friend.avgAssists)}
            accent={diffAccent(summary.avgAssists - friend.avgAssists, true)}
            compareSep={t.me?.compareSep || "vs"}
          />
          <CompareRow
            label={t.me?.damage || "Damage"}
            you={summary.avgDamage}
            global={round1(friend.avgDamage)}
            delta={round1(summary.avgDamage - friend.avgDamage)}
            accent={diffAccent(summary.avgDamage - friend.avgDamage, true)}
            compareSep={t.me?.compareSep || "vs"}
          />
          <CompareRow
            label={t.me?.kda || "KDA"}
            you={summary.kda}
            global={round1(friend.kda)}
            delta={round1(summary.kda - friend.kda)}
            accent={diffAccent(summary.kda - friend.kda, true)}
            compareSep={t.me?.compareSep || "vs"}
          />
          <CompareRow
            label={t.me?.winrate || "Winrate"}
            you={`${summary.winrate}%`}
            global={`${round1(friend.winrate)}%`}
            delta={`${sign(round1(summary.winrate - friend.winrate))}${round1(
              summary.winrate - friend.winrate
            )}%`}
            accent={diffAccent(summary.winrate - friend.winrate, true)}
            compareSep={t.me?.compareSep || "vs"}
          />
              </>
            );
          })()}
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
      <div className={styles.mobileQuickActions}>
        <Link to="/upload" className={styles.mobileQuickBtn}>
          {t.nav?.upload || "Upload"}
        </Link>
        <Link to="/friends" className={styles.mobileQuickBtn}>
          {t.nav?.friends || "Friends"}
        </Link>
        <button
          type="button"
          className={styles.mobileQuickBtn}
          onClick={() => setActiveTab("friends")}
        >
          {t.me?.tabFriends || "VS Friends"}
        </button>
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
      <TrustMetaBar text={trustMeta} className={styles.trustMeta} />
    </div>
  );
}
