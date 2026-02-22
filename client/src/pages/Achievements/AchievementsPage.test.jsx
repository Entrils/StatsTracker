import { render, screen } from "@testing-library/react";
import AchievementsPage from "@/pages/Achievements/Achievements";

const { authState } = vi.hoisted(() => ({
  authState: { user: null },
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/i18n/LanguageContext", () => ({
  useLang: () => ({
    t: {
      friends: {
        login: "Login required",
        loading: "Loading...",
      },
      achievements: {
        title: "Achievements",
        hint: "Your progress and unlock dates",
        loadError: "Failed to load achievements",
      },
    },
  }),
}));

vi.mock("@/components/Achievements/Achievements", () => ({
  default: () => <div>Achievements body</div>,
}));

describe("Achievements page", () => {
  beforeEach(() => {
    authState.user = null;
    global.fetch = vi.fn();
  });

  it("shows login-required state for guests", () => {
    render(<AchievementsPage />);
    expect(screen.getByText("Login required")).toBeInTheDocument();
  });

  it("shows error state when loading fails", async () => {
    authState.user = {
      uid: "u1",
      getIdToken: vi.fn().mockResolvedValue("token-1"),
    };
    global.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "boom" }),
    }));

    render(<AchievementsPage />);
    expect(await screen.findByText("boom")).toBeInTheDocument();
  });
});

