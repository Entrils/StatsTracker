import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import MyTeamInvitesSection from "@/components/tournaments/myTeams/MyTeamInvitesSection";
import MyTeamsTable from "@/components/tournaments/myTeams/MyTeamsTable";

describe("myTeams components", () => {
  it("MyTeamInvitesSection renders empty state on empty list", () => {
    render(
      <MyTeamInvitesSection tm={{}} invites={[]} onInviteDecision={vi.fn()} />
    );
    expect(screen.getByText(/Incoming invites/i)).toBeInTheDocument();
    expect(screen.getByText(/No incoming invites yet/i)).toBeInTheDocument();
  });

  it("MyTeamInvitesSection handles accept/reject", async () => {
    const user = userEvent.setup();
    const onInviteDecision = vi.fn();

    render(
      <MyTeamInvitesSection
        tm={{ accept: "Accept", reject: "Reject" }}
        invites={[
          {
            id: "1",
            teamId: "team-1",
            teamName: "Alpha",
            teamAvatarUrl: "",
            captainUid: "cap1",
            captainName: "Captain Alpha",
          },
        ]}
        onInviteDecision={onInviteDecision}
      />
    );

    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute("href", "/teams/team-1");
    expect(screen.getByText(/Captain: Captain Alpha/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Accept" }));
    await user.click(screen.getByRole("button", { name: "Reject" }));

    expect(onInviteDecision).toHaveBeenNthCalledWith(1, "team-1", true);
    expect(onInviteDecision).toHaveBeenNthCalledWith(2, "team-1", false);
  });

  it("MyTeamsTable opens details and leave action", async () => {
    const user = userEvent.setup();
    const onLeaveTeam = vi.fn();
    const navigate = vi.fn();

    render(
      <MemoryRouter>
        <MyTeamsTable
          tm={{ leaveTeam: "Leave", captainRole: "Captain", playerRole: "Player" }}
          teams={[
            {
              id: "t1",
              name: "Alpha",
              avatarUrl: "",
              memberCount: 3,
              maxMembers: 3,
              country: "US",
              isCaptain: false,
            },
          ]}
          onLeaveTeam={onLeaveTeam}
          navigate={navigate}
        />
      </MemoryRouter>
    );

    const row = screen.getByText("Alpha").closest("tr");
    expect(row).not.toBeNull();
    await user.click(row);
    expect(navigate).toHaveBeenCalledWith("/my-teams/t1");

    await user.click(screen.getByRole("button", { name: "Leave" }));
    expect(onLeaveTeam).toHaveBeenCalledWith("t1");
  });
});
