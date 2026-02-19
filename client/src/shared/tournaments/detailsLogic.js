export const DETAILS_TABS = [
  { key: "overview" },
  { key: "rules" },
  { key: "participants" },
  { key: "bracket" },
];

export const STAGE_LABELS = {
  all: "all",
  group: "group",
  upper: "upper",
  lower: "lower",
  playoff: "playoff",
  grand_final: "grand_final",
  single: "single",
};

export const TREE_STAGES = ["single", "playoff", "upper", "lower"];
export const BRACKET_SLOT_PX = 180;
export const BRACKET_CARD_HEIGHT_PX = 90;
export const EMPTY_MATCHES = [];

export function formatDate(ms, lang = "en") {
  if (!ms) return "-";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(lang);
}

export function parseRulesList(raw) {
  const text = String(raw || "").trim();
  if (!text) return [];
  return text
    .split(/\r?\n+/)
    .map((line) => line.replace(/^\s*[-*\u2022]+\s*/, "").trim())
    .filter(Boolean);
}

export function parseMatchIndex(id) {
  const m = String(id || "").match(/_m(\d+)$/i);
  const n = Number.parseInt(m?.[1] || "0", 10);
  return Number.isFinite(n) ? n : 0;
}

export function parseRoundAndMatch(id) {
  const m = String(id || "").match(/^(?:(.+)_)?r(\d+)_m(\d+)$/i);
  if (!m) return null;
  const stagePrefix = String(m[1] || "");
  const round = Number.parseInt(m[2], 10);
  const index = Number.parseInt(m[3], 10);
  if (!Number.isFinite(round) || !Number.isFinite(index)) return null;
  return { stagePrefix, round, index };
}

export function buildPreviewMatches(
  participantCount = 8,
  bracketType = "single_elimination",
  teamFormat = "5x5"
) {
  const count = Math.min(Math.max(Number(participantCount) || 8, 2), 32);
  const isSolo = String(teamFormat || "") === "1x1";
  const teams = Array.from({ length: count }, (_, idx) => ({
    teamId: `preview_${idx + 1}`,
    teamName: isSolo ? `Player #${idx + 1}` : `Preview Team #${idx + 1}`,
    avgElo: 2200 - idx * 35,
    avatarUrl: "",
  }));
  const seeded = [...teams].sort((a, b) => b.avgElo - a.avgElo);
  const pairs = [];
  for (let i = 0; i < Math.ceil(seeded.length / 2); i += 1) {
    const left = seeded[i];
    const right = seeded[seeded.length - 1 - i];
    if (!left || !right || left.teamId === right.teamId) continue;
    pairs.push([left, right]);
  }
  const isDouble = String(bracketType || "").includes("double");
  const isGroupPlayoff = String(bracketType || "").includes("group");
  const makeId = (stage, round, index) => `${stage}_r${round}_m${index}`;

  if (isGroupPlayoff) {
    const groupSize = Math.max(4, Math.min(8, Math.floor(seeded.length / 2) * 2));
    const sized = seeded.slice(0, groupSize);
    const half = Math.floor(sized.length / 2);
    const groupA = sized.filter((_, idx) => idx % 2 === 0).slice(0, half);
    const groupB = sized.filter((_, idx) => idx % 2 === 1).slice(0, half);

    const makeGroupRoundRobin = (groupTeams, groupName) => {
      if (groupTeams.length < 2) return [];
      const list = [...groupTeams];
      const rounds = list.length - 1;
      const perRound = list.length / 2;
      const out = [];
      for (let r = 0; r < rounds; r += 1) {
        for (let i = 0; i < perRound; i += 1) {
          const a = list[i];
          const b = list[list.length - 1 - i];
          if (!a || !b || a.teamId === b.teamId) continue;
          out.push({
            id: `group_${groupName}_m${r + 1}_${i + 1}`,
            round: r + 1,
            stage: "group",
            group: groupName,
            status: "pending",
            teamA: a,
            teamB: b,
            winnerTeamId: null,
            teamAScore: 0,
            teamBScore: 0,
          });
        }
        const fixed = list[0];
        const rest = list.slice(1);
        rest.unshift(rest.pop());
        list.splice(0, list.length, fixed, ...rest);
      }
      return out;
    };

    return [...makeGroupRoundRobin(groupA, "A"), ...makeGroupRoundRobin(groupB, "B")];
  }

  if (!isDouble) {
    const matches = pairs.map((pair, idx) => ({
      id: `r1_m${idx + 1}`,
      round: 1,
      stage: "single",
      status: "pending",
      teamA: pair[0],
      teamB: pair[1],
      winnerTeamId: null,
      teamAScore: 0,
      teamBScore: 0,
    }));
    let round = 2;
    let inRound = Math.floor(pairs.length / 2);
    while (inRound >= 1) {
      for (let i = 1; i <= inRound; i += 1) {
        const next = {
          id: `r${round}_m${i}`,
          round,
          stage: "single",
          status: "waiting",
          teamA: null,
          teamB: null,
          winnerTeamId: null,
          teamAScore: 0,
          teamBScore: 0,
        };
        if (next.teamA || next.teamB) matches.push(next);
      }
      round += 1;
      inRound = Math.floor(inRound / 2);
    }
    return matches.filter((m) => m.teamA || m.teamB);
  }

  const bracketSize = Math.max(2, 2 ** Math.ceil(Math.log2(Math.max(2, seeded.length))));
  const sizedSeeds = seeded.slice(0, bracketSize);
  const upperPairs = [];
  for (let i = 0; i < bracketSize / 2; i += 1) {
    const a = sizedSeeds[i] || null;
    const b = sizedSeeds[bracketSize - 1 - i] || null;
    if (!a && !b) continue;
    if (a && b && a.teamId === b.teamId) continue;
    upperPairs.push([a, b]);
  }

  const matches = [];
  upperPairs.forEach((pair, idx) => {
    matches.push({
      id: makeId("upper", 1, idx + 1),
      round: 1,
      stage: "upper",
      status: "pending",
      teamA: pair[0] || null,
      teamB: pair[1] || null,
      winnerTeamId: null,
      teamAScore: 0,
      teamBScore: 0,
    });
  });

  let upperRound = 2;
  let upperInRound = Math.floor(upperPairs.length / 2);
  while (upperInRound >= 1) {
    for (let i = 1; i <= upperInRound; i += 1) {
      const next = {
        id: makeId("upper", upperRound, i),
        round: upperRound,
        stage: "upper",
        status: "waiting",
        teamA: null,
        teamB: null,
        winnerTeamId: null,
        teamAScore: 0,
        teamBScore: 0,
      };
      if (next.teamA || next.teamB) matches.push(next);
    }
    upperRound += 1;
    upperInRound = Math.floor(upperInRound / 2);
  }

  const upperRoundsCount = Math.log2(bracketSize);
  const lowerRoundsCount = Math.max(2, (upperRoundsCount - 1) * 2);
  let previousLowerRoundMatches = 0;
  for (let lowerRound = 1; lowerRound <= lowerRoundsCount; lowerRound += 1) {
    let matchesInRound = 0;
    if (lowerRound % 2 === 1) {
      const k = (lowerRound + 1) / 2;
      matchesInRound = Math.max(1, Math.floor(bracketSize / 2 ** (k + 1)));
      previousLowerRoundMatches = matchesInRound;
    } else {
      matchesInRound = Math.max(1, previousLowerRoundMatches);
    }
    for (let i = 1; i <= matchesInRound; i += 1) {
      const next = {
        id: makeId("lower", lowerRound, i),
        round: lowerRound,
        stage: "lower",
        status: "waiting",
        teamA: null,
        teamB: null,
        winnerTeamId: null,
        teamAScore: 0,
        teamBScore: 0,
      };
      if (next.teamA || next.teamB) matches.push(next);
    }
  }

  return matches.filter((m) => m.teamA || m.teamB);
}

export function buildStageTabs(matchesSource = []) {
  const present = new Set(matchesSource.map((m) => String(m.stage || "single")));
  const order = ["group", "upper", "lower", "playoff", "grand_final", "single"];
  return ["all", ...order.filter((key) => present.has(key))];
}

export function buildStageBuckets(matchesSource = []) {
  const grouped = new Map();
  for (const m of matchesSource) {
    const stage = String(m.stage || "single");
    const group = m.group ? `-${m.group}` : "";
    const key = `${stage}${group}:r${Number(m.round) || 1}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(m);
  }
  return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function buildVisibleBuckets(stageBuckets = [], stageFilter = "all") {
  if (stageFilter === "all") return stageBuckets;
  return stageBuckets.filter(
    ([bucket]) => bucket.startsWith(`${stageFilter}:`) || bucket.startsWith(`${stageFilter}-`)
  );
}

export function resolveTreeStage(matchesSource = [], stageFilter = "all") {
  if (stageFilter === "all") {
    const hasGroup = matchesSource.some((m) => String(m.stage || "single") === "group");
    if (hasGroup) return null;
    const presentTrees = TREE_STAGES.filter((s) =>
      matchesSource.some((m) => String(m.stage || "single") === s)
    );
    if (presentTrees.length !== 1) return null;
    return presentTrees[0] || null;
  }
  return TREE_STAGES.includes(stageFilter) ? stageFilter : null;
}

export function buildRoundsForStage(matchesSource = [], stage = "single") {
  const rows = matchesSource.filter((m) => String(m.stage || "single") === stage);
  if (!rows.length) return [];
  const byRound = new Map();
  rows.forEach((m) => {
    const round = Number(m.round) || 1;
    if (!byRound.has(round)) byRound.set(round, []);
    byRound.get(round).push(m);
  });
  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, matches]) => ({
      round,
      matches: [...matches].sort((a, b) => parseMatchIndex(a.id) - parseMatchIndex(b.id)),
    }));
}

export function resolveGrandFinalMatch(matchesSource = []) {
  const explicit = matchesSource.find((m) => String(m.stage || "") === "grand_final");
  if (explicit) return explicit;
  return {
    id: "",
    stage: "grand_final",
    status: "waiting",
    teamA: null,
    teamB: null,
    teamAScore: 0,
    teamBScore: 0,
    winnerTeamId: null,
  };
}

export function buildGroupStatsByGroup(groupStageMatches = []) {
  const byGroup = new Map();
  groupStageMatches.forEach((m) => {
    const group = String(m.group || "A");
    if (!byGroup.has(group)) byGroup.set(group, new Map());
    const statsMap = byGroup.get(group);
    const teamA = m.teamA || null;
    const teamB = m.teamB || null;
    const ensure = (team) => {
      if (!team?.teamId) return null;
      if (!statsMap.has(team.teamId)) {
        statsMap.set(team.teamId, {
          teamId: team.teamId,
          teamName: team.teamName || "Team",
          avatarUrl: team.avatarUrl || "",
          avgElo: Number(team.avgElo || 0),
          played: 0,
          wins: 0,
          losses: 0,
          scoreFor: 0,
          scoreAgainst: 0,
        });
      }
      return statsMap.get(team.teamId);
    };
    const a = ensure(teamA);
    const b = ensure(teamB);
    if (!a || !b) return;
    if (m.status === "completed") {
      a.played += 1;
      b.played += 1;
      const aScore = Number(m.teamAScore || 0);
      const bScore = Number(m.teamBScore || 0);
      a.scoreFor += aScore;
      a.scoreAgainst += bScore;
      b.scoreFor += bScore;
      b.scoreAgainst += aScore;
      if (m.winnerTeamId === a.teamId) {
        a.wins += 1;
        b.losses += 1;
      } else if (m.winnerTeamId === b.teamId) {
        b.wins += 1;
        a.losses += 1;
      }
    }
  });

  return [...byGroup.entries()]
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([group, statsMap]) => ({
      group,
      rows: [...statsMap.values()].sort(
        (a, b) =>
          b.wins - a.wins ||
          b.scoreFor - b.scoreAgainst - (a.scoreFor - a.scoreAgainst) ||
          b.avgElo - a.avgElo
      ),
    }));
}

export function resolveCanFinishGroupStage(bracketType, groupStageMatches = [], matchesSource = []) {
  if (String(bracketType || "") !== "group_playoff") return false;
  if (!groupStageMatches.length) return false;
  const allCompleted = groupStageMatches.every((m) => m.status === "completed");
  if (!allCompleted) return false;
  const playoffExists = matchesSource.some((m) => String(m.stage || "") === "playoff");
  return !playoffExists;
}

export function buildPreviewPlayoffMatches(prevMatches) {
  const list = Array.isArray(prevMatches) ? [...prevMatches] : [];
  const groups = new Map();
  list
    .filter((m) => String(m.stage || "") === "group")
    .forEach((m) => {
      const key = String(m.group || "A");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    });
  const playoffExists = list.some((m) => String(m.stage || "") === "playoff");
  if (playoffExists) return list;

  const qualifiers = [];
  [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([, matches]) => {
      const stats = new Map();
      const ensure = (team) => {
        if (!team?.teamId) return null;
        if (!stats.has(team.teamId)) {
          stats.set(team.teamId, {
            teamId: team.teamId,
            teamName: team.teamName || "Team",
            avatarUrl: team.avatarUrl || "",
            avgElo: Number(team.avgElo || 0),
            wins: 0,
            diff: 0,
          });
        }
        return stats.get(team.teamId);
      };
      matches.forEach((m) => {
        const a = ensure(m.teamA);
        const b = ensure(m.teamB);
        if (!a || !b || m.status !== "completed") return;
        const aScore = Number(m.teamAScore || 0);
        const bScore = Number(m.teamBScore || 0);
        a.diff += aScore - bScore;
        b.diff += bScore - aScore;
        if (m.winnerTeamId === a.teamId) a.wins += 1;
        if (m.winnerTeamId === b.teamId) b.wins += 1;
      });
      const ranked = [...stats.values()].sort(
        (x, y) => y.wins - x.wins || y.diff - x.diff || y.avgElo - x.avgElo
      );
      qualifiers.push(...ranked.slice(0, 2));
    });

  if (qualifiers.length < 2) return list;
  const sorted = [...qualifiers].sort((a, b) => b.avgElo - a.avgElo);
  const semifinalPairs = [];
  for (let i = 0; i < Math.ceil(sorted.length / 2); i += 1) {
    const left = sorted[i];
    const right = sorted[sorted.length - 1 - i];
    if (!left || !right || left.teamId === right.teamId) continue;
    semifinalPairs.push([left, right]);
  }
  semifinalPairs.forEach((pair, idx) => {
    list.push({
      id: `playoff_r1_m${idx + 1}`,
      round: 1,
      stage: "playoff",
      status: "pending",
      teamA: pair[0],
      teamB: pair[1],
      winnerTeamId: null,
      teamAScore: 0,
      teamBScore: 0,
    });
  });
  const finalCount = Math.floor(semifinalPairs.length / 2);
  for (let i = 1; i <= Math.max(1, finalCount); i += 1) {
    list.push({
      id: `playoff_r2_m${i}`,
      round: 2,
      stage: "playoff",
      status: "waiting",
      teamA: null,
      teamB: null,
      winnerTeamId: null,
      teamAScore: 0,
      teamBScore: 0,
    });
  }
  return list;
}

export function applyPreviewMatchResult(
  prevMatches,
  matchId,
  winnerTeamId,
  teamAScore = 0,
  teamBScore = 0,
  bestOf = 1
) {
  const list = Array.isArray(prevMatches) ? [...prevMatches] : [];
  const idx = list.findIndex((m) => m.id === matchId);
  if (idx === -1) return list;
  const match = list[idx];
  const teamAId = match?.teamA?.teamId;
  const teamBId = match?.teamB?.teamId;
  if (winnerTeamId !== teamAId && winnerTeamId !== teamBId) return list;
  const winner = winnerTeamId === teamAId ? match.teamA : match.teamB;
  list[idx] = {
    ...match,
    status: "completed",
    winnerTeamId,
    teamAScore,
    teamBScore,
    bestOf: [1, 3, 5].includes(Number(bestOf)) ? Number(bestOf) : 1,
  };

  const parsed = parseRoundAndMatch(matchId);
  if (!parsed) return list;
  const sameRoundActive = list.filter(
    (m) =>
      String(m.stage || "single") === String(match.stage || "single") &&
      (Number(m.round) || 1) === parsed.round &&
      (m.teamA?.teamId || m.teamB?.teamId)
  ).length;
  if (sameRoundActive <= 1) return list;
  const nextRound = parsed.round + 1;
  const nextIndex = Math.ceil(parsed.index / 2);
  const prefix = parsed.stagePrefix ? `${parsed.stagePrefix}_` : "";
  const nextId = `${prefix}r${nextRound}_m${nextIndex}`;
  const nextIdx = list.findIndex((m) => m.id === nextId);
  const slot = parsed.index % 2 === 1 ? "teamA" : "teamB";
  if (nextIdx >= 0) {
    const nextMatch = list[nextIdx];
    const updated = {
      ...nextMatch,
      [slot]: winner,
    };
    updated.status = updated.teamA && updated.teamB ? "pending" : "waiting";
    list[nextIdx] = updated;
  } else {
    list.push({
      id: nextId,
      round: nextRound,
      stage: match.stage || "single",
      status: "waiting",
      teamA: slot === "teamA" ? winner : null,
      teamB: slot === "teamB" ? winner : null,
      winnerTeamId: null,
      teamAScore: 0,
      teamBScore: 0,
    });
  }
  return list;
}
