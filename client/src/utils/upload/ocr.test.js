import { loadBitmapSafe } from "@/utils/upload/ocr";

describe("ocr utils", () => {
  it("uses createImageBitmap when available", async () => {
    const bitmap = { width: 10, height: 10 };
    global.createImageBitmap = vi.fn().mockResolvedValue(bitmap);
    const result = await loadBitmapSafe(new Blob(["x"]));
    expect(global.createImageBitmap).toHaveBeenCalled();
    expect(result).toBe(bitmap);
  });

  it("falls back to Image + objectURL when createImageBitmap fails", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const create = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:test-url");
    global.createImageBitmap = vi.fn().mockRejectedValue(new Error("nope"));

    const OriginalImage = global.Image;
    class MockImage {
      set src(_v) {
        queueMicrotask(() => this.onload && this.onload());
      }
    }
    global.Image = MockImage;

    const result = await loadBitmapSafe(new Blob(["x"]));
    expect(result).toBeInstanceOf(MockImage);
    expect(create).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith("blob:test-url");

    global.Image = OriginalImage;
    create.mockRestore();
    revoke.mockRestore();
  });
});
