import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import TournamentMatchPage from "@/pages/TournamentMatch/TournamentMatch";

const { authState } = vi.hoisted(() => ({
  authState: { user: null },
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/i18n/LanguageContext", () => ({
  useLang: () => ({
    lang: "en",
    t: {
      tournaments: {
        details: {
          backToList: "Back to tournament",
          match: {
            chatOpen: "Open chat",
            chatHide: "Hide chat",
            chatTitle: "Match chat",
          },
        },
      },
    },
  }),
}));

function renderMatchPage() {
  return render(
    <MemoryRouter initialEntries={["/tournaments/t1/matches/m1"]}>
      <Routes>
        <Route path="/tournaments/:id/matches/:matchId" element={<TournamentMatchPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function mockFetchForMatchStatus(status = "pending") {
  global.fetch = vi.fn(async (url) => {
    const safeUrl = String(url || "");
    if (safeUrl.includes("/tournaments/t1/matches/m1/chat")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ rows: [] }),
      };
    }
    if (safeUrl.includes("/tournaments/t1/matches/m1")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          tournament: {
            id: "t1",
            title: "Cup #1",
            teamFormat: "2x2",
          },
          match: {
            id: "m1",
            status,
            stage: "single",
            round: 1,
            teamA: { teamId: "team-a", teamName: "A", members: [] },
            teamB: { teamId: "team-b", teamName: "B", members: [] },
            bestOf: 1,
          },
        }),
      };
    }
    return {
      ok: false,
      status: 404,
      json: async () => ({ error: "Not found" }),
    };
  });
}

describe("TournamentMatch chat visibility", () => {
  beforeEach(() => {
    authState.user = {
      uid: "u1",
      getIdToken: vi.fn().mockResolvedValue("token-1"),
    };
    mockFetchForMatchStatus("pending");
  });

  it("hides chat UI completely for completed matches", async () => {
    mockFetchForMatchStatus("completed");
    renderMatchPage();

    await screen.findByRole("heading", { name: "Cup #1" });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Open chat" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Hide chat" })).not.toBeInTheDocument();
      expect(screen.queryByText("Match chat")).not.toBeInTheDocument();
    });
  });

  it("shows chat toggle for non-completed matches", async () => {
    mockFetchForMatchStatus("pending");
    renderMatchPage();

    await screen.findByRole("heading", { name: "Cup #1" });
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Open chat" }).length).toBeGreaterThan(0);
    });
  });
});

