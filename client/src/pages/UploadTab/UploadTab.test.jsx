import { render, screen } from "@testing-library/react";
import UploadTab from "@/pages/UploadTab/UploadTab";

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ user: null, claims: null }),
}));

vi.mock("@/i18n/LanguageContext", () => ({
  useLang: () => ({
    lang: "en",
    t: {
      upload: {
        title: "Upload screenshot",
        loginRequired: "Login required",
      },
    },
  }),
}));

vi.mock("@/hooks/upload/useUploadAnalyzer", () => ({
  default: () => vi.fn(),
}));

describe("UploadTab", () => {
  it("shows login-required state for guests", () => {
    render(<UploadTab />);

    expect(
      screen.getByRole("heading", { name: "Upload screenshot" })
    ).toBeInTheDocument();
    expect(screen.getByText("Login required")).toBeInTheDocument();
  });
});
