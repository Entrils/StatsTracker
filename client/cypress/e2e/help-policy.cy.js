describe("Help and Policy Smoke", () => {
  function mockHealthz() {
    cy.intercept("GET", "**/healthz", {
      statusCode: 200,
      body: { ok: true, ts: Date.now() },
    });
  }

  it("renders new help sections and table of contents links", () => {
    mockHealthz();

    cy.visit("/help");

    cy.contains("h1", "Справка").should("be.visible");
    cy.contains("a", "Быстрый старт за 2 минуты").should("be.visible");
    cy.contains("a", "Глоссарий терминов").should("be.visible");
    cy.contains("a", "Приватность простыми словами").should("be.visible");
    cy.contains("h2", "1. Быстрый старт за 2 минуты").should("be.visible");
    cy.contains("h2", "8. Глоссарий терминов").should("be.visible");
    cy.contains("h2", "9. Приватность простыми словами").should("be.visible");
  });

  it("renders policy disclaimer and numbered sections", () => {
    mockHealthz();

    cy.visit("/policy");

    cy.contains("h1", "Политика пользования").should("be.visible");
    cy.contains("ВАЖНО: НЕОФИЦИАЛЬНЫЙ ПРОЕКТ").should("be.visible");
    cy.contains("никак не влияет на игровой процесс").should("be.visible");
    cy.contains("h2", "1. О сервисе").should("be.visible");
    cy.contains("h2", "14. Контакты").should("be.visible");
  });
});
