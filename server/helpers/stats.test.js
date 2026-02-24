import { describe, it, expect, vi } from "vitest";
import { createStatsHelpers } from "./stats.js";

describe("stats helpers", () => {
  const admin = {
    firestore: {
      FieldPath: { documentId: () => "__name__" },
    },
  };

  it("computes topPercent for higher/lower better metrics", () => {
    const { topPercent } = createStatsHelpers({
      admin,
      db: {},
      logger: { warn: () => {} },
      CACHE_COLLECTION: "stats_cache",
      GLOBAL_CACHE_TTL_MS: 1000,
      getActiveBansSet: null,
      LEADERBOARD_CACHE_TTL_MS: 1000,
    });

    expect(topPercent([10, 20, 30, 40], 40, true)).toBe(1);
    expect(topPercent([10, 20, 30, 40], 10, false)).toBe(25);
    expect(topPercent([], 10, true)).toBeNull();
  });

  it("reads global distributions from cache doc when fresh", async () => {
    const db = {
      collection: () => ({
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({
              updatedAt: Date.now(),
              distributions: { matches: [1, 2] },
              countPlayers: 2,
            }),
          }),
        }),
      }),
    };
    const { getDistributions } = createStatsHelpers({
      admin,
      db,
      logger: { warn: () => {} },
      CACHE_COLLECTION: "stats_cache",
      GLOBAL_CACHE_TTL_MS: 60000,
      getActiveBansSet: null,
      LEADERBOARD_CACHE_TTL_MS: 1000,
    });

    const out = await getDistributions();
    expect(out.distributions.matches).toEqual([1, 2]);
    expect(out.countPlayers).toBe(2);
  });

  it("builds leaderboard page and writes rank snapshot", async () => {
    const docs = [
      {
        id: "u1",
        data: () => ({
          name: "A",
          matches: 10,
          wins: 6,
          losses: 4,
          score: 1000,
          kills: 50,
          deaths: 20,
          assists: 10,
          settings: { twitch: "a" },
        }),
      },
      {
        id: "u2",
        data: () => ({
          name: "B",
          matches: 5,
          wins: 3,
          losses: 2,
          score: 400,
          kills: 20,
          deaths: 10,
          assists: 5,
          settings: { twitch: "b" },
        }),
      },
    ];

    const batchSet = vi.fn();
    const commit = vi.fn().mockResolvedValue();
    const chain = {
      orderBy: () => chain,
      limit: () => chain,
      startAfter: () => ({
        get: async () => ({ empty: true, docs: [] }),
      }),
      get: async () => ({ empty: false, docs }),
    };

    const db = {
      collection: (name) => {
        if (name === "leaderboard_users") {
          return {
            orderBy: () => chain,
            doc: (uid) => ({ id: uid }),
          };
        }
        return {
          doc: () => ({ set: vi.fn() }),
        };
      },
      batch: () => ({
        set: batchSet,
        commit,
      }),
      getAll: vi.fn().mockResolvedValue([]),
    };

    const { getLeaderboardPage } = createStatsHelpers({
      admin,
      db,
      logger: { warn: vi.fn() },
      CACHE_COLLECTION: "stats_cache",
      GLOBAL_CACHE_TTL_MS: 1000,
      getActiveBansSet: null,
      LEADERBOARD_CACHE_TTL_MS: 1000,
    });

    const page = await getLeaderboardPage(2, 0, "matches");
    expect(page.rows).toHaveLength(2);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(page.rows[0].uid).toBe("u1");
    expect(page.rows[0].rank).toBe(1);
    expect(batchSet).toHaveBeenCalled();
    expect(commit).toHaveBeenCalled();
  });

  it("fills leaderboard socials from users fallback sources", async () => {
    const docs = [
      {
        id: "u1",
        data: () => ({
          name: "A",
          matches: 10,
          wins: 6,
          losses: 4,
          score: 1000,
          kills: 50,
          deaths: 20,
          assists: 10,
          settings: null,
        }),
      },
      {
        id: "u2",
        data: () => ({
          name: "B",
          matches: 5,
          wins: 3,
          losses: 2,
          score: 400,
          kills: 20,
          deaths: 10,
          assists: 5,
          settings: null,
        }),
      },
    ];

    const chain = {
      orderBy: () => chain,
      limit: () => chain,
      startAfter: () => ({
        get: async () => ({ empty: true, docs: [] }),
      }),
      get: async () => ({ empty: false, docs }),
    };

    const batchSet = vi.fn();
    const commit = vi.fn().mockResolvedValue();
    const getAll = vi.fn(async (...refs) => {
      return refs.map((ref) => {
        const path = String(ref?.path || "");
        if (path === "users/u1") {
          return {
            exists: true,
            data: () => ({ socials: { twitch: "u1_stream" } }),
          };
        }
        if (path === "users/u2") {
          return {
            exists: true,
            data: () => ({}),
          };
        }
        if (path === "users/u2/profile/settings") {
          return {
            exists: true,
            data: () => ({ settings: { youtube: "@u2" } }),
          };
        }
        return { exists: false, data: () => ({}) };
      });
    });

    const db = {
      collection: (name) => {
        if (name === "leaderboard_users") {
          return {
            orderBy: () => chain,
            doc: (uid) => ({ id: uid, path: `leaderboard_users/${uid}` }),
          };
        }
        if (name === "users") {
          return {
            doc: (uid) => ({
              id: uid,
              path: `users/${uid}`,
              collection: (sub) => ({
                doc: (docId) => ({
                  id: docId,
                  path: `users/${uid}/${sub}/${docId}`,
                }),
              }),
            }),
          };
        }
        return {
          doc: () => ({ path: `${name}/x` }),
        };
      },
      batch: () => ({
        set: batchSet,
        commit,
      }),
      getAll,
    };

    const { getLeaderboardPage } = createStatsHelpers({
      admin,
      db,
      logger: { warn: vi.fn() },
      CACHE_COLLECTION: "stats_cache",
      GLOBAL_CACHE_TTL_MS: 1000,
      getActiveBansSet: null,
      LEADERBOARD_CACHE_TTL_MS: 1000,
    });

    const page = await getLeaderboardPage(2, 0, "matches");
    const row1 = page.rows.find((r) => r.uid === "u1");
    const row2 = page.rows.find((r) => r.uid === "u2");

    expect(row1.settings).toEqual({ twitch: "u1_stream" });
    expect(row2.settings).toEqual({ youtube: "@u2" });
    expect(getAll).toHaveBeenCalled();
  });
});
