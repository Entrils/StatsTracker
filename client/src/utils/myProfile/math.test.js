import { describe, it, expect } from "vitest";
import { safeDiv, round1, sign, diffAccent, perfColor, perfWidth } from "./math";

describe("myProfile math", () => {
  it("handles safe division and rounding", () => {
    expect(safeDiv(10, 0)).toBe(0);
    expect(safeDiv(9, 3)).toBe(3);
    expect(round1(1.26)).toBe(1.3);
  });

  it("formats signs and accent classes", () => {
    expect(sign(0)).toBe("+");
    expect(sign(-1)).toBe("");
    expect(diffAccent(5, true)).toBe("good");
    expect(diffAccent(-5, false)).toBe("good");
  });

  it("returns bounded perf styles", () => {
    expect(perfColor(Number.NaN)).toContain("rgba");
    expect(perfWidth(3)).toBe("100%");
    expect(perfWidth(-1)).toBe("0%");
  });
});
