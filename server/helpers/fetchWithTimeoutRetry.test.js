import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeoutRetry, FetchRetryError } from "./fetchWithTimeoutRetry.js";

describe("fetchWithTimeoutRetry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries retryable status and then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 200, ok: true });
    global.fetch = fetchMock;

    const res = await fetchWithTimeoutRetry(
      "https://example.com",
      {},
      { retries: 1, retryDelayMs: 0, jitterRatio: 0, timeoutMs: 100 }
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws aborted error when external signal aborts before request", async () => {
    const controller = new AbortController();
    controller.abort();
    global.fetch = vi.fn();

    await expect(
      fetchWithTimeoutRetry(
        "https://example.com",
        { signal: controller.signal },
        { retries: 1, timeoutMs: 50 }
      )
    ).rejects.toMatchObject({
      name: "FetchRetryError",
      type: "aborted",
    });
  });

  it("throws timeout error when request exceeds timeout", async () => {
    global.fetch = vi.fn((_, options = {}) => {
      return new Promise((_, reject) => {
        options.signal?.addEventListener("abort", () => {
          reject(new Error("aborted by timeout"));
        });
      });
    });

    let error = null;
    try {
      await fetchWithTimeoutRetry("https://example.com", {}, { retries: 0, timeoutMs: 20 });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(FetchRetryError);
    expect(error.type).toBe("timeout");
  });
});
