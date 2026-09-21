// C:\OOTDify\src\features\shopping\types.ts
// Integration layer for future shopping-platform imports (Shopee, TikTok Shop…).
//
// DESIGN:
//   * Providers are registered at runtime (registry.ts) behind one small
//     interface, so a new platform = one new file + registerProvider(), no
//     changes to the wardrobe system.
//   * Imports arrive only through sanctioned channels — official APIs,
//     authorized integrations, user-provided product links, or user-uploaded
//     product screenshots/images. There is deliberately NO scraping here.
//   * Until a provider is configured, calls fail honestly with a clear
//     "no provider" ApiError-style message — never fake imported products.

export type ShoppingSource = "api" | "link" | "image" | "screenshot";

export interface ImportedProduct {
  /** Stable source id (provider id + remote product id). */
  id: string;
  providerId: string;
  title: string;
  description: string | null;
  category: string | null;
  color: string | null;
  brand: string | null;
  price: number | null;
  currency: string;
  /** Media the user can save into their wardrobe (signed URL or data ref). */
  imageUrl: string | null;
  productUrl: string | null;
}

export interface ImportByLinkInput {
  /** e.g. an official Shopee/TikTok Shop product URL the user pasted. */
  url: string;
}

export interface ImportByImageInput {
  /** Local URI of a user-provided product screenshot / photo. */
  imageUri: string;
}

/**
 * One platform integration. Implement this interface in a new file and call
 * registerProvider() — the wardrobe flow picks it up automatically.
 */
export interface ShoppingProvider {
  readonly id: string;
  readonly name: string;
  /** e.g. "Shopee" | "TikTok Shop" | "Custom link". */
  readonly sources: ShoppingSource[];
  /** Platform-level OAuth/app credentials (kept on the server, never the app). */
  readonly isConfigured: () => boolean | Promise<boolean>;
  /** Import a product from a shared link (provider must authorize fetching). */
  importByLink(input: ImportByLinkInput): Promise<ImportedProduct | null>;
  /** Import a product from a user-provided image (provider/backend may classify). */
  importByImage(input: ImportByImageInput): Promise<ImportedProduct | null>;
}

/** Error thrown when no provider can handle an import request. */
export class ShoppingNotConfiguredError extends Error {
  constructor(message = "No shopping integration is configured yet. This is on the roadmap.") {
    super(message);
    this.name = "ShoppingNotConfiguredError";
  }
}