import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TeamCountryBadge from "@/components/tournaments/TeamCountryBadge";
import TournamentTabs from "@/components/tournaments/TournamentTabs";
import TournamentBoardRow from "@/components/tournaments/TournamentBoardRow";

function renderWithRouter(node) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("tournaments basics components", () => {
  it("TeamCountryBadge renders country label and flag", () => {
    render(<TeamCountryBadge country="EU" />);

    expect(screen.getByText("Europe")).toBeInTheDocument();
    const img = screen.getByRole("img", { name: /Europe flag/i });
    expect(img).toHaveAttribute("src", "/flags/eu.svg");
  });

  it("TournamentTabs changes active tab", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <TournamentTabs
        tabs={[
          { key: "upcoming", label: "Upcoming" },
          { key: "ongoing", label: "Ongoing" },
        ]}
        currentTab="upcoming"
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Ongoing" }));
    expect(onChange).toHaveBeenCalledWith("ongoing");
  });

  it("TournamentBoardRow handles team selection and actions", async () => {
    const user = userEvent.setup();
    const onTeamSelect = vi.fn();
    const onRegister = vi.fn();
    const onGenerateBracket = vi.fn();

    const row = {
      id: "tour-1",
      title: "Open Cup",
      startsAt: Date.UTC(2026, 0, 1),
      teamFormat: "5x5",
      registeredTeams: 4,
      maxTeams: 16,
      requirements: { minElo: 1000, minMatches: 10 },
      prizePool: "$100",
      status: "upcoming",
      logoUrl: "",
    };

    renderWithRouter(
      <TournamentBoardRow
        row={row}
        tt={{
          tabs: { upcoming: "Upcoming" },
          register: "Register",
          generate: "Generate",
          countdown: "Until start: {time}",
          selectTeam: "Select team",
        }}
        lang="en"
        user={{ uid: "u1" }}
        isAdmin
        registeringId=""
        generatingId=""
        selectedTeamId=""
        countdownText="1d"
        participating={false}
        teamOptions={[{ id: "team-1", name: "Alpha", memberCount: 5 }]}
        reqState={{ eloOk: true, matchesOk: false }}
        onTeamSelect={onTeamSelect}
        onRegister={onRegister}
        onGenerateBracket={onGenerateBracket}
      />
    );

    await user.selectOptions(screen.getByRole("combobox"), "team-1");
    expect(onTeamSelect).toHaveBeenCalledWith("tour-1", "team-1");

    const registerBtn = screen.getByRole("button", { name: "Register" });
    expect(registerBtn).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Generate" }));
    expect(onGenerateBracket).toHaveBeenCalledWith("tour-1");

    expect(screen.getByText("Until start: 1d")).toBeInTheDocument();
  });

  it("TournamentBoardRow shows participant state", () => {
    const row = {
      id: "tour-2",
      title: "Solo Cup",
      startsAt: Date.UTC(2026, 0, 2),
      teamFormat: "1x1",
      registeredTeams: 2,
      maxTeams: 8,
      requirements: { minElo: 0, minMatches: 0 },
      prizePool: "",
      status: "upcoming",
    };

    renderWithRouter(
      <TournamentBoardRow
        row={row}
        tt={{ tabs: { upcoming: "Upcoming" }, registered: "Participating" }}
        lang="en"
        user={{ uid: "u1" }}
        isAdmin={false}
        registeringId=""
        generatingId=""
        selectedTeamId=""
        countdownText="30m"
        participating
        teamOptions={[]}
        reqState={{ eloOk: true, matchesOk: true }}
        onTeamSelect={vi.fn()}
        onRegister={vi.fn()}
        onGenerateBracket={vi.fn()}
      />
    );

    expect(screen.getByText("Participating")).toBeInTheDocument();
  });
});
