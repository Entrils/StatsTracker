import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import TeamDetailsPage from "@/pages/TeamDetails/TeamDetails";

vi.mock("@/i18n/LanguageContext", () => ({
  useLang: () => ({
    t: {
      tournaments: {
        details: {
          backToList: "Back to list",
        },
        myTeams: {
          loading: "Loading...",
          teamNotFound: "Team not found",
          teamDetails: "Team",
          teamDetailsSubtitle: "Team profile",
        },
      },
    },
  }),
}));

vi.mock("@/components/tournaments/myTeamDetails/TeamOverviewSection", () => ({
  default: () => <div>Team overview</div>,
}));
vi.mock("@/components/tournaments/myTeamDetails/TeamRosterSection", () => ({
  default: () => <div>Team roster</div>,
}));
vi.mock("@/components/tournaments/myTeamDetails/TeamMatchHistorySection", () => ({
  default: () => <div>Team history</div>,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/teams/team-1"]}>
      <Routes>
        <Route path="/teams/:id" element={<TeamDetailsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("TeamDetails page", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("shows error state for missing team", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "Team not found" }),
    }));

    renderPage();
    expect(await screen.findByText("Team not found")).toBeInTheDocument();
  });
});

