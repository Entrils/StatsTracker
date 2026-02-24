import {
  applyPreviewMatchResult,
  buildGroupStatsByGroup,
  buildPreviewMatches,
  buildPreviewPlayoffMatches,
  buildRoundsForStage,
  buildStageBuckets,
  buildStageTabs,
  buildVisibleBuckets,
  parseRoundAndMatch,
  resolveCanFinishGroupStage,
  resolveGrandFinalMatch,
  resolveTreeStage,
} from "@/shared/tournaments/detailsLogic";

describe("detailsLogic", () => {
  it("builds preview matches for solo and group brackets", () => {
    const solo = buildPreviewMatches(4, "single_elimination", "1x1");
    expect(solo).toHaveLength(2);
    expect(solo[0].teamA.teamName).toContain("Player");

    const group = buildPreviewMatches(8, "group_playoff", "5x5");
    expect(group.length).toBeGreaterThan(0);
    expect(group.every((m) => m.stage === "group")).toBe(true);
  });

  it("parses round/match and moves winner to next round", () => {
    const base = [
      {
        id: "r1_m1",
        stage: "single",
        round: 1,
        status: "pending",
        teamA: { teamId: "a", teamName: "A" },
        teamB: { teamId: "b", teamName: "B" },
      },
      {
        id: "r1_m2",
        stage: "single",
        round: 1,
        status: "pending",
        teamA: { teamId: "c", teamName: "C" },
        teamB: { teamId: "d", teamName: "D" },
      },
      {
        id: "r2_m1",
        stage: "single",
        round: 2,
        status: "waiting",
        teamA: null,
        teamB: null,
      },
    ];

    expect(parseRoundAndMatch("upper_r2_m3")).toEqual({
      stagePrefix: "upper",
      round: 2,
      index: 3,
    });

    const afterFirst = applyPreviewMatchResult(base, "r1_m1", "a", 13, 5, 3);
    expect(afterFirst.find((m) => m.id === "r2_m1")?.teamA?.teamId).toBe("a");
    expect(afterFirst.find((m) => m.id === "r2_m1")?.status).toBe("waiting");

    const afterSecond = applyPreviewMatchResult(afterFirst, "r1_m2", "d", 6, 13, 3);
    const final = afterSecond.find((m) => m.id === "r2_m1");
    expect(final?.teamB?.teamId).toBe("d");
    expect(final?.status).toBe("pending");
  });

  it("builds tabs, buckets and tree stage", () => {
    const matches = [
      { id: "group_A_m1_1", stage: "group", round: 1, group: "A" },
      { id: "upper_r1_m1", stage: "upper", round: 1 },
      { id: "upper_r1_m2", stage: "upper", round: 1 },
    ];

    expect(buildStageTabs(matches)).toEqual(["all", "group", "upper"]);

    const buckets = buildStageBuckets(matches);
    expect(buckets.map(([k]) => k)).toEqual(["group-A:r1", "upper:r1"]);
    expect(buildVisibleBuckets(buckets, "upper").map(([k]) => k)).toEqual(["upper:r1"]);
    expect(resolveTreeStage(matches, "all")).toBeNull();
    expect(resolveTreeStage(matches, "upper")).toBe("upper");
    expect(buildRoundsForStage(matches, "upper")[0].matches).toHaveLength(2);
  });

  it("builds group stats and playoff preview when groups are finished", () => {
    const groupMatches = [
      {
        id: "group_A_m1_1",
        stage: "group",
        group: "A",
        round: 1,
        status: "completed",
        teamA: { teamId: "a1", teamName: "A1", avgElo: 2200 },
        teamB: { teamId: "a2", teamName: "A2", avgElo: 2000 },
        teamAScore: 13,
        teamBScore: 9,
        winnerTeamId: "a1",
      },
      {
        id: "group_B_m1_1",
        stage: "group",
        group: "B",
        round: 1,
        status: "completed",
        teamA: { teamId: "b1", teamName: "B1", avgElo: 2150 },
        teamB: { teamId: "b2", teamName: "B2", avgElo: 2050 },
        teamAScore: 10,
        teamBScore: 13,
        winnerTeamId: "b2",
      },
    ];

    const stats = buildGroupStatsByGroup(groupMatches);
    expect(stats).toHaveLength(2);
    expect(stats[0].rows[0].played).toBe(1);

    const canFinish = resolveCanFinishGroupStage("group_playoff", groupMatches, groupMatches);
    expect(canFinish).toBe(true);

    const withPlayoff = buildPreviewPlayoffMatches(groupMatches);
    expect(withPlayoff.some((m) => m.stage === "playoff")).toBe(true);
  });

  it("resolves default grand final placeholder", () => {
    const fallback = resolveGrandFinalMatch([]);
    expect(fallback.stage).toBe("grand_final");
    expect(fallback.status).toBe("waiting");
  });
});
