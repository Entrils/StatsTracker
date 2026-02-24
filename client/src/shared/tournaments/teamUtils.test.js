import {
  buildTeamCountries,
  countryLabel,
  getCountryFlagUrl,
  isSoloFormat,
  normalizeCountryCode,
  teamFormatByMembers,
  teamMaxMembersByFormat,
  teamSizeByFormat,
} from "@/shared/tournaments/teamUtils";

describe("teamUtils", () => {
  it("calculates team sizes and formats", () => {
    expect(teamSizeByFormat("3x3")).toBe(3);
    expect(teamSizeByFormat("7x7")).toBe(5);
    expect(teamSizeByFormat("bad")).toBe(5);

    expect(teamMaxMembersByFormat("1x1")).toBe(1);
    expect(teamMaxMembersByFormat("3x3")).toBe(4);

    expect(teamFormatByMembers(2)).toBe("2x2");
    expect(teamFormatByMembers(4)).toBe("3x3");
    expect(teamFormatByMembers(8)).toBe("5x5");
    expect(teamFormatByMembers(0)).toBe("5x5");
  });

  it("handles solo format and country helpers", () => {
    expect(isSoloFormat("1x1")).toBe(true);
    expect(isSoloFormat("1X1")).toBe(true);
    expect(isSoloFormat("2x2")).toBe(false);

    expect(normalizeCountryCode(" us ")).toBe("US");
    expect(countryLabel("")).toBe("--");
    expect(countryLabel("eu")).toBe("Europe");
    expect(countryLabel("us")).toBe("US");
    expect(getCountryFlagUrl("eu")).toBe("/flags/eu.svg");
    expect(getCountryFlagUrl("USA")).toBeNull();
    expect(getCountryFlagUrl("de")).toBe("https://flagcdn.com/w40/de.png");
  });

  it("builds countries list with EU entry", () => {
    const countries = buildTeamCountries();
    expect(countries.length).toBeGreaterThan(0);
    expect(countries.some((x) => x.code === "EU" && x.label === "Europe")).toBe(true);
  });
});
