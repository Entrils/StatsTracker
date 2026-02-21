describe("Leaderboard", () => {
  it("renders leaderboard rows from backend payload", () => {
    cy.intercept("GET", "**/healthz", {
      statusCode: 200,
      body: { ok: true, ts: Date.now() },
    });
    cy.intercept("GET", "**/leaderboard*", {
      statusCode: 200,
      body: {
        total: 2,
        steamOnline: 12345,
        rows: [
          {
            uid: "u1",
            name: "Alpha",
            hiddenElo: 1500,
            matches: 20,
            wins: 12,
            losses: 8,
            winrate: 60,
            avgScore: 1200,
            kda: 2.1,
          },
          {
            uid: "u2",
            name: "Bravo",
            hiddenElo: 1400,
            matches: 18,
            wins: 10,
            losses: 8,
            winrate: 55.5,
            avgScore: 900,
            kda: 1.8,
          },
        ],
      },
    }).as("leaderboard");

    cy.visit("/players");
    cy.wait("@leaderboard");

    cy.contains("Alpha").should("be.visible");
    cy.contains("Bravo").should("be.visible");
  });

  it("shows error state when leaderboard request fails", () => {
    cy.intercept("GET", "**/healthz", {
      statusCode: 200,
      body: { ok: true, ts: Date.now() },
    });
    cy.intercept("GET", "**/leaderboard*", {
      statusCode: 500,
      body: "Backend down",
    }).as("leaderboardError");

    cy.visit("/players");
    cy.wait("@leaderboardError");

    cy.contains("Backend down").should("be.visible");
  });
});
