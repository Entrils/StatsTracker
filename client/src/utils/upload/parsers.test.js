import {
  extractMatchId,
  parseFragpunkText,
  parseMatchResult,
} from "@/utils/upload/parsers";

describe("upload parsers", () => {
  it("extracts match id from labeled text", () => {
    const text = "Match ID: a1b2c3d4e5";
    expect(extractMatchId(text)).toBe("a1b2c3d4e5");
  });

  it("parses victory/defeat match result", () => {
    expect(parseMatchResult("VICTORY")).toBe("victory");
    expect(parseMatchResult("defeat")).toBe("defeat");
  });

  it("parses fragpunk row", () => {
    const parsed = parseFragpunkText(
      "1234\n12/8/3\n4567\n33.5%",
      "u1",
      "Player"
    );
    expect(parsed).toMatchObject({
      ownerUid: "u1",
      name: "Player",
      score: 1234,
      kills: 12,
      deaths: 8,
      assists: 3,
      damage: 4567,
      damageShare: 33.5,
    });
  });

  it("returns null on invalid fragpunk row", () => {
    expect(parseFragpunkText("broken data", "u1", "Player")).toBeNull();
  });
});
