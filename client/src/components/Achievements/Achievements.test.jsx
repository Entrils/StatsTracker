import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Achievements from "./Achievements";

vi.mock("@/i18n/LanguageContext", () => ({
  useLang: () => ({
    t: {
      achievements: {
        summaryTitle: "Best achievements",
        summaryEmpty: "No achievements yet",
        matchesTitle: "Uploaded matches",
        matchesLabel: "matches",
        unlockedAt: "Unlocked",
      },
    },
  }),
}));

describe("Achievements", () => {
  it("shows empty summary state", () => {
    render(<Achievements mode="summary" matches={[]} friends={[]} />);
    expect(screen.getByText("Best achievements")).toBeInTheDocument();
    expect(screen.getByText("No achievements yet")).toBeInTheDocument();
  });

  it("renders unlocked items in summary mode", () => {
    const matches = Array.from({ length: 5 }).map((_, i) => ({
      createdAt: i + 1,
      kills: 10,
      result: "victory",
    }));
    render(<Achievements mode="summary" matches={matches} friendDates={[1]} />);
    expect(screen.getByText("Uploaded matches")).toBeInTheDocument();
    expect(screen.getByText("5 matches")).toBeInTheDocument();
  });
});
