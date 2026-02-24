async function loadReporterWithEnv(env = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  Object.entries(env).forEach(([key, value]) => {
    vi.stubEnv(key, value);
  });
  return import("@/utils/clientErrors/reporter");
}

describe("client error reporter", () => {
  it("sends sanitized payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { createClientErrorReporter } = await loadReporterWithEnv({
      VITE_CLIENT_ERROR_SAMPLE_RATE: "1",
    });
    const reporter = createClientErrorReporter({
      backendUrl: "http://localhost:4000",
      getUid: () => "player@example.com",
    });

    reporter.reportWindowError({
      message: "boom player@example.com Bearer abc123",
      error: { stack: "Error: x\n at y?token=secret" },
      filename: "https://site.com/app.js?access_token=super-secret",
      lineno: 12,
      colno: 7,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(body.message).toContain("<email>");
    expect(body.message).toContain("Bearer <token>");
    expect(body.source).toBe("https://site.com/app.js");
    expect(body.uid).toBe("<email>");
    expect(body.line).toBe(12);
    expect(body.col).toBe(7);
  });

  it("ignores extension errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { createClientErrorReporter } = await loadReporterWithEnv({
      VITE_CLIENT_ERROR_SAMPLE_RATE: "1",
    });
    const reporter = createClientErrorReporter({
      backendUrl: "http://localhost:4000",
      getUid: () => "u1",
    });

    reporter.reportWindowError({
      message: "ext failed",
      filename: "chrome-extension://id/content.js",
      lineno: 1,
      colno: 1,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dedupes repeated identical errors in dedupe window", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { createClientErrorReporter } = await loadReporterWithEnv({
      VITE_CLIENT_ERROR_SAMPLE_RATE: "1",
      VITE_CLIENT_ERROR_DEDUPE_MS: "30000",
    });
    const reporter = createClientErrorReporter({
      backendUrl: "http://localhost:4000",
      getUid: () => "u1",
    });

    const event = {
      message: "same error",
      filename: "https://site.com/a.js",
      lineno: 5,
      colno: 9,
    };

    reporter.reportWindowError(event);
    reporter.reportWindowError(event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
