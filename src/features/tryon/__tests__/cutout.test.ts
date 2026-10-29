// C:\OOTDify\src\features\tryon\__tests__\cutout.test.ts
const mockFiles = new Map<string, string>();

jest.mock("expo-file-system", () => ({
  Paths: { cache: "file:///cache" },
  File: class {
    uri: string;
    constructor(dir: string, name: string) {
      this.uri = `${dir}/${name}`;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    write(content: string) {
      mockFiles.set(this.uri, content);
    }
    async text() {
      return mockFiles.get(this.uri) ?? "";
    }
  },
}));

jest.mock("../../../services/aiApi", () => ({
  getClothingCutout: jest.fn(),
}));

import { getClothingCutout } from "../../../services/aiApi";
import { cutoutFileName, getGarmentCutout } from "../cutout";

const api = getClothingCutout as jest.Mock;
const ok = { ok: true, reason: null, png_base64: "AAAA", width: 120, height: 200 };

beforeEach(() => {
  mockFiles.clear();
  api.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

describe("cutout cache", () => {
  it("same item and url give the same file name", () => {
    expect(cutoutFileName("a", "https://x/1.jpg")).toBe(cutoutFileName("a", "https://x/1.jpg"));
    expect(cutoutFileName("a", "https://x/1.jpg")).toMatch(/^cutout-a-[0-9a-f]+\.png$/);
  });

  it("refetches when image_url changes", async () => {
    api.mockResolvedValue(ok);
    expect(cutoutFileName("a", "u1")).not.toBe(cutoutFileName("a", "u2"));
    await getGarmentCutout({ id: "a", image_url: "u1" });
    await getGarmentCutout({ id: "a", image_url: "u2" });
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("reuses a cached file without calling the API", async () => {
    api.mockResolvedValue(ok);
    await getGarmentCutout({ id: "a", image_url: "u1" });
    const again = await getGarmentCutout({ id: "a", image_url: "u1" });
    expect(api).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({ status: "ready", width: 120, height: 200 });
  });

  it("writes the PNG and returns ready", async () => {
    api.mockResolvedValue(ok);
    const out = await getGarmentCutout({ id: "a", image_url: "u1" });
    expect(out.status).toBe("ready");
    if (out.status === "ready") {
      expect(mockFiles.get(out.uri)).toBe("AAAA");
      expect(mockFiles.get(out.uri.replace(/\.png$/, ".json"))).toBe(
        JSON.stringify({ width: 120, height: 200 }),
      );
    }
  });

  it("returns failed with the reason when ok is false", async () => {
    api.mockResolvedValue({ ok: false, reason: "no_object", png_base64: null, width: null, height: null });
    expect(await getGarmentCutout({ id: "a", image_url: "u1" })).toEqual({
      status: "failed",
      reason: "no_object",
    });
  });

  it("returns error when the request throws", async () => {
    api.mockRejectedValue(new Error("boom"));
    await expect(getGarmentCutout({ id: "a", image_url: "u1" })).resolves.toEqual({ status: "error" });
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
