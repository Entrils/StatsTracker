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
});
