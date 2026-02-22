import { render, screen } from "@testing-library/react";
import Admin from "@/pages/Admin/Admin";

const { authState } = vi.hoisted(() => ({
  authState: { user: null, claims: null },
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => authState,
}));
vi.mock("@/i18n/LanguageContext", () => ({
  useLang: () => ({ t: {} }),
}));

describe("Admin page", () => {
  beforeEach(() => {
    authState.user = null;
    authState.claims = null;
  });

  it("shows login-required state for guests", () => {
    render(<Admin />);
    expect(screen.getByRole("heading", { name: "Admin" })).toBeInTheDocument();
    expect(screen.getByText("Login required")).toBeInTheDocument();
  });

  it("shows access-denied state for non-admin users", () => {
    authState.user = { uid: "u1", getIdToken: vi.fn().mockResolvedValue("token-1") };
    authState.claims = { admin: false, role: "user" };
    render(<Admin />);
    expect(screen.getByText("Access denied")).toBeInTheDocument();
  });
});
