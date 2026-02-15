import { render, screen, waitFor } from "@testing-library/react";
import DiscordCallback from "@/pages/DiscordCallback";

const { navigateMock, signInWithCustomTokenMock, authMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  signInWithCustomTokenMock: vi.fn(),
  authMock: {
    onAuthStateChanged: vi.fn(),
  },
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("firebase/auth", () => ({
  signInWithCustomToken: (...args) => signInWithCustomTokenMock(...args),
}));

vi.mock("@/firebase", () => ({
  auth: authMock,
}));

describe("DiscordCallback", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    signInWithCustomTokenMock.mockReset();
    authMock.onAuthStateChanged.mockReset();
    sessionStorage.clear();
    window.history.pushState({}, "", "/auth/discord/callback");
  });

  it("redirects to home when code is missing", async () => {
    render(<DiscordCallback />);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("completes login flow and redirects to home", async () => {
    window.history.pushState({}, "", "/auth/discord/callback?code=abc123");
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ firebaseToken: "token-1" }),
    });
    signInWithCustomTokenMock.mockResolvedValue({});
    authMock.onAuthStateChanged.mockImplementation((cb) => {
      cb({ uid: "discord:1" });
      return () => {};
    });

    render(<DiscordCallback />);

    expect(screen.getByText("Logging in with Discord...")).toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(signInWithCustomTokenMock).toHaveBeenCalledWith(authMock, "token-1");
      expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
    });
  });
});
