import { lazy, Suspense, useMemo } from "react";
import styles from "@/pages/MyProfile/MyProfile.module.css";
import { useLang } from "@/i18n/LanguageContext";
import { useAuth } from "@/auth/AuthContext";
import StateMessage from "@/components/StateMessage/StateMessage";
import Achievements from "@/components/Achievements/Achievements";
import ProfileHeader from "@/components/MyProfile/ProfileHeader";
import OverviewSection from "@/components/MyProfile/OverviewSection";
import AveragesSection from "@/components/MyProfile/AveragesSection";
import GlobalComparisonCard from "@/components/MyProfile/GlobalComparisonCard";
import DetailsSectionGrid from "@/components/MyProfile/DetailsSectionGrid";
import RanksCard from "@/components/MyProfile/RanksCard";
import RecordsCard from "@/components/MyProfile/RecordsCard";
import useProfileMatches from "@/hooks/myProfile/useProfileMatches";
import useProfileRemoteData from "@/hooks/myProfile/useProfileRemoteData";
import useMyProfileViewModel from "@/hooks/myProfile/useMyProfileViewModel";
import {
  buildSummary,
} from "@/utils/myProfile/derive";
import {
  diffAccent,
  perfColor,
  perfWidth,
  round1,
  safeDiv,
  sign,
} from "@/utils/myProfile/math";
import { formatDate } from "@/utils/myProfile/formatters";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

const ChartSection = lazy(() => import("./ChartSection"));
const LastMatchesTable = lazy(() => import("./LastMatchesTable"));

export default function MyProfile() {
  const { t, lang } = useLang();
  const { user, claims } = useAuth();

  const uid = user?.uid;
  const { matches, loading, loadingMore, hasMore, fetchHistory } = useProfileMatches(uid);
  const summary = useMemo(
    () => buildSummary(matches, claims, user, uid),
    [matches, claims, user, uid]
  );

  const {
    profileRanks,
    banInfo,
    globalAvg,
    loadingGlobal,
    globalRanks,
    globalMeans,
    globalMatchMeans,
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
    chartToggleRef,
    chartPillRefs,
    pillStyle,
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

  if (!user) {
    return <p className={styles.wrapper}>{t.me?.loginRequired || "Login required"}</p>;
  }

  if (loading) {
    return (
      <div className={styles.wrapper}>
        <StateMessage text={t.me?.loading || "Loading..."} tone="loading" />
      </div>
    );
  }

  if (!matches.length || !summary) {
    return (
      <div className={styles.wrapper}>
        <StateMessage text={t.me?.empty || "No data yet"} tone="empty" />
      </div>
    );
  }

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
        globalMatchMeans={globalMatchMeans}
        perfColor={perfColor}
        perfWidth={perfWidth}
        safeDiv={safeDiv}
      />

      <GlobalComparisonCard
        t={t}
        loadingGlobal={loadingGlobal}
        vsGlobal={vsGlobal}
        summary={summary}
        sign={sign}
        diffAccent={diffAccent}
      />

      <DetailsSectionGrid
        t={t}
        summary={summary}
        friends={friends}
        friendsLoading={friendsLoading}
        friendId={friendId}
        setFriendId={setFriendId}
        selectedFriend={selectedFriend}
        diffAccent={diffAccent}
        round1={round1}
        sign={sign}
        activity={activity}
        activityLayout={activityLayout}
        activityGridWrapRef={activityGridWrapRef}
      />

      <RanksCard t={t} profileRanks={profileRanks} />

      <Achievements
        matches={matches}
        friends={friends}
        friendDates={friends.map((f) => f.createdAt).filter(Boolean)}
        mode="summary"
      />

      <RecordsCard t={t} summary={summary} />

      <Suspense
        fallback={
          <div className={styles.skeletonCard}>
            <div className={`${styles.skeletonRow} ${styles.skeletonRowWide}`} />
            <div className={`${styles.skeletonRow} ${styles.skeletonRowMedium}`} />
            <div className={styles.skeletonPills}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div className={styles.skeletonPill} key={i} />
              ))}
            </div>
            <div className={styles.skeletonChart} />
          </div>
        }
      >
        <ChartSection
          matches={matches}
          t={t}
          chartMetric={chartMetric}
          setChartMetric={setChartMetric}
          chartToggleRef={chartToggleRef}
          chartPillRefs={chartPillRefs}
          pillStyle={pillStyle}
        />
      </Suspense>

      <Suspense
        fallback={
          <div className={styles.skeletonCard}>
            <div className={`${styles.skeletonRow} ${styles.skeletonRowWide}`} />
            <div className={`${styles.skeletonRow} ${styles.skeletonRowMedium}`} />
            <div className={styles.skeletonTable} />
          </div>
        }
      >
        <LastMatchesTable
          last10={summary.last10}
          t={t}
          round1={round1}
          formatDate={formatDate}
        />
      </Suspense>

      {hasMore && (
        <div className={styles.loadMoreWrap}>
          <button
            className={styles.loadMoreBtn}
            onClick={() => fetchHistory(false)}
            disabled={loadingMore}
          >
            {loadingMore
              ? t.me?.loadingMore || "Loading..."
              : t.me?.loadMore || "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
