import { render, screen } from "@testing-library/react";
import Policy from "@/pages/Policy/Policy";

const { langState } = vi.hoisted(() => ({
  langState: {
    t: {
      policy: {},
    },
  },
}));

vi.mock("@/i18n/LanguageContext", () => ({
  useLang: () => ({ t: langState.t }),
}));

describe("Policy page", () => {
  it("renders important unofficial disclaimer and numbered sections", () => {
    langState.t = {
      policy: {
        title: "Policy",
        importantTitle: "<strong>IMPORTANT: UNOFFICIAL PROJECT</strong>",
        importantText:
          "<strong>This project is not affiliated with game developers and does not affect gameplay.</strong>",
        sections: [
          { title: "Service scope", body: "Section body 1" },
          { title: "Data accuracy", body: "Section body 2" },
        ],
      },
    };

    render(<Policy />);

    expect(screen.getByText("IMPORTANT: UNOFFICIAL PROJECT")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This project is not affiliated with game developers and does not affect gameplay."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "1. Service scope" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2. Data accuracy" })).toBeInTheDocument();
  });

  it("falls back to legacy p1..p5 format when sections are missing", () => {
    langState.t = {
      policy: {
        title: "Policy",
        p1: "Legacy line one.",
        p2: "Legacy line two.",
      },
    };

    render(<Policy />);

    expect(screen.getByText("Legacy line one.")).toBeInTheDocument();
    expect(screen.getByText("Legacy line two.")).toBeInTheDocument();
  });

  it("renders last updated label when provided", () => {
    langState.t = {
      policy: {
        title: "Policy",
        sections: [{ title: "Service scope", body: "Section body 1" }],
        lastUpdatedLabel: "Last updated",
        lastUpdatedDate: "2026-02-23",
      },
    };

    render(<Policy />);
    expect(screen.getByText("Last updated: 2026-02-23")).toBeInTheDocument();
  });
});
