const MATCH_THRESHOLDS = [5, 10, 25, 100, 500, 1000];
const FRIEND_THRESHOLDS = [1, 3, 5, 10];
const KILL_THRESHOLDS = [10, 15, 20, 25];
const STREAK_THRESHOLDS = [3, 5, 7, 10];

const toMs = (value) => {
  if (!value) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value?.toDate === "function") {
    return value.toDate().getTime();
  }
  if (typeof value?.seconds === "number") {
    return value.seconds * 1000;
  }
  return null;
};

const sortedMatches = (matches = []) =>
  [...matches].sort((a, b) => (toMs(a.createdAt) || 0) - (toMs(b.createdAt) || 0));

const getUnlockDateByCount = (matches, threshold) => {
  const sorted = sortedMatches(matches);
  if (sorted.length < threshold) return null;
  const match = sorted[threshold - 1];
  return toMs(match?.createdAt);
};

const getUnlockDateByKills = (matches, threshold) => {
  const sorted = sortedMatches(matches);
  const found = sorted.find((m) => (m.kills || 0) >= threshold);
  return toMs(found?.createdAt);
};

const getUnlockDateByStreak = (matches, threshold) => {
  const sorted = sortedMatches(matches);
  let streak = 0;
  for (const m of sorted) {
    if (m.result === "victory") {
      streak += 1;
      if (streak >= threshold) return toMs(m.createdAt);
    } else if (m.result === "defeat") {
      streak = 0;
    }
  }
  return null;
};

const getMaxKills = (matches) =>
  matches.reduce((max, m) => Math.max(max, m.kills || 0), 0);

const getMaxStreak = (matches) => {
  const sorted = sortedMatches(matches);
  let streak = 0;
  let max = 0;
  for (const m of sorted) {
    if (m.result === "victory") {
      streak += 1;
      max = Math.max(max, streak);
    } else if (m.result === "defeat") {
      streak = 0;
    }
  }
  return max;
};

const getFriendDates = (friends, friendDates) => {
  if (Array.isArray(friendDates) && friendDates.length) {
    return friendDates.map(toMs).filter(Boolean).sort((a, b) => a - b);
  }
  if (!Array.isArray(friends)) return [];
  return friends
    .map((f) => toMs(f.createdAt))
    .filter(Boolean)
    .sort((a, b) => a - b);
};

const getFriendCount = (friends, friendCount, friendDates) => {
  if (Number.isFinite(friendCount)) return friendCount;
  if (Array.isArray(friendDates) && friendDates.length) return friendDates.length;
  if (Array.isArray(friends)) return friends.length;
  return 0;
};

export function buildAchievements({
  matches = [],
  friends = [],
  friendDates = [],
  friendCount = null,
} = {}) {
  const matchCount = matches.length;
  const maxKills = getMaxKills(matches);
  const maxStreak = getMaxStreak(matches);
  const friendDatesSorted = getFriendDates(friends, friendDates);
  const friendsTotal = getFriendCount(friends, friendCount, friendDatesSorted);

  const buildItems = (thresholds, current, dateFn, imageBase) =>
    thresholds.map((value) => {
      const unlocked = current >= value;
      const unlockedAt = unlocked ? dateFn(value) : null;
      return {
        value,
        unlocked,
        unlockedAt,
        progress: Math.min(1, current / value),
        remaining: Math.max(0, value - current),
        image: `${imageBase}${value}.png`,
      };
    });

  return {
    matches: buildItems(
      MATCH_THRESHOLDS,
      matchCount,
      (value) => getUnlockDateByCount(matches, value),
      "/achievments/uploaded/upl"
    ),
    friends: buildItems(
      FRIEND_THRESHOLDS,
      friendsTotal,
      (value) => friendDatesSorted[value - 1] || null,
      "/achievments/friends/friend"
    ),
    kills: buildItems(
      KILL_THRESHOLDS,
      maxKills,
      (value) => getUnlockDateByKills(matches, value),
      "/achievments/kills/kills"
    ),
    streak: buildItems(
      STREAK_THRESHOLDS,
      maxStreak,
      (value) => getUnlockDateByStreak(matches, value),
      "/achievments/streak/streak"
    ),
  };
}
