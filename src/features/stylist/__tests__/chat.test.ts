import { MAX_SEND_TURNS, historyForApi, penggiPose, type ChatMessage } from "../chat";

const msg = (role: ChatMessage["role"], text: string, id = text): ChatMessage => ({ id, role, text, pieceIds: [] });

describe("penggiPose", () => {
  it("greets before the conversation starts", () => {
    expect(penggiPose({ messages: [], waiting: false, typing: false })).toBe("greeting");
  });

  it("thinks while waiting for an answer", () => {
    expect(penggiPose({ messages: [msg("user", "hi")], waiting: true, typing: false })).toBe("thinking");
  });

  it("explains while the answer types out and after it", () => {
    const messages = [msg("user", "hi"), msg("assistant", "Hello!")];
    expect(penggiPose({ messages, waiting: false, typing: true })).toBe("explaining");
    expect(penggiPose({ messages, waiting: false, typing: false })).toBe("explaining");
  });

  it("greets again when the last answer failed", () => {
    expect(penggiPose({ messages: [msg("user", "hi")], waiting: false, typing: false })).toBe("greeting");
  });
});

describe("historyForApi", () => {
  it("sends role and text only, without failed or local notes", () => {
    const messages: ChatMessage[] = [
      msg("user", "What should I wear?"),
      { ...msg("assistant", "The jeans."), pieceIds: ["a1"] },
      { ...msg("note", "Couldn't reach Penggi") },
      msg("user", "And shoes?"),
    ];
    expect(historyForApi(messages)).toEqual([
      { role: "user", text: "What should I wear?" },
      { role: "assistant", text: "The jeans." },
      { role: "user", text: "And shoes?" },
    ]);
  });

  it("keeps only the recent turns, starting with the user", () => {
    const messages: ChatMessage[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push(msg("user", `q${i}`), msg("assistant", `a${i}`));
    }
    messages.push(msg("user", "last"));
    const sent = historyForApi(messages);
    expect(sent.length).toBeLessThanOrEqual(MAX_SEND_TURNS);
    expect(sent[0].role).toBe("user");
    expect(sent[sent.length - 1]).toEqual({ role: "user", text: "last" });
  });
});
