import { renderHook, waitFor } from "@testing-library/react";
import useProfileMatches from "@/hooks/myProfile/useProfileMatches";

const {
  getDocsMock,
  collectionMock,
  queryMock,
  orderByMock,
  limitMock,
  startAfterMock,
} = vi.hoisted(() => ({
  getDocsMock: vi.fn(),
  collectionMock: vi.fn(),
  queryMock: vi.fn((...args) => args),
  orderByMock: vi.fn(),
  limitMock: vi.fn(),
  startAfterMock: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: (...args) => collectionMock(...args),
  getDocs: (...args) => getDocsMock(...args),
  query: (...args) => queryMock(...args),
  orderBy: (...args) => orderByMock(...args),
  limit: (...args) => limitMock(...args),
  startAfter: (...args) => startAfterMock(...args),
}));

vi.mock("@/firebase", () => ({ db: {} }));

describe("useProfileMatches", () => {
  it("loads and maps matches on first render", async () => {
    getDocsMock.mockResolvedValue({
      docs: [
        { id: "m1", data: () => ({ result: "victory", createdAt: 1 }) },
        { id: "m2", data: () => ({ result: "defeat", createdAt: 2 }) },
      ],
    });

    const { result } = renderHook(() => useProfileMatches("uid-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.matches).toHaveLength(2);
    });

    expect(result.current.matches[0]).toMatchObject({ id: "m1", win: 1, index: 1 });
    expect(result.current.matches[1]).toMatchObject({ id: "m2", win: 0, index: 2 });
  });
});
