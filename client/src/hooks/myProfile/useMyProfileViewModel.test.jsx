import { renderHook, act } from "@testing-library/react";
import useMyProfileViewModel from "@/hooks/myProfile/useMyProfileViewModel";

describe("useMyProfileViewModel", () => {
  it("selects friend and copies share URL", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    const { result } = renderHook(() =>
      useMyProfileViewModel({
        t: { me: { shareCopied: "Link copied", sharePrompt: "Copy link:" } },
        lang: "en",
        user: { uid: "u1", photoURL: null },
        claims: { provider: "discord", avatar: "a1" },
        summary: { sparkScoreRaw: [1], sparkKdaRaw: [1], sparkWinrateRaw: [1] },
        matches: [],
        globalMeans: { avgScore: 100, kda: 1.5, winrate: 50 },
        loadingGlobal: false,
        loadingRanks: false,
        globalAvg: { avgScore: 100 },
        globalRanks: { kda: 10 },
        friends: [{ uid: "f1", name: "Friend 1" }],
        friendId: "f1",
        backendUrl: "http://localhost:4000",
      })
    );

    expect(result.current.selectedFriend?.uid).toBe("f1");
    await act(async () => {
      await result.current.handleCopyShare();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(result.current.shareStatus).toBe("Link copied");
  });
});
