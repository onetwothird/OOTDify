// Supabase hands back the existing channel when a topic is reused, and adding
// listeners to an already-joined channel throws ("cannot add postgres_changes
// callbacks ... after subscribe()"). removeChannel is async, so a screen that
// remounts, or two screens watching the same chat, would hit that. Each
// subscription gets its own topic instead.
let next = 0;

export function realtimeTopic(base: string): string {
  next += 1;
  return `${base}:${next}`;
}
