describe("Settings FragPunk ID", () => {
  it("persists fragpunk id after save and page reload", () => {
    const state = { fragpunkId: "" };

    cy.intercept("GET", "**/healthz", {
      statusCode: 200,
      body: { ok: true, ts: Date.now() },
    });

    cy.intercept("GET", "**/profile/cy-user-settings*", (req) => {
      req.reply({
        statusCode: 200,
        body: {
          uid: "cy-user-settings",
          name: "Cypress User",
          settings: state.fragpunkId ? { fragpunkId: state.fragpunkId } : {},
          ranks: {},
        },
      });
    }).as("getProfile");

    cy.intercept("POST", "**/profile/settings", (req) => {
      const value = String(req.body?.settings?.fragpunkId || "");
      state.fragpunkId = value;
      req.reply({
        statusCode: 200,
        body: { ok: true },
      });
    }).as("saveSettings");

    cy.visit("/settings", {
      onBeforeLoad(win) {
        win.localStorage.setItem(
          "__cypress_auth",
          JSON.stringify({
            uid: "cy-user-settings",
            token: "cy-token-settings",
            claims: { username: "cy-user-settings" },
          })
        );
      },
    });

    cy.wait("@getProfile");
    cy.get("input[placeholder='nickname#tag']").clear().type("ab#EU1");
    cy.contains("h2", "FragPunk ID")
      .closest("div")
      .within(() => {
        cy.contains("button", "Save").click();
      });
    cy.wait("@saveSettings");

    cy.reload();
    cy.wait("@getProfile");
    cy.contains("ab#EU1").should("be.visible");
  });
});
