import { findGreenRow } from "@/utils/findGreenRow";

function createMat() {
  return { rows: 10, cols: 10, type: () => 1, delete: vi.fn() };
}

describe("findGreenRow", () => {
  it("returns widest horizontal contour and releases mats", () => {
    const hsv = createMat();
    const lower = createMat();
    const upper = createMat();
    const mask = createMat();
    const hierarchy = createMat();

    const contoursList = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const contours = {
      size: () => contoursList.length,
      get: (idx) => contoursList[idx],
      delete: vi.fn(),
    };

    const cv = {
      Mat: vi
        .fn()
        .mockImplementationOnce(() => hsv)
        .mockImplementationOnce(() => lower)
        .mockImplementationOnce(() => upper)
        .mockImplementationOnce(() => mask)
        .mockImplementationOnce(() => hierarchy),
      MatVector: vi.fn(() => contours),
      COLOR_RGBA2RGB: 1,
      COLOR_RGB2HSV: 2,
      RETR_EXTERNAL: 3,
      CHAIN_APPROX_SIMPLE: 4,
      cvtColor: vi.fn(),
      inRange: vi.fn(),
      findContours: vi.fn(),
      boundingRect: vi.fn((cnt) => {
        if (cnt.id === 1) return { x: 0, y: 1, width: 20, height: 10 };
        if (cnt.id === 2) return { x: 0, y: 2, width: 55, height: 8 };
        return { x: 0, y: 3, width: 30, height: 30 };
      }),
    };

    const rect = findGreenRow(cv, createMat());
    expect(rect).toEqual({ x: 0, y: 2, width: 55, height: 8 });
    expect(hsv.delete).toHaveBeenCalled();
    expect(lower.delete).toHaveBeenCalled();
    expect(upper.delete).toHaveBeenCalled();
    expect(mask.delete).toHaveBeenCalled();
    expect(hierarchy.delete).toHaveBeenCalled();
    expect(contours.delete).toHaveBeenCalled();
  });

  it("returns null when no contour matches horizontal rule", () => {
    const contoursList = [{ id: 1 }];
    const contours = {
      size: () => contoursList.length,
      get: (idx) => contoursList[idx],
      delete: vi.fn(),
    };
    const cv = {
      Mat: vi.fn(() => createMat()),
      MatVector: vi.fn(() => contours),
      COLOR_RGBA2RGB: 1,
      COLOR_RGB2HSV: 2,
      RETR_EXTERNAL: 3,
      CHAIN_APPROX_SIMPLE: 4,
      cvtColor: vi.fn(),
      inRange: vi.fn(),
      findContours: vi.fn(),
      boundingRect: vi.fn(() => ({ x: 0, y: 0, width: 10, height: 20 })),
    };

    expect(findGreenRow(cv, createMat())).toBeNull();
  });
});
