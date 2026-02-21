import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Settings from "@/pages/Settings/Settings";

const { authState } = vi.hoisted(() => ({
  authState: { user: null },
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/i18n/LanguageContext", () => ({
  useLang: () => ({
    t: {
      me: {
        settings: "Settings",
        loginRequired: "Login required",
        settingsSocialsTitle: "Socials",
        settingsHint: "Hint",
        twitch: "Twitch",
        youtube: "YouTube",
        tiktok: "TikTok",
        save: "Save",
        saving: "Saving...",
        saveError: "Save failed",
        socialInvalidTwitch: "Invalid Twitch link or username",
        socialInvalidFragpunk: "Invalid FragPunk ID format. Use nickname#tag",
      },
    },
  }),
}));

describe("Settings", () => {
  beforeEach(() => {
    authState.user = null;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  it("shows login-required state for guests", () => {
    render(<Settings />);
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("Login required")).toBeInTheDocument();
  });

  it("validates socials and blocks save on invalid twitch username", async () => {
    authState.user = {
      uid: "discord:1",
      getIdToken: vi.fn().mockResolvedValue("token-1"),
    };

    const user = userEvent.setup();
    render(<Settings />);

    await screen.findByRole("heading", { name: "Settings" });
    await user.type(screen.getByPlaceholderText("twitch.tv/username"), "bad url!!!");
    const socialsSection = screen
      .getByRole("heading", { name: "Socials" })
      .closest("div");
    await user.click(within(socialsSection).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByText("Invalid Twitch link or username")
      ).toBeInTheDocument();
      expect(screen.getByText("Save failed")).toBeInTheDocument();
    });

    // only initial profile GET should happen; invalid form must not POST
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("validates fragpunk id and blocks save on too-short value", async () => {
    authState.user = {
      uid: "discord:2",
      getIdToken: vi.fn().mockResolvedValue("token-2"),
    };

    const user = userEvent.setup();
    render(<Settings />);

    await screen.findByRole("heading", { name: "FragPunk ID" });
    await user.type(screen.getByPlaceholderText("nickname#tag"), "a#EU1");
    const fragSection = screen
      .getByRole("heading", { name: "FragPunk ID" })
      .closest("div");
    await user.click(within(fragSection).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid FragPunk ID format. Use nickname#tag")).toBeInTheDocument();
      expect(screen.getByText("Save failed")).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("saves valid two-char fragpunk id", async () => {
    authState.user = {
      uid: "discord:3",
      getIdToken: vi.fn().mockResolvedValue("token-3"),
    };

    const user = userEvent.setup();
    render(<Settings />);

    await screen.findByRole("heading", { name: "FragPunk ID" });
    await user.type(screen.getByPlaceholderText("nickname#tag"), "ab#EU1");
    const fragSection = screen
      .getByRole("heading", { name: "FragPunk ID" })
      .closest("div");
    await user.click(within(fragSection).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
    const saveCall = global.fetch.mock.calls.find((call) =>
      String(call?.[0] || "").includes("/profile/settings")
    );
    expect(saveCall).toBeTruthy();
    const payload = JSON.parse(String(saveCall?.[1]?.body || "{}"));
    expect(payload.settings.fragpunkId).toBe("ab#EU1");
  });
});
