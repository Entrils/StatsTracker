import { dedupedJsonRequest } from "@/utils/network/dedupedFetch";

describe("dedupedJsonRequest", () => {
  it("dedupes inflight requests by key", async () => {
    let resolveFetch;
    const fetcher = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const p1 = dedupedJsonRequest("k1", fetcher);
    const p2 = dedupedJsonRequest("k1", fetcher);
    await Promise.resolve();
    resolveFetch({ ok: true });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ ok: true });
    expect(r2).toEqual({ ok: true });
  });

  it("caches resolved response for ttl", async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 1 });
    const a = await dedupedJsonRequest("k2", fetcher, 5000);
    const b = await dedupedJsonRequest("k2", fetcher, 5000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it("applies failed cooldown for 429 and retries after cooldown", async () => {
    vi.useFakeTimers();
    const err = new Error("rate");
    err.status = 429;
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ ok: true });

    await expect(dedupedJsonRequest("k3", fetcher)).rejects.toThrow("rate");
    await expect(dedupedJsonRequest("k3", fetcher)).rejects.toThrow("rate");
    expect(fetcher).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(8001);
    const result = await dedupedJsonRequest("k3", fetcher);
    expect(result).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
