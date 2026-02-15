import { describe, expect, it } from "vitest";
import { computeHiddenElo } from "./elo.js";

describe("computeHiddenElo", () => {
  it("stacks up to 20 matches", () => {
    const low = computeHiddenElo({
      matches: 5,
      score: 30000,
      kills: 45,
      deaths: 20,
      assists: 25,
      damage: 6000,
      damageShare: 100,
      ranks: { s4: { rank: "gold" } },
    });
    const high = computeHiddenElo({
      matches: 20,
      score: 120000,
      kills: 180,
      deaths: 80,
      assists: 100,
      damage: 24000,
      damageShare: 400,
      ranks: { s4: { rank: "gold" } },
    });

    expect(high).toBeGreaterThan(low);
  });

  it("gives ranks dominant influence", () => {
    const highStatsLowRank = computeHiddenElo({
      matches: 60,
      score: 520000,
      kills: 900,
      deaths: 300,
      assists: 500,
      damage: 140000,
      damageShare: 2400,
      ranks: { s4: { rank: "silver" }, s3: { rank: "silver" } },
    });

    const midStatsHighRank = computeHiddenElo({
      matches: 60,
      score: 360000,
      kills: 580,
      deaths: 260,
      assists: 260,
      damage: 90000,
      damageShare: 1500,
      ranks: { s4: { rank: "master" }, s3: { rank: "diamond" } },
    });

    expect(midStatsHighRank).toBeGreaterThan(highStatsLowRank);
  });

  it("weights recent seasons higher than old ones", () => {
    const oldGoodRecentBad = computeHiddenElo({
      matches: 50,
      score: 260000,
      kills: 500,
      deaths: 260,
      assists: 220,
      damage: 70000,
      damageShare: 1100,
      ranks: { s1: { rank: "punkmaster" }, s4: { rank: "gold" } },
    });

    const oldBadRecentGood = computeHiddenElo({
      matches: 50,
      score: 260000,
      kills: 500,
      deaths: 260,
      assists: 220,
      damage: 70000,
      damageShare: 1100,
      ranks: { s1: { rank: "gold" }, s4: { rank: "punkmaster" } },
    });

    expect(oldBadRecentGood).toBeGreaterThan(oldGoodRecentBad);
  });
});

