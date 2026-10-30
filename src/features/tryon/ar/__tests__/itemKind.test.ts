import { isMeshKind, itemKind } from "../itemKind";

const acc = (name: string | null, extra: { tags?: string[]; description?: string } = {}) =>
  itemKind({ category: "Accessories", name, ...extra });

describe("itemKind", () => {
  it("maps clothing categories", () => {
    expect(itemKind({ category: "Tops" })).toBe("upper");
    expect(itemKind({ category: "Outerwear" })).toBe("outer");
    expect(itemKind({ category: "Dresses" })).toBe("dress");
    expect(itemKind({ category: "Bottoms" })).toBe("bottom");
    expect(itemKind({ category: "Shoes" })).toBe("shoes");
    expect(itemKind({ category: "Bags" })).toBe("bag");
    expect(itemKind({ category: "tops" })).toBe("upper");
  });

  it("reads accessories from tags, then name, then description", () => {
    expect(acc("Blue thing", { tags: ["cap"] })).toBe("hat");
    expect(acc("Aviator sunglasses", { tags: [] })).toBe("glasses");
    expect(acc("Gift", { description: "leather watch" })).toBe("watch");
    expect(acc("watch", { tags: ["belt"] })).toBe("belt");
  });

  it("knows the Filipino words", () => {
    expect(acc("Sumbrero")).toBe("hat");
    expect(acc("Salamin")).toBe("glasses");
    expect(acc("Hikaw na ginto")).toBe("earrings");
    expect(acc("Kwintas")).toBe("necklace");
    expect(acc("Relo")).toBe("watch");
    expect(acc("Pulseras")).toBe("watch");
    expect(acc("Sinturon")).toBe("belt");
  });

  it("matches whole words only", () => {
    expect(acc("Earring set")).toBe("earrings");
    expect(acc("Gold ring")).toBeNull();
    expect(acc("Singsing")).toBeNull();
    expect(acc("Carfare tee")).toBeNull();
    expect(acc("Bucket hat")).toBe("hat");
    expect(acc("Silk scarf")).toBe("necklace");
  });

  it("is null for vague names and no category", () => {
    expect(acc("Accessory 3")).toBeNull();
    expect(itemKind({ category: null, name: null })).toBeNull();
  });

  it("tells mesh kinds from accessories", () => {
    expect(isMeshKind("outer")).toBe(true);
    expect(isMeshKind("dress")).toBe(true);
    expect(isMeshKind("hat")).toBe(false);
    expect(isMeshKind("shoes")).toBe(false);
  });
});
