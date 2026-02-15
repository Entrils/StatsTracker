import { describe, it, expect, vi } from "vitest";
import { createClientErrorHelpers } from "./clientErrors.js";

describe("client error helpers", () => {
  it("keeps only last N entries in memory buffer", () => {
    const helpers = createClientErrorHelpers({
      CLIENT_ERROR_LOG: "client-error.log",
      CLIENT_ERROR_ROTATE_BYTES: 10,
      MAX_CLIENT_ERRORS: 2,
      fs: { stat: vi.fn(), rename: vi.fn() },
    });

    helpers.pushClientError({ id: "1" });
    helpers.pushClientError({ id: "2" });
    helpers.pushClientError({ id: "3" });

    expect(helpers.clientErrorBuffer).toEqual([{ id: "2" }, { id: "3" }]);
  });

  it("rotates file when size reaches threshold", async () => {
    const stat = vi.fn().mockResolvedValue({ size: 100 });
    const rename = vi.fn().mockResolvedValue();
    const helpers = createClientErrorHelpers({
      CLIENT_ERROR_LOG: "client-error.log",
      CLIENT_ERROR_ROTATE_BYTES: 50,
      MAX_CLIENT_ERRORS: 10,
      fs: { stat, rename },
    });

    await helpers.rotateClientErrorLog();

    expect(stat).toHaveBeenCalledWith("client-error.log");
    expect(rename).toHaveBeenCalledWith("client-error.log", "client-error.log.1");
  });
});
