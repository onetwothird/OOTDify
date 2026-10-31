import { isPresetId, PRESET_IDS, resultBadge, tryOnRequest } from "../presets";

describe("tryOnRequest", () => {
  it("dresses a preset model without any photo", () => {
    expect(tryOnRequest({ kind: "preset", id: "ava" }, ["a", "b"])).toEqual({ modelPreset: "ava", clothingIds: ["a", "b"] });
  });

  it("uses the user's photo when they wear it", () => {
    expect(tryOnRequest({ kind: "you", bodyPhotoId: "p1" }, ["a"])).toEqual({ bodyPhotoId: "p1", clothingIds: ["a"] });
  });

  it("can't start for 'you' without a photo", () => {
    expect(tryOnRequest({ kind: "you", bodyPhotoId: null }, ["a"])).toBeNull();
  });

  it("can't start without pieces", () => {
    expect(tryOnRequest({ kind: "preset", id: "leo" }, [])).toBeNull();
    expect(tryOnRequest({ kind: "preset", id: "leo" }, [""])).toBeNull();
  });

  it("drops repeats and keeps to the backend's 10-piece cap", () => {
    const ids = Array.from({ length: 14 }, (_, i) => `c${i}`);
    expect(tryOnRequest({ kind: "preset", id: "mia" }, ["c0", "c0", ...ids])?.clothingIds).toEqual(ids.slice(0, 10));
  });
});

describe("presets", () => {
  it("knows its ids", () => {
    expect(PRESET_IDS).toEqual(["ava", "leo", "mia", "kai", "rin", "sam"]);
    expect(isPresetId("kai")).toBe(true);
    expect(isPresetId("bob")).toBe(false);
    expect(isPresetId(null)).toBe(false);
  });
});

describe("resultBadge", () => {
  it("labels preset, face-only and own-photo pictures", () => {
    expect(resultBadge({ photo_kind: "preset", model_preset: "ava" })).toBe("preset");
    expect(resultBadge({ photo_kind: null, model_preset: "ava" })).toBe("preset");
    expect(resultBadge({ photo_kind: "face_only", model_preset: null })).toBe("face_only");
    expect(resultBadge({ photo_kind: "whole_body", model_preset: null })).toBe("you");
    expect(resultBadge({})).toBe("you");
  });
});
