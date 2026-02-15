import { render, screen } from "@testing-library/react";
import MyProfile from "@/pages/MyProfile/MyProfile";

const { authState, matchesState } = vi.hoisted(() => ({
  authState: { user: null, claims: null },
  matchesState: { matches: [], loading: false, loadingMore: false, hasMore: false },
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/i18n/LanguageContext", () => ({
  useLang: () => ({
    lang: "en",
    t: {
      me: {
        loginRequired: "Login required",
        loading: "Loading your stats...",
        empty: "No match history yet",
      },
    },
  }),
}));

vi.mock("@/hooks/myProfile/useProfileMatches", () => ({
  default: () => ({
    matches: matchesState.matches,
    loading: matchesState.loading,
    loadingMore: matchesState.loadingMore,
    hasMore: matchesState.hasMore,
    fetchHistory: vi.fn(),
  }),
}));

vi.mock("@/hooks/myProfile/useProfileRemoteData", () => ({
  default: () => ({
    profileRanks: {},
    banInfo: null,
    globalAvg: null,
    loadingGlobal: false,
    globalRanks: null,
    globalMeans: null,
    globalMatchMeans: null,
    loadingRanks: false,
    friends: [],
    friendsLoading: false,
    friendId: "",
    setFriendId: vi.fn(),
  }),
}));

vi.mock("@/hooks/myProfile/useMyProfileViewModel", () => ({
  default: () => ({
    activity: [],
    activityGridWrapRef: { current: null },
    activityLayout: {},
    chartMetric: "score",
    setChartMetric: vi.fn(),
    chartToggleRef: { current: null },
    chartPillRefs: { current: [] },
    pillStyle: {},
    sparkScore: [],
    sparkKda: [],
    sparkWinrate: [],
    showRanks: null,
    vsGlobal: null,
    selectedFriend: null,
    profileAvatarUrl: "",
    shareStatus: "",
    handleCopyShare: vi.fn(),
  }),
}));

vi.mock("@/utils/myProfile/derive", () => ({
  buildSummary: () => (matchesState.matches.length ? { last10: [] } : null),
}));

describe("MyProfile early states", () => {
  beforeEach(() => {
    authState.user = null;
    authState.claims = null;
    matchesState.matches = [];
    matchesState.loading = false;
    matchesState.loadingMore = false;
    matchesState.hasMore = false;
  });

  it("shows login-required state for guests", () => {
    render(<MyProfile />);
    expect(screen.getByText("Login required")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    authState.user = { uid: "discord:1" };
    matchesState.loading = true;
    render(<MyProfile />);
    expect(screen.getByText("Loading your stats...")).toBeInTheDocument();
  });

  it("shows empty state when user has no matches", () => {
    authState.user = { uid: "discord:1" };
    matchesState.loading = false;
    matchesState.matches = [];
    render(<MyProfile />);
    expect(screen.getByText("No match history yet")).toBeInTheDocument();
  });
});
