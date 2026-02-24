async function loadTrackModule(env = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  Object.entries(env).forEach(([key, value]) => vi.stubEnv(key, value));
  return import("@/utils/analytics/trackUxEvent");
}

describe("trackUxEvent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns false for empty event", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { trackUxEvent } = await loadTrackModule();

    await expect(trackUxEvent("")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends analytics payload with session id and meta", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { trackUxEvent } = await loadTrackModule({
      VITE_BACKEND_URL: "http://localhost:4000",
    });

    const result = await trackUxEvent("profile_opened", {
      valueMs: "123",
      meta: { tab: "overview" },
    });

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, req] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:4000/analytics/event");
    const body = JSON.parse(req.body);
    expect(body.event).toBe("profile_opened");
    expect(body.valueMs).toBe(123);
    expect(body.meta).toEqual({ tab: "overview" });
    expect(body.sessionId).toBeTruthy();
    expect(localStorage.getItem("ux:session-id")).toBe(body.sessionId);
  });

  it("returns false when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);
    const { trackUxEvent } = await loadTrackModule();

    await expect(trackUxEvent("x")).resolves.toBe(false);
  });
});
