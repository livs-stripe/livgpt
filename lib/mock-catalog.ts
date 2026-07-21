import "server-only"
import type { CatalogProduct } from "./types"
import mockData from "./mock-catalog-data.json"

/**
 * Bundled demo catalog: 5 overlapping mock merchants x 150 products (750 total),
 * with brand-matched studio images served from /public/mock-catalog/images.
 *
 * This is a static fallback so the deployed app shows a realistic multi-merchant
 * catalog out of the box, without an SFTP feed configured. Real Stripe Agentic
 * Commerce feeds (lib/product-feed.ts) always take priority when SFTP_* env vars
 * are set; this only fills in when they are not.
 *
 * The JSON is generated from mock-catalog/<merchant>/products.csv + manifest.json.
 * Importing it (rather than reading from disk) guarantees it is included in the
 * serverless bundle on Vercel.
 */
export function loadMockCatalog(): CatalogProduct[] {
  return mockData as CatalogProduct[]
}

/** Whether the bundled demo catalog should be used as a fallback. */
export function mockCatalogEnabled(): boolean {
  // Allow explicitly turning it off (e.g. to force an empty state for testing).
  return process.env.MOCK_CATALOG !== "off"
}
