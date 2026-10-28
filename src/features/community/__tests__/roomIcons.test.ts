import { ROOM_ICON_PRESETS, cleanRoomTitle, roomIconPreset } from "../roomIcons";

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

describe("cleanRoomTitle", () => {
  it("trims the name", () => {
    expect(cleanRoomTitle("  Everyday Streetwear ")).toEqual({ ok: true, title: "Everyday Streetwear" });
  });

  it("refuses an empty name", () => {
    expect(cleanRoomTitle("   ")).toEqual({ ok: false, error: "Give your community a name" });
  });

  it("refuses a name over 60 characters", () => {
    expect(cleanRoomTitle("x".repeat(61))).toEqual({ ok: false, error: "Keep the name under 60 characters" });
    expect(cleanRoomTitle("x".repeat(60)).ok).toBe(true);
  });
});
