describe("Visual Smoke", () => {
  function mockSharedApis() {
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
            uid: "p1",
            name: "Alpha",
            hiddenElo: 1800,
            matches: 20,
            wins: 13,
            losses: 7,
            winrate: 65,
            avgScore: 2000,
            kda: 2.2,
            rank: 1,
            rankDelta: 2,
          },
          {
            uid: "p2",
            name: "Bravo",
            hiddenElo: 1600,
            matches: 18,
            wins: 10,
            losses: 8,
            winrate: 55.5,
            avgScore: 1500,
            kda: 1.7,
            rank: 2,
            rankDelta: -1,
          },
        ],
      },
    }).as("leaderboard");

    cy.intercept("GET", "**/player/p1?*", {
      statusCode: 200,
      body: {
        name: "Alpha",
        elo: 1800,
        settings: {},
        ranks: {},
        matches: [
          {
            matchId: "m1",
            name: "Alpha",
            score: 2400,
            kills: 19,
            deaths: 10,
            assists: 6,
            damage: 5000,
            damageShare: 24.1,
            result: "victory",
            createdAt: Date.now() - 3600000,
          },
          {
            matchId: "m2",
            name: "Alpha",
            score: 1800,
            kills: 13,
            deaths: 11,
            assists: 7,
            damage: 4200,
            damageShare: 20.3,
            result: "defeat",
            createdAt: Date.now() - 7200000,
          },
        ],
      },
    }).as("player");

    cy.intercept("GET", "**/tournaments*", {
      statusCode: 200,
      body: {
        rows: [
          {
            id: "tour-1",
            title: "Winter Cup",
            status: "upcoming",
            teamFormat: "5x5",
            startsAt: Date.now() + 3600000,
            registeredTeams: 4,
            maxTeams: 16,
            requirements: { minElo: 0, minMatches: 0 },
            prizePool: "$500",
          },
        ],
        total: 1,
      },
    }).as("tournaments");
  }

  it("desktop key pages render without layout break", () => {
    cy.viewport(1440, 900);
    mockSharedApis();

    cy.visit("/players");
    cy.wait("@leaderboard");
    cy.contains("Alpha").should("be.visible");
    cy.screenshot("visual-desktop-players");

    cy.visit("/player/p1");
    cy.wait("@player");
    cy.contains("Alpha").should("be.visible");
    cy.screenshot("visual-desktop-player-profile");

    cy.visit("/tournaments");
    cy.wait("@tournaments");
    cy.contains("Winter Cup").should("be.visible");
    cy.screenshot("visual-desktop-tournaments");

    cy.visit("/help");
    cy.contains("FragPunk").should("be.visible");
    cy.screenshot("visual-desktop-help");
  });

  it("mobile key pages render without major overlap", () => {
    cy.viewport(390, 844);
    mockSharedApis();

    cy.visit("/players");
    cy.wait("@leaderboard");
    cy.get("[data-cy='mobile-quick-nav']").should("be.visible");
    cy.screenshot("visual-mobile-players");

    cy.visit("/tournaments");
    cy.wait("@tournaments");
    cy.contains("Winter Cup").should("be.visible");
    cy.screenshot("visual-mobile-tournaments");
  });
});
