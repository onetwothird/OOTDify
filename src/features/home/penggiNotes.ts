// The last thing you changed, for Penggi to mention on Home ("Dark mode, nice
// choice!"). Screens and the settings store call notePenggi after a change
// succeeds; Home reads the latest note when it shows. A tiny store with no
// React Native imports, so penggiLines.ts stays testable.
import { create } from "zustand";

export type PenggiNoteKind =
  | "piece_added"
  | "look_saved"
  | "profile_updated"
  | "appearance"
  | "language"
  | "text_size"
  | "bold_text"
  | "high_contrast"
  | "reduce_motion"
  | "vibration"
  | "biometric_lock";

export interface PenggiNote {
  id: number;
  kind: PenggiNoteKind;
  /** The new value ("dark", "large", "on") or the piece's name. */
  value?: string;
  at: number;
}

let seq = 0;

export const usePenggiNotes = create<{ latest: PenggiNote | null }>(() => ({ latest: null }));

export function notePenggi(kind: PenggiNoteKind, value?: string): void {
  usePenggiNotes.setState({ latest: { id: (seq += 1), kind, value, at: Date.now() } });
}
