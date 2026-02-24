describe("Visual Smoke", () => {
  const BREAKPOINTS = [
    { name: "360", width: 360, height: 780 },
    { name: "390", width: 390, height: 844 },
    { name: "768", width: 768, height: 1024 },
    { name: "1024", width: 1024, height: 768 },
    { name: "1440", width: 1440, height: 900 },
  ];

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

  function assertNoBodyOverflow() {
    cy.window().then((win) => {
      const doc = win.document.documentElement;
      if (doc.scrollWidth > win.innerWidth + 2) {
        throw new Error(
          `Horizontal overflow detected: scrollWidth=${doc.scrollWidth}, innerWidth=${win.innerWidth}`,
        );
      }
    });
  }

  it("renders key pages across target breakpoints", () => {
    mockSharedApis();

    BREAKPOINTS.forEach((bp) => {
      cy.viewport(bp.width, bp.height);

      cy.visit("/players");
      cy.wait("@leaderboard");
      cy.contains("Alpha").should("be.visible");
      assertNoBodyOverflow();
      cy.screenshot(`visual-${bp.name}-players`);

      cy.visit("/tournaments");
      cy.wait("@tournaments");
      cy.contains("Winter Cup").should("be.visible");
      assertNoBodyOverflow();
      cy.screenshot(`visual-${bp.name}-tournaments`);
    });
  });

  it("keeps consistent loading/empty/error/success states", () => {
    cy.viewport(1024, 768);
    let mode = "success";

    cy.intercept("GET", "**/healthz", {
      statusCode: 200,
      body: { ok: true, ts: Date.now() },
    });

    cy.intercept("GET", "**/tournaments*", (req) => {
      if (mode === "loading") {
        req.reply({
          delay: 1200,
          statusCode: 200,
          body: { rows: [], total: 0 },
        });
        return;
      }
      if (mode === "empty") {
        req.reply({ statusCode: 200, body: { rows: [], total: 0 } });
        return;
      }
      if (mode === "error") {
        req.reply({ statusCode: 500, body: { error: "boom" } });
        return;
      }
      req.reply({
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
      });
    }).as("tournamentsState");

    mode = "loading";
    cy.visit("/tournaments");
    cy.get("[data-cy='state-message'][data-tone='loading']").should("be.visible");
    cy.wait("@tournamentsState");

    mode = "empty";
    cy.visit("/tournaments");
    cy.wait("@tournamentsState");
    cy.get("[data-cy='state-message'][data-tone='empty']").should("be.visible");

    mode = "error";
    cy.visit("/tournaments");
    cy.wait("@tournamentsState");
    cy.get("[data-cy='state-message'][data-tone='error']").should("be.visible");

    mode = "success";
    cy.visit("/tournaments");
    cy.wait("@tournamentsState");
    cy.contains("Winter Cup").should("be.visible");
  });
});
