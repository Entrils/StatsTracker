import { render, screen } from "@testing-library/react";
import Roadmap from "@/pages/Roadmap/Roadmap";

const { langState } = vi.hoisted(() => ({
  langState: {
    t: {
      roadmap: {},
    },
  },
}));

vi.mock("@/i18n/LanguageContext", () => ({
  useLang: () => ({ t: langState.t }),
}));

describe("Roadmap page", () => {
  it("renders four roadmap columns with provided items", () => {
    langState.t = {
      roadmap: {
        title: "Project Roadmap",
        subtitle: "Subtitle",
        feedbackTitle: "Feedback",
        feedbackLine1: "Line 1",
        feedbackLine2: "Line 2",
        soon: "SOON",
        soonHint: "Soon",
        inProgress: "IN PROGRESS",
        inProgressHint: "In progress",
        inFuture: "IN FUTURE",
        inFutureHint: "In future",
        wishlist: "WISHLIST",
        wishlistHint: "Wishlist",
        soonItems: ["A", "B"],
        inProgressItems: ["C"],
        inFutureItems: ["D", "E", "F"],
        wishlistItems: ["G"],
      },
    };

    render(<Roadmap />);

    expect(screen.getByRole("heading", { name: "Project Roadmap" })).toBeInTheDocument();
    expect(screen.getByText("SOON")).toBeInTheDocument();
    expect(screen.getByText("IN PROGRESS")).toBeInTheDocument();
    expect(screen.getByText("IN FUTURE")).toBeInTheDocument();
    expect(screen.getByText("WISHLIST")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("G")).toBeInTheDocument();
  });

  it("falls back to default rows when roadmap translations are absent", () => {
    langState.t = { roadmap: {} };

    render(<Roadmap />);

    expect(screen.getByRole("heading", { name: "Project Roadmap" })).toBeInTheDocument();
    expect(screen.getByText("Fix text encoding issues")).toBeInTheDocument();
    expect(screen.getByText("Help/FAQ expansion")).toBeInTheDocument();
    expect(screen.getByText("Weekly growth leaderboard")).toBeInTheDocument();
    expect(screen.getByText("Team/clan pages")).toBeInTheDocument();
  });
});
