import { applyRouteSeo, resolveSeo } from "@/seo/routeSeo";

describe("route seo", () => {
  it("resolves known page seo", () => {
    const home = resolveSeo("/players");
    expect(home.title).toContain("Leaderboard");

    const player = resolveSeo("/player/u1");
    expect(player.title).toContain("Player Profile");

    const help = resolveSeo("/help");
    expect(help.title).toContain("Help");
  });

  it("applies public route meta tags", () => {
    applyRouteSeo("/players");

    expect(document.title).toContain("Leaderboard");
    expect(
      document.head.querySelector('meta[name="robots"]')?.getAttribute("content")
    ).toContain("index, follow");
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")
    ).toBe("https://fragpunktracker.fun/players");
    expect(
      document.head.querySelector('meta[property="og:url"]')?.getAttribute("content")
    ).toBe("https://fragpunktracker.fun/players");
  });

  it("applies noindex robots for private routes", () => {
    applyRouteSeo("/settings");
    expect(
      document.head.querySelector('meta[name="robots"]')?.getAttribute("content")
    ).toBe("noindex, nofollow, noarchive");
  });

  it("marks auth route as private and keeps canonical stable", () => {
    applyRouteSeo("/auth/discord/callback");
    expect(
      document.head.querySelector('meta[name="robots"]')?.getAttribute("content")
    ).toBe("noindex, nofollow, noarchive");
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")
    ).toBe("https://fragpunktracker.fun/auth/discord/callback");
  });

  it("upserts meta tags without creating duplicates", () => {
    applyRouteSeo("/players");
    applyRouteSeo("/players");
    applyRouteSeo("/help");

    expect(document.head.querySelectorAll('meta[name="description"]').length).toBe(1);
    expect(document.head.querySelectorAll('meta[name="robots"]').length).toBe(1);
    expect(document.head.querySelectorAll('meta[property="og:url"]').length).toBe(1);
    expect(document.head.querySelectorAll('link[rel="canonical"]').length).toBe(1);
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")
    ).toBe("https://fragpunktracker.fun/help");
  });
});
