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
    global.fetch = vi.fn();
    window.history.pushState({}, "", "/auth/discord/callback");
  });

  it("redirects to home when code is missing", async () => {
    render(<DiscordCallback />);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("redirects to home when oauth state is missing", async () => {
    window.history.pushState({}, "", "/auth/discord/callback?code=abc123&state=state-1");

    render(<DiscordCallback />);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  it("redirects to home when oauth state does not match", async () => {
    sessionStorage.setItem("discord_oauth_state", "expected-state");
    sessionStorage.setItem("discord_oauth_state_ts", String(Date.now()));
    window.history.pushState({}, "", "/auth/discord/callback?code=abc123&state=other-state");

    render(<DiscordCallback />);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  it("completes login flow and redirects to home", async () => {
    sessionStorage.setItem("discord_oauth_state", "state-1");
    sessionStorage.setItem("discord_oauth_state_ts", String(Date.now()));
    window.history.pushState({}, "", "/auth/discord/callback?code=abc123&state=state-1");
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
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/discord"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ code: "abc123", state: "state-1" }),
        })
      );
      expect(signInWithCustomTokenMock).toHaveBeenCalledWith(authMock, "token-1");
      expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
    });
  });
});
