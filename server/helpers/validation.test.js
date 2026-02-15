import { describe, it, expect } from "vitest";
import {
  cleanText,
  getDayKey,
  isValidBase64Image,
  isValidUid,
  parseIntParam,
} from "./validation.js";

describe("validation helpers", () => {
  it("validates uid", () => {
    expect(isValidUid("discord:123_abc")).toBe(true);
    expect(isValidUid("bad space")).toBe(false);
  });

  it("validates base64 image payload", () => {
    expect(isValidBase64Image("data:image/png;base64,AAA=")).toBe(true);
    expect(isValidBase64Image("data:text/plain;base64,AAA=")).toBe(false);
  });

  it("parses int params and cleans text", () => {
    expect(parseIntParam("42")).toBe(42);
    expect(parseIntParam("x", 5)).toBeNull();
    expect(cleanText("  hello  ", 4)).toBe("hell");
  });

  it("builds day key in ISO date format", () => {
    const key = getDayKey(new Date("2026-02-15T12:00:00.000Z"));
    expect(key).toBe("2026-02-15");
  });
});
