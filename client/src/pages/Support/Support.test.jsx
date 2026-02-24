import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Support from "@/pages/Support/Support";

vi.mock("react-google-recaptcha", () => ({
  default: ({ onChange }) => (
    <button type="button" onClick={() => onChange("captcha-token")}>
      Complete captcha
    </button>
  ),
}));

vi.mock("@/i18n/LanguageContext", () => ({
  useLang: () => ({
    t: {
      support: {
        title: "Support",
        intro: "Contact us",
        emailLabel: "Your email",
        messageLabel: "Message",
        send: "Send",
        sent: "Message sent",
        blocked: "Spam protection triggered",
        emailError: "Enter a valid email",
        messageError: "Message must be 10-2000 characters",
      },
    },
  }),
}));

describe("Support page", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_FORMSPREE_ENDPOINT", "https://example.com/forms");
    vi.stubEnv("VITE_RECAPTCHA_SITE_KEY", "site-key");
    localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  it("submits valid form and shows success status", async () => {
    const user = userEvent.setup();
    render(<Support />);

    await user.type(screen.getByPlaceholderText("you@example.com"), "user@test.com");
    await user.type(screen.getByLabelText("Message"), "This is a valid support message.");
    await user.click(screen.getByRole("button", { name: "Complete captcha" }));
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Message sent")).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("shows validation errors when form is invalid", async () => {
    const user = userEvent.setup();
    const { container } = render(<Support />);

    await user.click(screen.getByRole("button", { name: "Complete captcha" }));
    const form = container.querySelector("form");
    fireEvent.submit(form);

    expect(screen.getByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Message must be 10-2000 characters")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("blocks honeypot submissions", async () => {
    const user = userEvent.setup();
    render(<Support />);

    await user.type(screen.getByPlaceholderText("you@example.com"), "user@test.com");
    await user.type(screen.getByLabelText("Message"), "This is a valid support message.");
    await user.click(screen.getByRole("button", { name: "Complete captcha" }));
    await user.type(screen.getByLabelText("Website"), "bot");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Spam protection triggered")).toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
