// C:\OOTDify\src\features\shopping\registry.ts
// Runtime registry of shopping providers. Adding a platform = register a
// ShoppingProvider; the wardrobe "Import" flow iterates this list automatically.
import { ShoppingProvider } from "./types";

const providers = new Map<string, ShoppingProvider>();

export function registerProvider(provider: ShoppingProvider): void {
  providers.set(provider.id, provider);
}

/** All registered providers (ordered by registration). */
export function listProviders(): ShoppingProvider[] {
  return Array.from(providers.values());
}

export function getProvider(id: string): ShoppingProvider | undefined {
  return providers.get(id);
}

export function clearProviders(): void {
  providers.clear();
}

/** The first provider that can handle a given source, if any. */
export function findProviderForSource(source: "link" | "image"): ShoppingProvider | undefined {
  const key = source === "link" ? "link" : "image";
  return listProviders().find((p) => p.sources.includes(key));
}