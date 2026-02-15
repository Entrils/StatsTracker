import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Friends from "@/pages/Friends/Friends";

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
        title: "Friends",
        tabFriends: "In friends",
        tabRequests: "Requests",
        tabOutgoing: "Outgoing",
        loading: "Loading...",
        empty: "No friends yet",
        emptyRequests: "No requests yet",
        emptyOutgoing: "No outgoing requests",
        accept: "Accept",
        reject: "Reject",
      },
    },
  }),
}));

function renderFriends() {
  return render(
    <MemoryRouter>
      <Friends />
    </MemoryRouter>
  );
}

describe("Friends", () => {
  beforeEach(() => {
    authState.user = null;
  });

  it("shows login-required state for guests", () => {
    renderFriends();
    expect(screen.getByText("Login required")).toBeInTheDocument();
  });

  it("accepts incoming friend request", async () => {
    authState.user = {
      uid: "discord:1",
      getIdToken: vi.fn().mockResolvedValue("token-1"),
    };

    global.fetch = vi.fn().mockImplementation(async (url, options) => {
      if (String(url).includes("/friends/list")) {
        return { ok: true, json: async () => ({ rows: [] }) };
      }
      if (String(url).includes("/friends/requests")) {
        return {
          ok: true,
          json: async () => ({
            rows: [{ uid: "u2", name: "Bob", ranks: {} }],
          }),
        };
      }
      if (String(url).includes("/friends/outgoing")) {
        return { ok: true, json: async () => ({ rows: [] }) };
      }
      if (String(url).includes("/friends/accept")) {
        return { ok: true, json: async () => ({ status: "friend" }) };
      }
      return { ok: true, json: async () => ({ rows: [] }) };
    });

    const user = userEvent.setup();
    renderFriends();

    await user.click(screen.getByRole("button", { name: "Requests" }));
    expect(await screen.findByText("Bob")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/friends/accept"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});
