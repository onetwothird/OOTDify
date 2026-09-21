// C:\OOTDify\src\features\shopping\index.ts
// Public API for the shopping-integration layer.
//
// Until a real provider is registered (official API / authorized integration),
// every import path throws ShoppingNotConfiguredError. No scraping, no fake
// products, no silent fallbacks.
import {
  findProviderForSource,
  getProvider,
  listProviders,
  registerProvider,
} from "./registry";
import {
  ImportedProduct,
  ImportByImageInput,
  ImportByLinkInput,
  ShoppingNotConfiguredError,
  ShoppingProvider,
} from "./types";

export { ShoppingNotConfiguredError, registerProvider, listProviders };
export type {
  ImportedProduct,
  ImportByLinkInput,
  ImportByImageInput,
  ShoppingProvider,
  ShoppingSource,
} from "./types";

/** True when any provider authenticated/configured for link imports exists. */
export async function isLinkImportAvailable(): Promise<boolean> {
  const provider = findProviderForSource("link");
  if (!provider) return false;
  try {
    return Boolean(await provider.isConfigured());
  } catch {
    return false;
  }
}

/** Import a product from a paste-able product link. */
export async function importFromLink(input: ImportByLinkInput): Promise<ImportedProduct> {
  const provider = findProviderForSource("link");
  if (!provider) throw new ShoppingNotConfiguredError();
  const product = await provider.importByLink(input);
  if (!product) {
    throw new ShoppingNotConfiguredError(
      `We couldn't import that link through ${provider.name}. Official integration is still being set up.`,
    );
  }
  return product;
}

/** Import a product from a user-uploaded screenshot / product photo. */
export async function importFromImage(input: ImportByImageInput): Promise<ImportedProduct> {
  const provider = findProviderForSource("image");
  if (!provider) throw new ShoppingNotConfiguredError();
  const product = await provider.importByImage(input);
  if (!product) {
    throw new ShoppingNotConfiguredError(
      `We couldn't identify that product through ${provider.name}. Official integration is still being set up.`,
    );
  }
  return product;
}

/** Look up a single provider (used by future settings screens). */
export async function providerById(id: string): Promise<ShoppingProvider | undefined> {
  return getProvider(id);
}