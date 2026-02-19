import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TeamActionsRow from "@/components/tournaments/myTeamDetails/TeamActionsRow";
import TeamEditForm from "@/components/tournaments/myTeamDetails/TeamEditForm";
import TeamInvitePanel from "@/components/tournaments/myTeamDetails/TeamInvitePanel";
import TeamMatchHistorySection from "@/components/tournaments/myTeamDetails/TeamMatchHistorySection";
import TeamOverviewSection from "@/components/tournaments/myTeamDetails/TeamOverviewSection";
import TeamRosterSection from "@/components/tournaments/myTeamDetails/TeamRosterSection";

describe("myTeamDetails components", () => {
  it("TeamActionsRow supports captain and player actions", async () => {
    const user = userEvent.setup();
    const onStartEdit = vi.fn();
    const onDeleteTeam = vi.fn();
    const onLeaveTeam = vi.fn();

    const { rerender } = render(
      <TeamActionsRow
        row={{ isCaptain: true }}
        tm={{ editTeam: "Edit", deleteTeam: "Delete", leaveTeam: "Leave" }}
        onStartEdit={onStartEdit}
        onDeleteTeam={onDeleteTeam}
        onLeaveTeam={onLeaveTeam}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onStartEdit).toHaveBeenCalled();
    expect(onDeleteTeam).toHaveBeenCalled();

    rerender(
      <TeamActionsRow
        row={{ isCaptain: false }}
        tm={{ leaveTeam: "Leave" }}
        onStartEdit={onStartEdit}
        onDeleteTeam={onDeleteTeam}
        onLeaveTeam={onLeaveTeam}
      />
    );

    await user.click(screen.getByRole("button", { name: "Leave" }));
    expect(onLeaveTeam).toHaveBeenCalled();
  });

  it("TeamEditForm edits and saves", async () => {
    const user = userEvent.setup();
    const setEditName = vi.fn();
    const onSaveEdit = vi.fn();
    const onCancelEdit = vi.fn();

    render(
      <TeamEditForm
        tm={{ editTeam: "Edit team", save: "Save", cancel: "Cancel", placeholders: { teamName: "Team name" } }}
        editName="Alpha"
        setEditName={setEditName}
        onEditAvatarChange={vi.fn()}
        editAvatarPreview=""
        onSaveEdit={onSaveEdit}
        onCancelEdit={onCancelEdit}
        savingEdit={false}
      />
    );

    await user.type(screen.getByPlaceholderText("Team name"), "1");
    expect(setEditName).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onSaveEdit).toHaveBeenCalled();
    expect(onCancelEdit).toHaveBeenCalled();
  });

  it("TeamInvitePanel handles uid and friend invite", async () => {
    const user = userEvent.setup();
    const setInviteUid = vi.fn();
    const setFriendSearch = vi.fn();
    const setSelectedFriendUid = vi.fn();
    const onInvite = vi.fn();
    const onInviteFriend = vi.fn();

    render(
      <TeamInvitePanel
        tm={{ placeholders: { playerUid: "UID", friendSearch: "Search" }, invite: "Invite", selectFriend: "Select" }}
        inviteUid=""
        setInviteUid={setInviteUid}
        onInvite={onInvite}
        friendSearch=""
        setFriendSearch={setFriendSearch}
        friendsLoading={false}
        inviteableFriends={[{ uid: "u1", name: "Friend" }]}
        selectedFriendUid=""
        setSelectedFriendUid={setSelectedFriendUid}
        filteredInviteableFriends={[{ uid: "u1", name: "Friend" }]}
        onInviteFriend={onInviteFriend}
      />
    );

    await user.type(screen.getByPlaceholderText("UID"), "x");
    expect(setInviteUid).toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: "Invite" })[0]);
    expect(onInvite).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Friend/ }));
    expect(onInviteFriend).toHaveBeenCalledWith("u1");
  });

  it("TeamMatchHistorySection renders rows", () => {
    const { rerender } = render(
      <TeamMatchHistorySection matchHistory={[]} tm={{ noData: "No data" }} />
    );

    expect(screen.getByText("No data")).toBeInTheDocument();

    rerender(
      <TeamMatchHistorySection
        tm={{ win: "Win", pending: "Pending" }}
        matchHistory={[
          {
            tournamentId: "t1",
            id: "m1",
            tournamentTitle: "Cup",
            opponent: { teamName: "Beta" },
            result: "win",
            scoreFor: 2,
            scoreAgainst: 1,
            playedAt: Date.UTC(2026, 0, 1),
          },
        ]}
      />
    );

    expect(screen.getByText("Cup")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Win")).toBeInTheDocument();
  });

  it("TeamOverviewSection and TeamRosterSection render and invoke actions", async () => {
    const user = userEvent.setup();
    const onTransferCaptain = vi.fn();
    const onKickMember = vi.fn();
    const onSetMemberRole = vi.fn();

    render(
      <>
        <TeamOverviewSection
          row={{
            avatarUrl: "",
            name: "Alpha",
            maxMembers: 3,
            memberCount: 2,
            country: "US",
          }}
          stats={{ wins: 1, losses: 1, matchesPlayed: 2, winRate: 50 }}
          recentTournaments={[{ id: "r1", title: "Cup", placement: 2 }]}
          slotsLeft={1}
          tm={{}}
        />
        <TeamRosterSection
          row={{ isCaptain: true, captainUid: "c1" }}
          roster={[
            { uid: "c1", name: "Captain", role: "captain", avatarUrl: "" },
            { uid: "p1", name: "Player", role: "player", avatarUrl: "" },
          ]}
          tm={{ transferCaptain: "Transfer", setReserve: "Reserve", kickMember: "Kick" }}
          onTransferCaptain={onTransferCaptain}
          onKickMember={onKickMember}
          onSetMemberRole={onSetMemberRole}
        />
      </>
    );

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Cup - #2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Transfer" }));
    await user.click(screen.getByRole("button", { name: "Reserve" }));
    await user.click(screen.getByRole("button", { name: "Kick" }));

    expect(onTransferCaptain).toHaveBeenCalledWith("p1");
    expect(onSetMemberRole).toHaveBeenCalledWith("p1", "reserve");
    expect(onKickMember).toHaveBeenCalledWith("p1");
  });
});
