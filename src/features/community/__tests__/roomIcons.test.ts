import { ROOM_ICON_PRESETS, roomIconPreset } from "../roomIcons";

describe("room icon presets", () => {
  it("every key satisfies the database check constraint", () => {
    for (const key of ROOM_ICON_PRESETS) {
      expect(key).toMatch(/^[a-z0-9-]{1,40}$/);
    }
  });

  it("keys are unique", () => {
    expect(new Set(ROOM_ICON_PRESETS).size).toBe(ROOM_ICON_PRESETS.length);
  });

  it("resolves known keys and rejects anything else", () => {
    expect(roomIconPreset(ROOM_ICON_PRESETS[0])).toBe(ROOM_ICON_PRESETS[0]);
    expect(roomIconPreset("not-a-preset")).toBeNull();
    expect(roomIconPreset(null)).toBeNull();
  });
});
