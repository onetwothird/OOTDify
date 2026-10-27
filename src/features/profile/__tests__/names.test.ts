import { clampNickname, NICKNAME_MAX, namesFromMetadata } from "../names";

describe("namesFromMetadata", () => {
  it("prefers the separate first and last names Google gives", () => {
    expect(namesFromMetadata({ given_name: "Maria", family_name: "Santos", full_name: "x y" })).toEqual({
      first: "Maria",
      last: "Santos",
    });
  });

  it("splits a full name: the last word is the last name", () => {
    expect(namesFromMetadata({ full_name: "  Juan  Dela Cruz " })).toEqual({ first: "Juan Dela", last: "Cruz" });
    expect(namesFromMetadata({ name: "Angel" })).toEqual({ first: "Angel", last: "" });
  });

  it("is empty when nothing usable is there", () => {
    expect(namesFromMetadata(undefined)).toEqual({ first: "", last: "" });
    expect(namesFromMetadata({ full_name: 42 })).toEqual({ first: "", last: "" });
  });
});

describe("clampNickname", () => {
  it("keeps at most NICKNAME_MAX characters, without outer spaces", () => {
    expect(NICKNAME_MAX).toBe(8);
    expect(clampNickname("  Angelito  ")).toBe("Angelito");
    expect(clampNickname("Christopher")).toBe("Christop");
  });

  it("never splits an emoji in half", () => {
    expect(clampNickname("Ana😀😀😀😀😀😀")).toBe("Ana😀😀😀😀😀");
  });
});
