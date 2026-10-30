import { sharedSubscriptions } from "../sharedSubscription";

function fakeOpen() {
  const opened: string[] = [];
  const closed: string[] = [];
  const emitters = new Map<string, (payload: unknown) => void>();
  const open = (topic: string, emit: (payload: unknown) => void) => {
    opened.push(topic);
    emitters.set(topic, emit);
    return () => closed.push(topic);
  };
  return { open, opened, closed, emitters };
}

describe("sharedSubscriptions", () => {
  it("opens one connection per topic however many listeners join", () => {
    const f = fakeOpen();
    const subs = sharedSubscriptions(f.open);
    subs.listen("t", () => {});
    subs.listen("t", () => {});
    expect(f.opened).toEqual(["t"]);
  });

  it("delivers to every listener of the topic", () => {
    const f = fakeOpen();
    const subs = sharedSubscriptions(f.open);
    const got: unknown[] = [];
    subs.listen("t", (p) => got.push(["a", p]));
    subs.listen("t", (p) => got.push(["b", p]));
    f.emitters.get("t")?.(1);
    expect(got).toEqual([["a", 1], ["b", 1]]);
  });

  it("closes only after the last listener leaves, and reopens for a new one", () => {
    const f = fakeOpen();
    const subs = sharedSubscriptions(f.open);
    const stopA = subs.listen("t", () => {});
    const stopB = subs.listen("t", () => {});
    stopA();
    expect(f.closed).toEqual([]);
    stopB();
    stopB();
    expect(f.closed).toEqual(["t"]);
    subs.listen("t", () => {});
    expect(f.opened).toEqual(["t", "t"]);
  });
});
