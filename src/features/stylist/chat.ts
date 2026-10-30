// Ask Penggi conversation rules: which pose Penggi takes, and what is sent to
// the backend. Pure, so tested. The conversation lives only on the screen;
// nothing is saved.

export interface ChatMessage {
  id: string;
  /** "note" is a local line (an error), shown but never sent. */
  role: "user" | "assistant" | "note";
  text: string;
  /** Closet pieces Penggi suggested, shown as photos under the reply. */
  pieceIds: string[];
}

export type PenggiPose = "greeting" | "thinking" | "explaining";

/** Matches the backend's MAX_TURNS, so nothing sent is thrown away there. */
export const MAX_SEND_TURNS = 20;

export function penggiPose(state: { messages: ChatMessage[]; waiting: boolean; typing: boolean }): PenggiPose {
  if (state.waiting) return "thinking";
  const said = state.messages.filter((m) => m.role !== "note");
  const last = said[said.length - 1];
  if (state.typing || last?.role === "assistant") return "explaining";
  return "greeting";
}

export function historyForApi(messages: ChatMessage[]): { role: "user" | "assistant"; text: string }[] {
  const turns = messages
    .filter((m): m is ChatMessage & { role: "user" | "assistant" } => m.role !== "note")
    .map((m) => ({ role: m.role, text: m.text }));
  const recent = turns.slice(-MAX_SEND_TURNS);
  while (recent.length && recent[0].role !== "user") recent.shift();
  return recent;
}
