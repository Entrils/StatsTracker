import { renderHook, waitFor } from "@testing-library/react";
import useProfileRemoteData from "@/hooks/myProfile/useProfileRemoteData";

const { dedupedMock, getDocMock } = vi.hoisted(() => ({
  dedupedMock: vi.fn(),
  getDocMock: vi.fn(),
}));

vi.mock("@/utils/network/dedupedFetch", () => ({
  dedupedJsonRequest: (...args) => dedupedMock(...args),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  getDoc: (...args) => getDocMock(...args),
}));

vi.mock("@/firebase", () => ({ db: {} }));

describe("useProfileRemoteData", () => {
  it("loads profile, percentiles and friends, then selects first friend", async () => {
    dedupedMock.mockImplementation(async (key, fetcher) => {
      if (String(key).startsWith("player-profile-lite:")) {
        return { ranks: { s1: { rank: "gold" } }, ban: null };
      }
      if (String(key).startsWith("percentiles:")) {
        return {
          percentiles: { kda: 20 },
          averages: { avgScore: 100, kda: 1.5, winrate: 50 },
          matchAverages: {
            avgScore: 120,
            avgKills: 10,
            avgDeaths: 8,
            avgAssists: 3,
            avgDamage: 1000,
            avgDamageShare: 24.4,
            kda: 1.6,
          },
          matchCount: 10,
        };
      }
      if (String(key).startsWith("friends-list:")) {
        return { rows: [{ uid: "f1", name: "Friend 1" }] };
      }
      return fetcher();
    });

    const user = { uid: "u1", getIdToken: vi.fn().mockResolvedValue("token") };
    const summary = {
      matchesCount: 10,
      wins: 5,
      losses: 5,
      avgScoreRaw: 120,
      avgKillsRaw: 10,
      avgDeathsRaw: 8,
      avgAssistsRaw: 2,
      avgDamageRaw: 1000,
      avgDamageShareRaw: 20,
      kdaRaw: 1.5,
      winrateRaw: 50,
    };

    const { result } = renderHook(() =>
      useProfileRemoteData({
        uid: "u1",
        user,
        summary,
        backendUrl: "http://localhost:4000",
      })
    );

    await waitFor(() => {
      expect(result.current.profileRanks).toEqual({ s1: { rank: "gold" } });
      expect(result.current.friendId).toBe("f1");
      expect(result.current.globalAvg?.count).toBe(10);
    });
  });
});
