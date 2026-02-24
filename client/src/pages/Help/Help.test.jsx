import { render, screen } from "@testing-library/react";
import Help from "@/pages/Help/Help";

const { langState } = vi.hoisted(() => ({
  langState: {
    t: {
      help: {},
    },
  },
}));

vi.mock("@/i18n/LanguageContext", () => ({
  useLang: () => ({ t: langState.t }),
}));

describe("Help page", () => {
  it("renders new sections in table of contents", () => {
    langState.t = {
      help: {
        title: "Help",
        tocTitle: "Contents",
        quickStartTitle: "Quick start in 2 minutes",
        uploadTitle: "Uploading screenshots",
        glossaryTitle: "Glossary",
        privacySimpleTitle: "Privacy in plain words",
        eloTitle: "ELO rating",
        playerProfileTitle: "Player profile",
        bugReportTitle: "How to report a bug",
      },
    };

    render(<Help />);

    expect(screen.getByRole("link", { name: "Quick start in 2 minutes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Glossary" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy in plain words" })).toBeInTheDocument();
  });

  it("renders quick start text from steps fallback when combined text is absent", () => {
    langState.t = {
      help: {
        title: "Help",
        quickStartTitle: "Quick start in 2 minutes",
        quickStartBody: "Body",
        quickStartSteps: [
          "Set FragPunk ID.",
          "Upload screenshot.",
          "Check profile.",
        ],
      },
    };

    render(<Help />);

    expect(
      screen.getByText("Set FragPunk ID. Upload screenshot. Check profile.")
    ).toBeInTheDocument();
  });

  it("renders privacy section text and keeps section numbering", () => {
    langState.t = {
      help: {
        title: "Help",
        quickStartTitle: "Quick start in 2 minutes",
        quickStartBody: "Quick body",
        uploadTitle: "Upload",
        profileTitle: "Profile",
        matchIssuesTitle: "Match issues",
        friendsCompareTitle: "Friends",
        teamsTitle: "Teams",
        tournamentsTitle: "Tournaments",
        glossaryTitle: "Glossary",
        glossaryBody: "Glossary body",
        privacySimpleTitle: "Privacy in plain words",
        privacySimpleBody: "Privacy body",
        privacySimpleText: "Privacy details",
      },
    };

    render(<Help />);

    expect(screen.getByRole("heading", { name: "1. Quick start in 2 minutes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "9. Privacy in plain words" })).toBeInTheDocument();
    expect(screen.getByText("Privacy details")).toBeInTheDocument();
  });
});
