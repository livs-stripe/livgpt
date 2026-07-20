/**
 * Maps a Stripe seller profile id to that seller's publishable key.
 *
 * Stripe Elements must be initialized with the *seller's* publishable key, and
 * with multiple connected merchants each product may belong to a different
 * seller. Configure a JSON map of { "<seller_profile_id>": "pk_..." } in the
 * public env var below. `NEXT_PUBLIC_SELLER_PUBLISHABLE_KEY` is used as the
 * default when a product's seller isn't found in the map (single-seller demos).
 *
 * NOTE: Both env vars are read via static `process.env.NEXT_PUBLIC_*`
 * references so Next.js can inline them into the client bundle at build time.
 */

let cachedMap: Record<string, string> | null = null

function keyMap(): Record<string, string> {
  if (cachedMap) return cachedMap
  const raw = process.env.NEXT_PUBLIC_SELLER_PUBLISHABLE_KEYS
  if (!raw) return (cachedMap = {})
  try {
    const parsed = JSON.parse(raw)
    cachedMap =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, string>)
        : {}
  } catch {
    cachedMap = {}
  }
  return cachedMap
}

/** Returns the publishable key for a seller, falling back to the default key. */
export function getSellerPublishableKey(sellerId?: string): string | undefined {
  const fallback = process.env.NEXT_PUBLIC_SELLER_PUBLISHABLE_KEY || undefined
  if (!sellerId) return fallback
  return keyMap()[sellerId] ?? fallback
}
