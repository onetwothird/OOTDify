import { pickLivePictureSize } from "../pictureSize";

describe("pickLivePictureSize", () => {
  it("picks the smallest 4:3 size of at least 480 px", () => {
    expect(pickLivePictureSize(["4032x3024", "1920x1080", "640x480", "320x240"])).toBe("640x480");
  });

  it("skips non-4:3 sizes even when smaller", () => {
    expect(pickLivePictureSize(["854x480", "1280x960", "4032x3024"])).toBe("1280x960");
  });

  it("accepts portrait-ordered sizes", () => {
    expect(pickLivePictureSize(["960x1280", "480x640"])).toBe("480x640");
  });

  it("ignores preset names (iOS)", () => {
    expect(pickLivePictureSize(["Photo", "High", "640x480"])).toBe("640x480");
  });

  it("keeps the camera default when no 4:3 size is large enough", () => {
    expect(pickLivePictureSize(["1920x1080", "320x240", "Photo"])).toBeUndefined();
    expect(pickLivePictureSize([])).toBeUndefined();
  });
});
