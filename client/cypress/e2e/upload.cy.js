describe("Upload OCR Flows", () => {
  function visitUploadWithMock(outcomes) {
    cy.intercept("GET", "**/healthz", {
      statusCode: 200,
      body: { ok: true, ts: Date.now() },
    });

    cy.visit("/upload", {
      onBeforeLoad(win) {
        win.localStorage.setItem(
          "__cypress_auth",
          JSON.stringify({
            uid: "cy-user-1",
            token: "cy-token-1",
            claims: { username: "cy-user-1" },
          })
        );
        win.__CY_UPLOAD_MOCK_OUTCOMES = outcomes;
      },
    });
  }

  it("handles OCR success path", () => {
    visitUploadWithMock([
      {
        status: "ok",
        message: "Uploaded",
        finalMatch: {
          matchId: "abc123",
          result: "victory",
          score: 2450,
          kills: 18,
          deaths: 9,
          assists: 7,
          damage: 5100,
          damageShare: 24.5,
        },
      },
    ]);

    cy.get("[data-cy='upload-input']").selectFile(
      {
        contents: Cypress.Buffer.from("fake-image"),
        fileName: "ocr-success.png",
        mimeType: "image/png",
      },
      { force: true }
    );
    cy.get("[data-cy='upload-analyze']").click();

    cy.get("[data-cy='upload-batch']").should("be.visible");
    cy.get("[data-cy='upload-batch-item']").should("have.length", 1);
    cy.get("[data-cy='upload-batch-item']").first().should("have.attr", "data-status", "ok");
    cy.get("[data-cy='upload-last-match']").should("be.visible");
  });

  it("handles OCR fallback/error path", () => {
    visitUploadWithMock([
      {
        status: "error",
        message: "OCR failed",
        remaining: 2,
      },
    ]);

    cy.get("[data-cy='upload-input']").selectFile(
      {
        contents: Cypress.Buffer.from("fake-image-2"),
        fileName: "ocr-fallback.png",
        mimeType: "image/png",
      },
      { force: true }
    );
    cy.get("[data-cy='upload-analyze']").click();

    cy.get("[data-cy='upload-batch']").should("be.visible");
    cy.get("[data-cy='upload-batch-item']").should("have.length", 1);
    cy.get("[data-cy='upload-batch-item']").first().should("have.attr", "data-status", "error");
    cy.contains("2").should("be.visible");
    cy.get("[data-cy='upload-last-match']").should("not.exist");
  });
});
