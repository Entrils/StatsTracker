import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatRank,
  rankClass,
  rankIconSrc,
  buildShareUrl,
} from "./formatters";

describe("myProfile formatters", () => {
  it("formats date with fallback", () => {
    expect(formatDate(null, "x")).toBe("x");
    expect(typeof formatDate(1700000000000)).toBe("string");
  });

  it("maps rank labels/classes/icons", () => {
    const t = { me: { rankAce: "Туз" } };
    expect(formatRank("ace", t)).toBe("Туз");
    expect(rankClass("punkmaster")).toBe("Punkmaster");
    expect(rankIconSrc("gold")).toBe("/ranks/gold.png");
  });

  it("builds share url with language", () => {
    expect(buildShareUrl("", "ru", "http://x")).toBe("");
    expect(buildShareUrl("u 1", "de", "http://api/")).toBe(
      "http://api/share/player/u%201?lang=de"
    );
  });
});
