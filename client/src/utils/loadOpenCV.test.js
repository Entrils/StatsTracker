import { waitForOpenCV } from "@/utils/loadOpenCV";

describe("waitForOpenCV", () => {
  it("resolves immediately when cv is already ready", async () => {
    const originalCv = window.cv;
    window.cv = { imread: vi.fn() };
    await expect(waitForOpenCV()).resolves.toBe(window.cv);
    window.cv = originalCv;
  });

  it("resolves via Module.onRuntimeInitialized callback", async () => {
    const originalCv = window.cv;
    const originalModule = window.Module;
    window.cv = undefined;

    const promise = waitForOpenCV();
    expect(typeof window.Module?.onRuntimeInitialized).toBe("function");

    window.cv = { imread: vi.fn(), mat: true };
    window.Module.onRuntimeInitialized();

    await expect(promise).resolves.toBe(window.cv);

    window.cv = originalCv;
    window.Module = originalModule;
  });
});
