import {
  detectMatchResult,
  preprocessForMatchId,
  preprocessForOCR,
} from "@/utils/upload/ocr";

function createMockCanvas(width = 100, height = 50) {
  const data = new Uint8ClampedArray([
    10, 10, 10, 255, 250, 250, 250, 255,
  ]);
  const ctx = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data })),
    putImageData: vi.fn(),
  };
  return {
    width,
    height,
    getContext: vi.fn(() => ctx),
    toBlob: vi.fn((cb) => cb(new Blob(["x"]))),
  };
}

describe("ocr processing helpers", () => {
  it("preprocessForOCR scales canvas and applies threshold", () => {
    const originalCreate = document.createElement.bind(document);
    const outCanvas = createMockCanvas();
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      if (tag === "canvas") return outCanvas;
      return originalCreate(tag);
    });

    const src = { width: 20, height: 10 };
    const result = preprocessForOCR(src, 100);
    expect(result.width).toBe(40);
    expect(result.height).toBe(20);
    expect(outCanvas.getContext).toHaveBeenCalled();
    document.createElement.mockRestore();
  });

  it("preprocessForMatchId scales canvas by 2.4x", () => {
    const originalCreate = document.createElement.bind(document);
    const outCanvas = createMockCanvas();
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      if (tag === "canvas") return outCanvas;
      return originalCreate(tag);
    });

    const src = { width: 25, height: 10 };
    const result = preprocessForMatchId(src);
    expect(result.width).toBe(60);
    expect(result.height).toBe(24);
    document.createElement.mockRestore();
  });

  it("detectMatchResult returns parsed status from OCR worker", async () => {
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      if (tag === "canvas") return createMockCanvas(80, 20);
      return originalCreate(tag);
    });

    const worker = {
      setParameters: vi.fn().mockResolvedValue(undefined),
      recognize: vi.fn().mockResolvedValue({ data: { text: "VICTORY" } }),
    };
    const bitmap = { width: 200, height: 100 };

    const result = await detectMatchResult(worker, bitmap);
    expect(result).toBe("victory");
    expect(worker.setParameters).toHaveBeenCalledTimes(1);
    expect(worker.recognize).toHaveBeenCalledTimes(1);

    document.createElement.mockRestore();
  });
});
