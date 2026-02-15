import { renderHook } from "@testing-library/react";
import { act } from "react";
import useUploadAnalyzer from "@/hooks/upload/useUploadAnalyzer";

const { serviceMocks } = vi.hoisted(() => ({
  serviceMocks: {
    fetchUserMatches: vi.fn(),
    fetchFriendsMeta: vi.fn(),
    requestOcr: vi.fn(),
    userMatchExists: vi.fn(),
    ensureMatchDocument: vi.fn(),
    ensurePlayerDocument: vi.fn(),
    saveUserMatch: vi.fn(),
    triggerLeaderboardUpdate: vi.fn(),
  },
}));

vi.mock("browser-image-compression", () => ({
  default: vi.fn(async (f) => f),
}));

vi.mock("@/utils/achievements", () => ({
  buildAchievements: vi.fn(() => ({
    matches: [],
    friends: [],
    kills: [],
    streak: [],
  })),
}));

vi.mock("@/utils/upload/parsers", () => ({
  extractMatchId: vi.fn(() => "match_1"),
  parseFragpunkText: vi.fn(() => ({
    score: 100,
    kills: 10,
    deaths: 5,
    assists: 2,
    damage: 1200,
    damageShare: 25,
    name: "Player",
    ownerUid: "u1",
  })),
}));

vi.mock("@/utils/upload/ocr", () => ({
  detectMatchResult: vi.fn(() => "victory"),
  loadBitmapSafe: vi.fn(async () => ({ width: 100, height: 100 })),
  preprocessForMatchId: vi.fn(() => ({
    toBlob: (cb) => cb(new Blob(["png"], { type: "image/png" })),
  })),
}));

vi.mock("@/services/upload/uploadService", () => ({
  fetchUserMatches: (...args) => serviceMocks.fetchUserMatches(...args),
  fetchFriendsMeta: (...args) => serviceMocks.fetchFriendsMeta(...args),
  requestOcr: (...args) => serviceMocks.requestOcr(...args),
  userMatchExists: (...args) => serviceMocks.userMatchExists(...args),
  ensureMatchDocument: (...args) => serviceMocks.ensureMatchDocument(...args),
  ensurePlayerDocument: (...args) => serviceMocks.ensurePlayerDocument(...args),
  saveUserMatch: (...args) => serviceMocks.saveUserMatch(...args),
  triggerLeaderboardUpdate: (...args) => serviceMocks.triggerLeaderboardUpdate(...args),
}));

describe("useUploadAnalyzer", () => {
  const originalCreateElement = document.createElement.bind(document);
  const originalCreateObjectURL = URL.createObjectURL;
  const originalWorker = global.Worker;
  const originalFileReader = global.FileReader;

  beforeEach(() => {
    serviceMocks.fetchUserMatches.mockResolvedValue([]);
    serviceMocks.fetchFriendsMeta.mockResolvedValue({ friendCount: 0, friendDates: [] });
    serviceMocks.userMatchExists.mockResolvedValue(false);
    serviceMocks.requestOcr.mockResolvedValue({
      ok: false,
      status: 413,
      json: async () => ({}),
    });
    URL.createObjectURL = vi.fn(() => "blob:test");

    document.createElement = vi.fn((tagName) => {
      if (tagName === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: vi.fn(),
            getImageData: () => ({ data: new Uint8ClampedArray(4) }),
          }),
          toBlob: (cb) => cb(new Blob(["x"], { type: "image/png" })),
        };
      }
      return originalCreateElement(tagName);
    });

    global.FileReader = class {
      readAsDataURL() {
        this.result = "data:image/png;base64,AAA";
        queueMicrotask(() => this.onload && this.onload());
      }
    };
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    URL.createObjectURL = originalCreateObjectURL;
    global.Worker = originalWorker;
    global.FileReader = originalFileReader;
    vi.clearAllMocks();
  });

  it("creates one OpenCV worker for whole batch and terminates once", async () => {
    const createdWorkers = [];
    global.Worker = class {
      constructor() {
        createdWorkers.push(this);
      }
      postMessage() {
        queueMicrotask(() =>
          this.onmessage &&
          this.onmessage({ data: { blob: new Blob(["img"], { type: "image/png" }) } })
        );
      }
      terminate = vi.fn();
    };

    const t = {
      upload: {
        processing: "Processing...",
        compressing: "Compressing...",
        ocr: "OCR...",
        statusTooLarge: "File too large",
        fileLabel: "File",
      },
      achievements: {},
    };
    const setBatchResults = vi.fn();
    const setStatus = vi.fn();
    const ensureTesseract = vi.fn().mockResolvedValue({
      setParameters: vi.fn(),
      recognize: vi.fn().mockResolvedValue({ data: { text: "id line" } }),
    });

    const files = [new File(["a"], "a.png"), new File(["b"], "b.png")];
    const { result } = renderHook(() =>
      useUploadAnalyzer({
        t,
        lang: "en",
        user: { uid: "u1", getIdToken: vi.fn().mockResolvedValue("tok") },
        claims: { username: "user1" },
        selectedFiles: files,
        selectedFile: null,
        ensureTesseract,
        requestManualResult: vi.fn(),
        pushToast: vi.fn(),
        setLoading: vi.fn(),
        setStatus,
        setStatusTone: vi.fn(),
        setOcrRemaining: vi.fn(),
        setBatchResults,
        setSelectedFile: vi.fn(),
        setImageUrl: vi.fn(),
        setLastMatch: vi.fn(),
      })
    );

    await act(async () => {
      await result.current();
    });

    expect(createdWorkers).toHaveLength(1);
    expect(createdWorkers[0].terminate).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalledWith(expect.stringContaining("File too large"));
    expect(setBatchResults).toHaveBeenCalled();
  });
});
