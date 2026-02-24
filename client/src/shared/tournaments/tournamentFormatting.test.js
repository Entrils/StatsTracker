import {
  formatBracketTypeLabel,
  formatCountdown,
  formatTournamentDate,
} from "@/shared/tournaments/tournamentFormatting";

describe("tournamentFormatting", () => {
  it("formats date and falls back for invalid values", () => {
    expect(formatTournamentDate(0)).toBe("-");
    expect(formatTournamentDate("bad")).toBe("-");
    expect(formatTournamentDate(Date.UTC(2026, 0, 2, 3, 4), "en")).not.toBe("-");
  });

  it("formats countdown for minutes, hours and days", () => {
    expect(formatCountdown(-1)).toBe("0m");
    expect(formatCountdown(5 * 60000)).toBe("5m");
    expect(formatCountdown((2 * 60 + 15) * 60000)).toBe("2h 15m");
    expect(formatCountdown((3 * 24 * 60 + 2 * 60) * 60000)).toBe("3d 2h");
  });

  it("formats bracket labels", () => {
    expect(formatBracketTypeLabel("single_elimination")).toBe("Single Elimination");
    expect(formatBracketTypeLabel("double_elimination")).toBe("Double Elimination");
    expect(formatBracketTypeLabel("group_playoff")).toBe("Group + Play-off");
    expect(formatBracketTypeLabel("custom_mode")).toBe("custom mode");
    expect(formatBracketTypeLabel("")).toBe("-");
  });
});
