describe("Navigation Smoke", () => {
  it("opens help page and keeps navbar visible", () => {
    cy.intercept("GET", "**/healthz", {
      statusCode: 200,
      body: { ok: true, ts: Date.now() },
    });

    cy.visit("/help");

    cy.contains("FragPunk").should("be.visible");
    cy.url().should("include", "/help");
  });

  it("mobile quick nav routes guest between players/tournaments/help", () => {
    cy.viewport(390, 844);
    cy.intercept("GET", "**/healthz", {
      statusCode: 200,
      body: { ok: true, ts: Date.now() },
    });
    cy.intercept("GET", "**/leaderboard*", {
      statusCode: 200,
      body: { total: 0, steamOnline: 0, rows: [] },
    });
    cy.intercept("GET", "**/tournaments*", {
      statusCode: 200,
      body: { rows: [], total: 0 },
    });

    cy.visit("/players");
    cy.get("[data-cy='mobile-quick-nav']").should("be.visible");

    cy.get("[data-cy='mobile-quick-link-tournaments']").click();
    cy.url().should("include", "/tournaments");

    cy.get("[data-cy='mobile-quick-link-help']").click();
    cy.url().should("include", "/help");

    cy.get("[data-cy='mobile-quick-link-players']").click();
    cy.url().should("satisfy", (url) => url.includes("/players") || url.endsWith("/"));
  });

  it("hides mobile quick nav when offcanvas is opened", () => {
    cy.viewport(390, 844);
    cy.intercept("GET", "**/healthz", {
      statusCode: 200,
      body: { ok: true, ts: Date.now() },
    });
    cy.intercept("GET", "**/leaderboard*", {
      statusCode: 200,
      body: { total: 0, steamOnline: 0, rows: [] },
    });

    cy.visit("/players");
    cy.get("[data-cy='mobile-quick-nav']").should("be.visible");
    cy.get("[data-cy='nav-burger']").click();
    cy.get("[data-cy='nav-offcanvas']").should("be.visible");
    cy.get("[data-cy='mobile-quick-nav']").should("not.be.visible");
  });
});
