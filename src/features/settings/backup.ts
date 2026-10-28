// C:\OOTDify\src\features\settings\backup.ts
// Local backup of DEVICE data: a JSON snapshot of everything Penggi keeps in
// AsyncStorage on this device (settings, camera consent, pending avatar info).
//
// Account data — wardrobe, outfits, body photos — lives in Supabase and is
// NOT part of this backup; it is server-side data governed by the Privacy &
// Data screen. The backup format is versioned so a future format change can
// say "made by a newer version" instead of corrupting restored state.
import AsyncStorage from "@react-native-async-storage/async-storage";

export const BACKUP_KIND = "ootdify-local-backup";
export const BACKUP_VERSION = 1;

export interface LocalBackup {
  app: "ootdify";
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: string;
  /** Raw AsyncStorage key → value entries. */
  entries: Record<string, string>;
}

/** Builds a versioned backup envelope around raw storage entries. */
export function buildBackup(
  entries: Record<string, string>,
  now: Date = new Date(),
): LocalBackup {
  return {
    app: "ootdify",
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    entries,
  };
}

export function serializeBackup(backup: LocalBackup): string {
  return JSON.stringify(backup, null, 2);
}

/**
 * Parses a backup file's text. Throws Error with a plain, user-readable
 * message when the file isn't a Penggi backup or was written by a newer
 * app version — never restores a half-understood file.
 */
export function parseBackup(raw: string): LocalBackup {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("That file isn't valid JSON, so it can't be a Penggi backup.");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("That file isn't a Penggi backup.");
  }
  const b = data as Record<string, unknown>;
  if (b.app !== "ootdify" || b.kind !== BACKUP_KIND) {
    throw new Error("That file isn't a Penggi backup.");
  }
  if (typeof b.version !== "number" || b.version > BACKUP_VERSION) {
    throw new Error("That backup was made by a newer version of Penggi.");
  }
  if (typeof b.entries !== "object" || b.entries === null || Array.isArray(b.entries)) {
    throw new Error("That backup contains no entries to restore.");
  }
  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(b.entries as Record<string, unknown>)) {
    // Only strings are valid AsyncStorage values; anything else is skipped
    // rather than letting one bad row abort the whole restore.
    if (typeof value === "string") entries[key] = value;
  }
  return {
    app: "ootdify",
    kind: BACKUP_KIND,
    version: b.version,
    exportedAt: typeof b.exportedAt === "string" ? b.exportedAt : "",
    entries,
  };
}

/** Reads every key Penggi has stored on this device. */
export async function collectStoredEntries(): Promise<Record<string, string>> {
  const keys = await AsyncStorage.getAllKeys();
  const pairs = await AsyncStorage.multiGet(keys);
  const entries: Record<string, string> = {};
  for (const [key, value] of pairs) {
    if (key !== null && value !== null) entries[key] = value;
  }
  return entries;
}

/** Writes the backup's entries back into AsyncStorage. Returns the count. */
export async function applyBackup(backup: LocalBackup): Promise<number> {
  const pairs = Object.entries(backup.entries);
  if (pairs.length === 0) return 0;
  await AsyncStorage.multiSet(pairs);
  return pairs.length;
}
