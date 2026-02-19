import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn((n) => ({ _limit: n })),
  orderBy: vi.fn((field, dir) => ({ _orderBy: [field, dir] })),
  query: vi.fn(() => ({ _query: true })),
  setDoc: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: (...args) => mocks.collection(...args),
  doc: (...args) => mocks.doc(...args),
  getDoc: (...args) => mocks.getDoc(...args),
  getDocs: (...args) => mocks.getDocs(...args),
  limit: (...args) => mocks.limit(...args),
  orderBy: (...args) => mocks.orderBy(...args),
  query: (...args) => mocks.query(...args),
  setDoc: (...args) => mocks.setDoc(...args),
}));

vi.mock("@/firebase", () => ({
  db: {},
}));

describe("uploadService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.doc.mockReturnValue({ id: "ref" });
  });

  it("fetches user matches from firestore query", async () => {
    const { fetchUserMatches } = await import("./uploadService");
    mocks.getDocs.mockResolvedValue({
      docs: [{ data: () => ({ id: "m1" }) }, { data: () => ({ id: "m2" }) }],
    });

    const out = await fetchUserMatches("u1");
    expect(out).toEqual([{ id: "m1" }, { id: "m2" }]);
    expect(mocks.getDocs).toHaveBeenCalled();
  });

  it("returns empty friends meta when request fails", async () => {
    const { fetchFriendsMeta } = await import("./uploadService");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("net")));

    const out = await fetchFriendsMeta("tok");
    expect(out).toEqual({
      friendCount: 0,
      friendDates: [],
      friendMilestones: {},
      latestFriendAt: null,
    });
  });

  it("updates match result only if existing document has empty result", async () => {
    const { ensureMatchDocument } = await import("./uploadService");
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ result: null }),
    });

    await ensureMatchDocument("m1", "victory");
    expect(mocks.setDoc).toHaveBeenCalledWith(
      { id: "ref" },
      { result: "victory" },
      { merge: true }
    );
  });
});
