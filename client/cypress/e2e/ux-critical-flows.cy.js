describe("Critical UX Flows", () => {
  function mockHealthz() {
    cy.intercept("GET", "**/healthz", {
      statusCode: 200,
      body: { ok: true, ts: Date.now() },
    });
  }

  it("new user: players -> profile", () => {
    mockHealthz();

    cy.intercept("GET", "**/leaderboard*", {
      statusCode: 200,
      body: {
        total: 1,
        steamOnline: 4321,
        rows: [
          {
            uid: "p1",
            name: "Alpha",
            hiddenElo: 1777,
            matches: 12,
            wins: 8,
            losses: 4,
            winrate: 66.7,
            avgScore: 2100,
            kda: 2.3,
            rank: 1,
            rankDelta: 2,
          },
        ],
      },
    }).as("leaderboard");

    cy.intercept("GET", "**/player/p1?*", {
      statusCode: 200,
      body: {
        name: "Alpha",
        elo: 1777,
        matches: [
          {
            matchId: "m1",
            name: "Alpha",
            score: 2500,
            kills: 20,
            deaths: 10,
            assists: 7,
            damage: 5000,
            damageShare: 22.5,
            result: "victory",
            createdAt: Date.now() - 60_000,
          },
          {
            matchId: "m2",
            name: "Alpha",
            score: 1800,
            kills: 14,
            deaths: 11,
            assists: 6,
            damage: 3900,
            damageShare: 18.1,
            result: "defeat",
            createdAt: Date.now() - 120_000,
          },
        ],
        settings: {},
        ranks: {},
      },
    }).as("playerProfile");

    cy.visit("/players");
    cy.wait("@leaderboard");
    cy.contains("a", "Alpha").first().click();

    cy.url().should("include", "/player/p1");
    cy.wait("@playerProfile");
    cy.contains("Alpha").should("be.visible");
  });

  it("viewer flow: tournament details -> match page", () => {
    mockHealthz();

    const now = Date.now();
    cy.intercept("GET", "**/tournaments*", (req) => {
      const url = req.url || "";

      if (url.includes("/tournaments/tour-1/matches/m1/chat")) {
        req.reply({
          statusCode: 403,
          body: { error: "Forbidden" },
        });
        return;
      }

      if (url.includes("/tournaments/tour-1/matches/m1")) {
        req.reply({
          statusCode: 200,
          body: {
            tournament: {
              id: "tour-1",
              title: "Winter Cup",
              teamFormat: "5x5",
              mapPool: ["Yggdrasil", "Naos", "Dongtian"],
            },
            match: {
              id: "m1",
              round: 1,
              stage: "single",
              status: "pending",
              scheduledAt: now + 30 * 60 * 1000,
              bestOf: 1,
              teamAScore: 0,
              teamBScore: 0,
              teamA: {
                teamId: "tA",
                teamName: "Team Alpha",
                captainUid: "capA",
                members: [{ uid: "capA", name: "A Captain", role: "captain", elo: 1800 }],
              },
              teamB: {
                teamId: "tB",
                teamName: "Team Bravo",
                captainUid: "capB",
                members: [{ uid: "capB", name: "B Captain", role: "captain", elo: 1760 }],
              },
              readyCheck: {
                status: "pending",
                teamAReady: false,
                teamBReady: false,
                deadlineAt: now + 35 * 60 * 1000,
              },
              veto: {
                status: "pending",
                availableMaps: ["Yggdrasil", "Naos", "Dongtian"],
                bans: [],
                picks: [],
              },
            },
          },
        });
        return;
      }

      if (url.includes("/tournaments/tour-1")) {
        req.reply({
          statusCode: 200,
          body: {
            tournament: {
              id: "tour-1",
              title: "Winter Cup",
              status: "upcoming",
              teamFormat: "5x5",
              bracketType: "single_elimination",
              startsAt: now + 60 * 60 * 1000,
              registrationDeadline: now + 45 * 60 * 1000,
              requirements: { minElo: 0, minMatches: 0 },
            },
            registrations: [],
            matches: [
              {
                id: "m1",
                round: 1,
                stage: "single",
                status: "pending",
                bestOf: 1,
                teamAScore: 0,
                teamBScore: 0,
                teamA: { teamId: "tA", teamName: "Team Alpha" },
                teamB: { teamId: "tB", teamName: "Team Bravo" },
              },
            ],
          },
        });
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
              startsAt: now + 60 * 60 * 1000,
              registeredTeams: 2,
              maxTeams: 16,
              requirements: { minElo: 0, minMatches: 0 },
              prizePool: "$500",
            },
          ],
          total: 1,
        },
      });
    }).as("tournamentsApi");

    cy.visit("/tournaments");
    cy.contains("a", "Winter Cup").click();

    cy.url().should("include", "/tournaments/tour-1");
    cy.get("button").eq(3).click();
    cy.get('a[href="/tournaments/tour-1/matches/m1"]').first().click();

    cy.url().should("include", "/tournaments/tour-1/matches/m1");
    cy.contains("Winter Cup").should("be.visible");
    cy.contains("Team Alpha").should("be.visible");
    cy.contains("Team Bravo").should("be.visible");
  });
});
