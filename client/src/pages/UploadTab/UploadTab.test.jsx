import { render, screen } from "@testing-library/react";
import UploadTab from "@/pages/UploadTab/UploadTab";

const { authState } = vi.hoisted(() => ({
  authState: { user: null, claims: null },
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/i18n/LanguageContext", () => ({
  useLang: () => ({
    lang: "en",
    t: {
      upload: {
        title: "Upload screenshot",
        loginRequired: "Login required",
        idle: "Select a screenshot to start analysis",
      },
    },
  }),
}));

vi.mock("@/hooks/upload/useUploadAnalyzer", () => ({
  default: () => vi.fn(),
}));

describe("UploadTab", () => {
  beforeEach(() => {
    authState.user = null;
    authState.claims = null;
  });

  it("shows login-required state for guests", () => {
    render(<UploadTab />);

    expect(
      screen.getByRole("heading", { name: "Upload screenshot" })
    ).toBeInTheDocument();
    expect(screen.getByText("Login required")).toBeInTheDocument();
  });

  it("shows idle state before first analysis", () => {
    authState.user = {
      uid: "discord:1",
      getIdToken: vi.fn().mockResolvedValue("token"),
    };

    render(<UploadTab />);
    expect(
      screen.getByText("Select a screenshot to start analysis")
    ).toBeInTheDocument();
  });
});
