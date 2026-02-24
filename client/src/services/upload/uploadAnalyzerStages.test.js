import {
  createOpenCvCropRunner,
  mapLangToOcr,
  throwIfAborted,
} from "@/services/upload/uploadAnalyzerStages";

describe("uploadAnalyzerStages helpers", () => {
  it("maps UI language to OCR language code", () => {
    expect(mapLangToOcr("ru")).toBe("rus");
    expect(mapLangToOcr("fr")).toBe("fre");
    expect(mapLangToOcr("de")).toBe("ger");
    expect(mapLangToOcr("en")).toBe("eng");
    expect(mapLangToOcr("xx")).toBe("eng");
  });

  it("throws AbortError when signal already aborted", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrow(/Aborted/);
  });

  it("resolves openCv worker response", async () => {
    const worker = {
      onmessage: null,
      onerror: null,
      postMessage: vi.fn(function postMessage() {
        setTimeout(() => {
          worker.onmessage?.({ data: { blob: "blob-data" } });
        }, 0);
      }),
    };

    const run = createOpenCvCropRunner(worker);
    const result = await run({ width: 100 }, null);
    expect(result).toEqual({ blob: "blob-data" });
    expect(worker.postMessage).toHaveBeenCalledWith({ imageData: { width: 100 } });
  });

  it("rejects with AbortError when aborted during worker run", async () => {
    const worker = {
      onmessage: null,
      onerror: null,
      postMessage: vi.fn(),
    };
    const run = createOpenCvCropRunner(worker);
    const controller = new AbortController();
    const promise = run({ width: 10 }, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow(/Aborted/);
  });
});
