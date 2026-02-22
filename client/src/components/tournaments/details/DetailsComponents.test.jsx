import { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import BracketTab from "@/components/tournaments/details/BracketTab";
import OverviewTab from "@/components/tournaments/details/OverviewTab";
import ParticipantsTab from "@/components/tournaments/details/ParticipantsTab";
import RulesTab from "@/components/tournaments/details/RulesTab";
import ScoreModal from "@/components/tournaments/details/ScoreModal";

describe("tournament details components", () => {
  it("OverviewTab renders main info", () => {
    render(
      <OverviewTab
        tournament={{
          title: "Cup",
          status: "upcoming",
          description: "Desc",
          registeredTeams: 4,
          maxTeams: 16,
          teamFormat: "5x5",
          bracketType: "single_elimination",
          startsAt: Date.UTC(2026, 0, 1),
          prizePool: "$100",
        }}
        td={{ overview: { participants: "Participants" } }}
        lang="en"
        formatDate={() => "Jan 01"}
      />
    );

    expect(screen.getByText("Cup")).toBeInTheDocument();
    expect(screen.getByText("4/16")).toBeInTheDocument();
    expect(screen.getByText("Desc")).toBeInTheDocument();
  });

  it("ParticipantsTab renders empty and list states", () => {
    const { rerender } = render(
      <ParticipantsTab td={{ participants: { empty: "Empty" } }} tournament={{ teamFormat: "1x1" }} registrations={[]} />
    );
    expect(screen.getByText("Empty")).toBeInTheDocument();

    rerender(
      <ParticipantsTab
        td={{ participants: { elo: "ELO: {value}" } }}
        tournament={{ teamFormat: "1x1" }}
        registrations={[{ id: "r1", teamName: "Alpha", avgEloSnapshot: 1234, avatarUrl: "" }]}
      />
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("ELO: 1234")).toBeInTheDocument();
  });

  it("RulesTab renders rules list", () => {
    render(
      <RulesTab
        td={{ rules: { title: "Rules" }, overview: { format: "Format", bracket: "Bracket", start: "Start" } }}
        tournament={{ teamFormat: "5x5", bracketType: "double_elimination", startsAt: 1, requirements: { minElo: 100, minMatches: 2 } }}
        lang="en"
        rulesItems={["Rule one", "Rule two"]}
        formatDate={() => "Start date"}
      />
    );

    expect(screen.getByText("Rule one")).toBeInTheDocument();
    expect(screen.getByText("Rule two")).toBeInTheDocument();
    expect(screen.getByText("Start date")).toBeInTheDocument();
  });

  it("ScoreModal supports close/change/submit", async () => {
    const user = userEvent.setup();
    const setScoreModal = vi.fn();
    const onClose = vi.fn();
    const onSubmit = vi.fn((e) => e.preventDefault());

    render(
      <ScoreModal
        scoreModal={{
          open: true,
          matchId: "m1",
          teamAId: "a",
          teamBId: "b",
          teamAName: "A",
          teamBName: "B",
          teamAScore: 1,
          teamBScore: 2,
          winnerTeamId: "a",
          error: "",
        }}
        setScoreModal={setScoreModal}
        td={{ modal: { cancel: "Cancel", save: "Save" } }}
        savingResultId=""
        onCloseScoreModal={onClose}
        onSubmitScore={onSubmit}
      />
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();

    await user.click(screen.getByRole("radio", { name: "B" }));
    expect(setScoreModal).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it("BracketTab handles generate and stage switching", async () => {
    const user = userEvent.setup();
    const onStageFilterChange = vi.fn();

    render(
      <MemoryRouter>
        <BracketTab
        td={{ bracket: { title: "Bracket", generate: "Generate" } }}
        tournamentId="t1"
        isAdmin
        matchesSource={[]}
        stageTabs={["all", "single"]}
        stageFilter="all"
        onStageFilterChange={onStageFilterChange}
        stageLabels={{ all: "All", single: "Single" }}
        groupStageMatches={[]}
        groupStatsByGroup={[]}
        getTeamScoreClass={() => ""}
        getMatchScoreText={() => "0"}
        hasTeamIdentity={() => false}
        savingResultId=""
        onOpenScoreModal={vi.fn()}
        onFinishGroupStage={vi.fn()}
        canFinishGroupStage={false}
        generatingPlayoff={false}
        isDoubleAllView={false}
        doubleElimRef={createRef()}
        doubleElimOverlay={{ width: 1, height: 1, upper: "", lower: "" }}
        upperRounds={[]}
        lowerRounds={[]}
        renderTree={() => null}
        upperFinalRef={createRef()}
        lowerFinalRef={createRef()}
        grandFinalRef={createRef()}
        grandTopRowRef={createRef()}
        grandBottomRowRef={createRef()}
        grandFinalMatch={{ teamA: null, teamB: null }}
        treeRounds={[]}
        visibleBuckets={[]}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Bracket is not generated yet")).toBeInTheDocument();

    render(
      <MemoryRouter>
        <BracketTab
        td={{ bracket: { title: "Bracket" } }}
        tournamentId="t1"
        isAdmin={false}
        matchesSource={[{ id: "m", stage: "single", round: 1, teamA: null, teamB: null }]}
        stageTabs={["all", "single"]}
        stageFilter="all"
        onStageFilterChange={onStageFilterChange}
        stageLabels={{ all: "All", single: "Single" }}
        groupStageMatches={[]}
        groupStatsByGroup={[]}
        getTeamScoreClass={() => ""}
        getMatchScoreText={() => "0"}
        hasTeamIdentity={() => false}
        savingResultId=""
        onOpenScoreModal={vi.fn()}
        onFinishGroupStage={vi.fn()}
        canFinishGroupStage={false}
        generatingPlayoff={false}
        isDoubleAllView={false}
        doubleElimRef={createRef()}
        doubleElimOverlay={{ width: 1, height: 1, upper: "", lower: "" }}
        upperRounds={[]}
        lowerRounds={[]}
        renderTree={() => null}
        upperFinalRef={createRef()}
        lowerFinalRef={createRef()}
        grandFinalRef={createRef()}
        grandTopRowRef={createRef()}
        grandBottomRowRef={createRef()}
        grandFinalMatch={{ teamA: null, teamB: null }}
        treeRounds={[]}
        visibleBuckets={[["single:r1", [{ id: "m", teamA: null, teamB: null }]]]}
        />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "Single" }));
    expect(onStageFilterChange).toHaveBeenCalledWith("single");
  });
});
