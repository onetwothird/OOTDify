// C:\OOTDify\src\features\settings\__tests__\backup.test.ts
import {
  BACKUP_KIND,
  BACKUP_VERSION,
  buildBackup,
  parseBackup,
  serializeBackup,
} from "../backup";

describe("buildBackup / parseBackup", () => {
  it("round-trips entries through serialize → parse", () => {
    const entries = {
      "ootdify.settings.v1": '{"language":"fil"}',
      "ootdify.cameraConsent": "1",
    };
    const backup = buildBackup(entries, new Date("2026-01-02T03:04:05.000Z"));
    const parsed = parseBackup(serializeBackup(backup));

    expect(parsed.app).toBe("ootdify");
    expect(parsed.kind).toBe(BACKUP_KIND);
    expect(parsed.version).toBe(BACKUP_VERSION);
    expect(parsed.exportedAt).toBe("2026-01-02T03:04:05.000Z");
    expect(parsed.entries).toEqual(entries);
  });

  it("handles empty storage", () => {
    const parsed = parseBackup(serializeBackup(buildBackup({})));
    expect(parsed.entries).toEqual({});
  });

  it("rejects non-JSON text with a readable message", () => {
    expect(() => parseBackup("not json")).toThrow(/valid JSON/);
  });

  it("rejects JSON that isn't a Penggi backup", () => {
    expect(() => parseBackup('{"app":"other"}')).toThrow(/isn't a Penggi backup/);
    expect(() => parseBackup("[1,2,3]")).toThrow(/isn't a Penggi backup/);
    expect(() => parseBackup('"just a string"')).toThrow(/isn't a Penggi backup/);
  });

  it("rejects a backup written by a newer app version", () => {
    const raw = JSON.stringify({
      app: "ootdify",
      kind: BACKUP_KIND,
      version: BACKUP_VERSION + 1,
      exportedAt: "",
      entries: {},
    });
    expect(() => parseBackup(raw)).toThrow(/newer version/);
  });

  it("rejects a backup with no entries object", () => {
    const raw = JSON.stringify({
      app: "ootdify",
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      entries: "nope",
    });
    expect(() => parseBackup(raw)).toThrow(/no entries/);
  });

  it("skips non-string entry values instead of failing the restore", () => {
    const raw = JSON.stringify({
      app: "ootdify",
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      exportedAt: "",
      entries: { good: "value", bad: 42, worse: { nested: true } },
    });
    const parsed = parseBackup(raw);
    expect(parsed.entries).toEqual({ good: "value" });
  });

  it("tolerates a missing exportedAt field", () => {
    const raw = JSON.stringify({
      app: "ootdify",
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      entries: { a: "1" },
    });
    expect(parseBackup(raw).exportedAt).toBe("");
  });
});
