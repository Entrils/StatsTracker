import { buildFriendAvatarUrl, formatTeamMatchDate } from "@/shared/tournaments/myTeamDetailsUtils";

describe("myTeamDetailsUtils", () => {
  it("formats team match date with fallback", () => {
    expect(formatTeamMatchDate(0)).toBe("-");
    expect(formatTeamMatchDate("bad")).toBe("-");
    expect(formatTeamMatchDate(Date.now())).not.toBe("-");
  });

  it("builds friend avatar url from preferred sources", () => {
    expect(buildFriendAvatarUrl({ avatarUrl: "https://cdn/a.png" })).toBe("https://cdn/a.png");
    expect(buildFriendAvatarUrl({ avatar: "https://cdn/b.png" })).toBe("https://cdn/b.png");
    expect(
      buildFriendAvatarUrl({
        provider: "discord",
        uid: "discord:123",
        avatar: "abcdef",
      })
    ).toBe("https://cdn.discordapp.com/avatars/123/abcdef.png");
    expect(buildFriendAvatarUrl({ provider: "discord", uid: "discord:123" })).toBe("");
  });
});
