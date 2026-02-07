import { useMemo, useState } from "react";
import useChartMetricPill from "@/hooks/myProfile/useChartMetricPill";
import useActivityLayout from "@/hooks/myProfile/useActivityLayout";
import {
  buildActivity,
  buildVsGlobal,
  normalizeSpark,
} from "@/utils/myProfile/derive";
import { buildShareUrl } from "@/utils/myProfile/formatters";

export default function useMyProfileViewModel({
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
  backendUrl,
}) {
  const [shareStatus, setShareStatus] = useState("");
  const uid = user?.uid;

  const activity = useMemo(() => buildActivity(matches), [matches]);
  const { activityGridWrapRef, activityLayout } = useActivityLayout(activity);

  const { chartMetric, setChartMetric, chartToggleRef, chartPillRefs, pillStyle } =
    useChartMetricPill();

  const sparkScore = useMemo(() => {
    if (!globalMeans?.avgScore) return [];
    return normalizeSpark(summary?.sparkScoreRaw, globalMeans.avgScore);
  }, [summary, globalMeans]);

  const sparkKda = useMemo(() => {
    if (!globalMeans?.kda) return [];
    return normalizeSpark(summary?.sparkKdaRaw, globalMeans.kda);
  }, [summary, globalMeans]);

  const sparkWinrate = useMemo(() => {
    if (!globalMeans?.winrate) return [];
    return normalizeSpark(summary?.sparkWinrateRaw, globalMeans.winrate);
  }, [summary, globalMeans]);

  const showRanks = !loadingGlobal && !loadingRanks && !!globalAvg && !!globalRanks;
  const vsGlobal = useMemo(() => buildVsGlobal(summary, globalAvg), [summary, globalAvg]);

  const selectedFriend = useMemo(
    () => friends.find((f) => f.uid === friendId),
    [friends, friendId]
  );

  const profileAvatarUrl = useMemo(() => {
    if (!user) return null;
    if (claims?.provider === "discord" && claims?.avatar) {
      const discordId = user.uid.replace("discord:", "");
      return `https://cdn.discordapp.com/avatars/${discordId}/${claims.avatar}.png`;
    }
    return user.photoURL || null;
  }, [user, claims]);

  const shareUrl = useMemo(() => buildShareUrl(uid, lang, backendUrl), [uid, lang, backendUrl]);

  const handleCopyShare = async () => {
    if (!shareUrl) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        window.prompt(t.me?.sharePrompt || "Copy link:", shareUrl);
      }
      setShareStatus(t.me?.shareCopied || "Link copied");
      window.setTimeout(() => setShareStatus(""), 2000);
    } catch {
      setShareStatus(t.me?.shareFailed || "Copy failed");
      window.setTimeout(() => setShareStatus(""), 2000);
    }
  };

  return {
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
  };
}
