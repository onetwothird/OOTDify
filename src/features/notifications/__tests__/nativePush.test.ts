function load(os: string, env: string) {
  jest.resetModules();
  jest.doMock("react-native", () => ({ Platform: { OS: os } }));
  jest.doMock("expo-constants", () => ({
    __esModule: true,
    default: { executionEnvironment: env },
    ExecutionEnvironment: { Bare: "bare", Standalone: "standalone", StoreClient: "storeClient" },
  }));
  jest.doMock("expo-notifications", () => ({ marker: "native" }), { virtual: true });
  return (require("../nativePush") as typeof import("../nativePush")).nativePush();
}

describe("nativePush", () => {
  it("skips expo-notifications in Expo Go on Android, where importing it crashes", () => {
    expect(load("android", "storeClient")).toBeNull();
  });

  it("skips it on web", () => {
    expect(load("web", "bare")).toBeNull();
  });

  it("loads it in an Android development build", () => {
    expect(load("android", "bare")).toEqual({ marker: "native" });
  });

  it("loads it in Expo Go on iOS", () => {
    expect(load("ios", "storeClient")).toEqual({ marker: "native" });
  });
});
