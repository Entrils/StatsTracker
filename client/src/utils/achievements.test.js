import { describe, it, expect } from "vitest";
import { buildAchievements } from "./achievements";

describe("buildAchievements", () => {
  it("builds unlocked progress for matches/friends/kills/streak", () => {
    const matches = [
      { createdAt: 1, kills: 8, result: "victory" },
      { createdAt: 2, kills: 10, result: "victory" },
      { createdAt: 3, kills: 15, result: "victory" },
      { createdAt: 4, kills: 20, result: "victory" },
      { createdAt: 5, kills: 25, result: "victory" },
    ];
    const out = buildAchievements({
      matches,
      friendDates: [1, 2, 3],
    });

    expect(out.matches[0].unlocked).toBe(true);
    expect(out.friends[1].unlocked).toBe(true);
    expect(out.kills[0].unlockedAt).toBe(2);
    expect(out.streak[0].unlockedAt).toBe(3);
  });

  it("uses friendCount when provided", () => {
    const out = buildAchievements({
      matches: [],
      friends: [],
      friendCount: 10,
    });
    expect(out.friends[3].unlocked).toBe(true);
  });
});
