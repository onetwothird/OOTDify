import { isAuthRedirectHeld, withAuthRedirectHeld } from "../authRedirectHold";

describe("withAuthRedirectHeld", () => {
  it("holds the redirect only while the task runs", async () => {
    expect(isAuthRedirectHeld()).toBe(false);
    let seenInside = false;
    const result = await withAuthRedirectHeld(async () => {
      seenInside = isAuthRedirectHeld();
      return 42;
    });
    expect(seenInside).toBe(true);
    expect(result).toBe(42);
    expect(isAuthRedirectHeld()).toBe(false);
  });

  it("releases the hold when the task throws", async () => {
    await expect(
      withAuthRedirectHeld(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(isAuthRedirectHeld()).toBe(false);
  });

  it("stays held until every overlapping task finishes", async () => {
    let releaseFirst!: () => void;
    const first = withAuthRedirectHeld(
      () => new Promise<void>((resolve) => (releaseFirst = resolve)),
    );
    await withAuthRedirectHeld(async () => undefined);
    expect(isAuthRedirectHeld()).toBe(true);
    releaseFirst();
    await first;
    expect(isAuthRedirectHeld()).toBe(false);
  });
});
