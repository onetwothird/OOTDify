import { DEFAULT_APPEARANCE, migrateSettings } from "../settingsMigrate";

describe("settings migration", () => {
  it("defaults new installs to light mode", () => {
    expect(DEFAULT_APPEARANCE).toBe("light");
  });

  it("moves a saved 'system' appearance from before v1 to light", () => {
    expect(migrateSettings({ language: "fil", appearance: "system", biometricLock: true }, 0)).toEqual({
      language: "fil",
      appearance: "light",
      biometricLock: true,
    });
  });

  it("keeps an explicit dark or light choice", () => {
    expect(migrateSettings({ appearance: "dark" }, 0)).toEqual({ appearance: "dark" });
    expect(migrateSettings({ appearance: "light" }, 0)).toEqual({ appearance: "light" });
  });

  it("leaves already-migrated state alone, so 'system' can be chosen again", () => {
    expect(migrateSettings({ appearance: "system" }, 1)).toEqual({ appearance: "system" });
  });

  it("tolerates missing or malformed saved state", () => {
    expect(migrateSettings(undefined, 0)).toEqual({});
    expect(migrateSettings(null, 0)).toEqual({});
  });
});
