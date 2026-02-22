import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PlayersTab from "@/pages/PlayersTab/PlayersTab";

const { dedupedJsonRequestMock } = vi.hoisted(() => ({
  dedupedJsonRequestMock: vi.fn(),
}));

vi.mock("@/utils/network/dedupedFetch", () => ({
  dedupedJsonRequest: (...args) => dedupedJsonRequestMock(...args),
}));

vi.mock("@/i18n/LanguageContext", () => ({
  useLang: () => ({
    t: {
      upload: { player: "Player" },
      leaderboard: {
        title: "Leaderboard",
        search: "Search player...",
        matches: "Matches",
        winrate: "Winrate",
        avgScore: "Avg score",
        kda: "KDA",
        elo: "ELO",
        wl: "W/L",
        loadMore: "Load more",
        loading: "Loading...",
        empty: "No data yet",
        notFound: "Player not found",
        refresh: "Refresh",
        steamOnline: "Steam online",
      },
    },
  }),
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

function renderPlayers() {
  return render(
    <MemoryRouter>
      <PlayersTab />
    </MemoryRouter>
  );
}

describe("PlayersTab", () => {
  beforeEach(() => {
    dedupedJsonRequestMock.mockResolvedValue({
      steamOnline: 55210,
      rows: [
        {
          uid: "u1",
          name: "Alice",
          matches: 10,
          elo: 1900,
          wins: 6,
          losses: 4,
          avgScore: 120,
          kda: 1.8,
          winrate: 60,
          rank: 1,
          rankDelta: 0,
        },
        {
          uid: "u2",
          name: "Bob",
          matches: 5,
          elo: 1500,
          wins: 2,
          losses: 3,
          avgScore: 90,
          kda: 1.1,
          winrate: 40,
          rank: 2,
          rankDelta: -1,
        },
      ],
      total: 2,
    });
  });

  it("loads and renders leaderboard rows", async () => {
    renderPlayers();

    expect(await screen.findByRole("link", { name: "Alice" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bob" })).toBeInTheDocument();
    expect(screen.getByText(/Steam online:/i)).toBeInTheDocument();
  });

  it("filters rows by search input", async () => {
    const user = userEvent.setup();
    renderPlayers();
    await screen.findByRole("link", { name: "Alice" });

    await user.type(screen.getByPlaceholderText("Search player..."), "ali");

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Alice" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Bob" })).not.toBeInTheDocument();
    });
  });

  it("refetches leaderboard when sort changes", async () => {
    const user = userEvent.setup();
    renderPlayers();
    await screen.findByRole("link", { name: "Alice" });

    await user.click(screen.getByRole("button", { name: "Winrate" }));

    await waitFor(() => {
      expect(dedupedJsonRequestMock).toHaveBeenCalledTimes(2);
    });

    expect(dedupedJsonRequestMock.mock.calls[0][0]).toContain("sort=matches");
    expect(dedupedJsonRequestMock.mock.calls[1][0]).toContain("sort=winrate");
  });
});
