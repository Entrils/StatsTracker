import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Navbar from "@/components/NavBar/Navbar";

const {
  authState,
  dedupedJsonRequestMock,
  signOutMock,
  setLangMock,
} = vi.hoisted(() => ({
  authState: { user: null, claims: null },
  dedupedJsonRequestMock: vi.fn(),
  signOutMock: vi.fn(),
  setLangMock: vi.fn(),
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/i18n/LanguageContext", () => ({
  useLang: () => ({
    lang: "en",
    setLang: setLangMock,
    t: {
      nav: {
        upload: "Upload",
        players: "Players",
        tournaments: "Tournaments",
        help: "Help",
        admin: "Admin",
        myProfile: "My profile",
        friends: "Friends",
        achievements: "Achievements",
        settings: "Settings",
        Logout: "Logout",
      },
    },
  }),
}));

vi.mock("@/buttons/DiscordLoginButton/DiscordLoginButton", () => ({
  default: () => <button>Discord Login</button>,
}));

vi.mock("@/utils/network/dedupedFetch", () => ({
  dedupedJsonRequest: (...args) => dedupedJsonRequestMock(...args),
}));

vi.mock("firebase/auth", () => ({
  signOut: (...args) => signOutMock(...args),
}));

vi.mock("@/firebase", () => ({
  auth: {},
}));

function renderNavbar() {
  return render(
    <MemoryRouter initialEntries={["/players"]}>
      <Navbar />
    </MemoryRouter>
  );
}

describe("Navbar", () => {
  beforeEach(() => {
    authState.user = null;
    authState.claims = null;
    dedupedJsonRequestMock.mockReset();
    signOutMock.mockReset();
    setLangMock.mockReset();
    sessionStorage.clear();
  });

  it("shows Discord login when user is not authenticated", () => {
    renderNavbar();
    expect(
      screen.getAllByRole("button", { name: "Discord Login" }).length
    ).toBeGreaterThan(0);
  });

  it("loads friend requests and allows logout for authenticated user", async () => {
    authState.user = {
      uid: "discord:123",
      getIdToken: vi.fn().mockResolvedValue("token-1"),
    };
    authState.claims = {
      provider: "discord",
      username: "Entrils",
      avatar: "avatar-hash",
    };
    dedupedJsonRequestMock.mockResolvedValue({ rows: [{ uid: "u1" }, { uid: "u2" }] });
    signOutMock.mockResolvedValue();
    sessionStorage.setItem("discord_oauth_code", "abc123");

    const user = userEvent.setup();
    renderNavbar();

    expect(await screen.findByText("Entrils")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole("button", { name: /Entrils/i }));
    await user.click(screen.getAllByRole("button", { name: "Logout" })[0]);

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledTimes(1);
    });
    expect(sessionStorage.getItem("discord_oauth_code")).toBeNull();
  });

  it("shows tournaments link for admin", async () => {
    authState.user = {
      uid: "discord:999",
      getIdToken: vi.fn().mockResolvedValue("token-1"),
    };
    authState.claims = {
      provider: "discord",
      username: "Admin",
      admin: true,
    };
    dedupedJsonRequestMock.mockResolvedValue({ rows: [] });

    renderNavbar();

    const links = await screen.findAllByRole("link", { name: "Tournaments" });
    expect(links.length).toBeGreaterThan(0);
  });
});
