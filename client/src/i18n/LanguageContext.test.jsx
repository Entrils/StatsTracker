import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider, useLang } from "@/i18n/LanguageContext";

function Probe() {
  const { lang, setLang } = useLang();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <button onClick={() => setLang("de")}>set-de</button>
    </div>
  );
}

describe("LanguageProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, "language", {
      configurable: true,
      value: "en-US",
    });
  });

  it("initializes from localStorage and updates document attrs", async () => {
    localStorage.setItem("lang", "fr");
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>
    );

    expect(screen.getByTestId("lang")).toHaveTextContent("fr");
    expect(document.documentElement.lang).toBe("fr");
    expect(document.documentElement.dataset.lang).toBe("fr");

    await user.click(screen.getByRole("button", { name: "set-de" }));
    await waitFor(() => {
      expect(screen.getByTestId("lang")).toHaveTextContent("de");
      expect(localStorage.getItem("lang")).toBe("de");
    });
  });
});
