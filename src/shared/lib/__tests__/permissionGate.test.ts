import { askInTurn, holdPermissions, releasePermissions } from "../permissionGate";

const flush = () => new Promise<void>((r) => setImmediate(() => r()));

describe("permission gate", () => {
  it("asks straight away when nothing holds the prompts", async () => {
    await expect(askInTurn(async () => "asked")).resolves.toBe("asked");
  });

  it("waits until every hold is released", async () => {
    const ask = jest.fn(async () => true);
    holdPermissions("welcome");
    holdPermissions("onboarding");
    const done = askInTurn(ask);
    await flush();
    releasePermissions("welcome");
    await flush();
    expect(ask).not.toHaveBeenCalled();
    releasePermissions("onboarding");
    await done;
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("asks one at a time, in order, even after one fails", async () => {
    const order: string[] = [];
    let finishFirst: () => void = () => {};
    const first = askInTurn(
      () =>
        new Promise<void>((_resolve, reject) => {
          order.push("first:start");
          finishFirst = () => {
            order.push("first:end");
            reject(new Error("denied"));
          };
        }),
    );
    const second = askInTurn(async () => {
      order.push("second");
    });
    await flush();
    expect(order).toEqual(["first:start"]);
    finishFirst();
    await expect(first).rejects.toThrow("denied");
    await second;
    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("lets a timed hold lapse on its own", async () => {
    jest.useFakeTimers();
    const ask = jest.fn(async () => true);
    holdPermissions("welcome", 1000);
    const done = askInTurn(ask);
    jest.advanceTimersByTime(1000);
    jest.useRealTimers();
    await done;
    expect(ask).toHaveBeenCalledTimes(1);
  });
});
