import { describe, it, expect } from "vitest";
import { buildSummary, buildActivity, buildVsGlobal, normalizeSpark } from "./derive";

describe("myProfile derive", () => {
  it("returns null summary for empty input", () => {
    expect(buildSummary([], null, null, "u1")).toBeNull();
  });

  it("computes summary and trends", () => {
    const matches = [
      { score: 100, kills: 10, deaths: 5, assists: 3, damage: 1000, damageShare: 10, result: "victory", createdAt: 1, name: "P" },
      { score: 120, kills: 12, deaths: 6, assists: 4, damage: 1200, damageShare: 12, result: "defeat", createdAt: 2, name: "P" },
      { score: 150, kills: 15, deaths: 4, assists: 2, damage: 1400, damageShare: 14, result: "victory", createdAt: 3, name: "P" },
    ];

    const summary = buildSummary(matches, null, null, "u1");
    expect(summary.name).toBe("P");
    expect(summary.matchesCount).toBe(3);
    expect(summary.wins).toBe(2);
    expect(summary.losses).toBe(1);
    expect(summary.avgScore).toBeGreaterThan(0);
    expect(summary.sparkScoreRaw).toEqual([100, 120, 150]);
  });

  it("builds activity heatmap metadata", () => {
    const now = Date.now();
    const activity = buildActivity([
      { createdAt: now, result: "victory" },
      { createdAt: now, result: "defeat" },
    ]);

    expect(activity.days).toHaveLength(90);
    expect(activity.maxCount).toBeGreaterThanOrEqual(1);
    expect(activity.weeks).toBeGreaterThan(0);
  });

  it("computes global comparison and spark normalization", () => {
    const vs = buildVsGlobal(
      { avgScore: 100, avgKills: 10, avgDeaths: 5, avgAssists: 3, avgDamage: 1000, avgDamageShare: 20, kda: 2 },
      { count: 50, avgScore: 80, avgKills: 8, avgDeaths: 6, avgAssists: 2, avgDamage: 900, avgDamageShare: 18, kda: 1.7 }
    );
    expect(vs.delta.score).toBe(20);
    expect(normalizeSpark([1, 2, 3], 2)).toEqual([0.5, 1, 1.5]);
  });
});
