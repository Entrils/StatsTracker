import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import MyTeamDetailsPage from "@/pages/MyTeamDetails/MyTeamDetails";

const { authState, controllerState } = vi.hoisted(() => ({
  authState: { user: null },
  controllerState: {
    loading: false,
    notice: "",
    row: null,
    roster: [],
    recentTournaments: [],
    matchHistory: [],
    stats: {},
    slotsLeft: 0,
    inviteUid: "",
    setInviteUid: vi.fn(),
    friendsLoading: false,
    selectedFriendUid: "",
    setSelectedFriendUid: vi.fn(),
    friendSearch: "",
    setFriendSearch: vi.fn(),
    pendingInvites: [],
    inviteableFriends: [],
    filteredInviteableFriends: [],
    isEditing: false,
    editName: "",
    setEditName: vi.fn(),
    editAvatarPreview: "",
    savingEdit: false,
    onInvite: vi.fn(),
    onInviteFriend: vi.fn(),
    onCancelInvite: vi.fn(),
    onDeleteTeam: vi.fn(),
    onStartEdit: vi.fn(),
    onCancelEdit: vi.fn(),
    onEditAvatarChange: vi.fn(),
    onSaveEdit: vi.fn(),
    onLeaveTeam: vi.fn(),
    onKickMember: vi.fn(),
    onTransferCaptain: vi.fn(),
    onSetMemberRole: vi.fn(),
  },
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/i18n/LanguageContext", () => ({
  useLang: () => ({
    t: {
      tournaments: {
        myTeams: {
          title: "My teams",
          loginRequired: "Login required",
          loading: "Loading...",
          teamNotFound: "Team not found",
          teamDetails: "Team",
          teamDetailsSubtitle: "Team profile and management",
        },
      },
    },
  }),
}));

vi.mock("@/hooks/tournaments/useMyTeamDetailsController", () => ({
  default: () => controllerState,
}));

vi.mock("@/components/tournaments/myTeamDetails/TeamOverviewSection", () => ({
  default: () => <div>Overview</div>,
}));
vi.mock("@/components/tournaments/myTeamDetails/TeamRosterSection", () => ({
  default: () => <div>Roster</div>,
}));
vi.mock("@/components/tournaments/myTeamDetails/TeamInvitePanel", () => ({
  default: () => <div>Invites</div>,
}));
vi.mock("@/components/tournaments/myTeamDetails/TeamActionsRow", () => ({
  default: () => <div>Actions</div>,
}));
vi.mock("@/components/tournaments/myTeamDetails/TeamEditForm", () => ({
  default: () => <div>Edit</div>,
}));
vi.mock("@/components/tournaments/myTeamDetails/TeamMatchHistorySection", () => ({
  default: () => <div>History</div>,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/my-teams/team-1"]}>
      <Routes>
        <Route path="/my-teams/:id" element={<MyTeamDetailsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("MyTeamDetails page", () => {
  beforeEach(() => {
    authState.user = null;
    controllerState.loading = false;
    controllerState.notice = "";
    controllerState.row = null;
  });

  it("shows login-required state for guests", () => {
    renderPage();
    expect(screen.getByText("Login required")).toBeInTheDocument();
  });

  it("shows loading state when controller is loading", () => {
    authState.user = { uid: "u1" };
    controllerState.loading = true;
    renderPage();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows not-found state when row is missing", () => {
    authState.user = { uid: "u1" };
    controllerState.loading = false;
    controllerState.notice = "Team not found";
    controllerState.row = null;
    renderPage();
    expect(screen.getByText("Team not found")).toBeInTheDocument();
  });
});

