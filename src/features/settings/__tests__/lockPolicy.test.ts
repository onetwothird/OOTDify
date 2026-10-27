import { LOCK_GRACE_MS, shouldLockOnReturn } from "../lockPolicy";

describe("biometric lock policy", () => {
  const t0 = 1_000_000;

  it("never locks when the setting is off", () => {
    expect(shouldLockOnReturn({ enabled: false, backgroundedAt: t0, now: t0 + LOCK_GRACE_MS * 10 })).toBe(false);
  });

  it("locks after the app sat in the background longer than the grace period", () => {
    expect(shouldLockOnReturn({ enabled: true, backgroundedAt: t0, now: t0 + LOCK_GRACE_MS + 1 })).toBe(true);
  });

  it("does not lock for a quick app switch", () => {
    expect(shouldLockOnReturn({ enabled: true, backgroundedAt: t0, now: t0 + LOCK_GRACE_MS - 1 })).toBe(false);
  });

  it("does not lock when the app never went to the background (e.g. the fingerprint prompt itself)", () => {
    expect(shouldLockOnReturn({ enabled: true, backgroundedAt: null, now: t0 })).toBe(false);
  });
});
