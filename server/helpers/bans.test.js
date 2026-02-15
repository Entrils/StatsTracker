import { describe, it, expect, vi } from "vitest";
import { createBanHelpers } from "./bans.js";

describe("ban helpers", () => {
  it("caches active bans for ttl window", async () => {
    const get = vi.fn().mockResolvedValue({
      docs: [{ id: "u1" }, { id: "u2" }],
    });
    const db = {
      collection: () => ({
        where: () => ({ get }),
      }),
    };

    const { getActiveBansSet } = createBanHelpers({
      db,
      logger: { warn: vi.fn() },
      BAN_CACHE_TTL_MS: 60000,
    });

    const first = await getActiveBansSet();
    const second = await getActiveBansSet();

    expect(first.has("u1")).toBe(true);
    expect(second.has("u2")).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("returns stale cache when fetch fails", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ docs: [{ id: "u1" }] })
      .mockRejectedValueOnce(new Error("boom"));
    const db = {
      collection: () => ({
        where: () => ({ get }),
      }),
    };

    const { getActiveBansSet } = createBanHelpers({
      db,
      logger: { warn: vi.fn() },
      BAN_CACHE_TTL_MS: 0,
    });

    const first = await getActiveBansSet(true);
    const fallback = await getActiveBansSet(true);
    expect(first.has("u1")).toBe(true);
    expect(fallback.has("u1")).toBe(true);
  });
});
