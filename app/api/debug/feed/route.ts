import { NextResponse } from "next/server"
import { loadFeedOnly } from "@/lib/product-feed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

// TEMPORARY diagnostic: runs the FEED-ONLY ingestion (no mock fallback) so we
// can confirm whether the real Stripe Agentic Commerce SFTP feed is delivering
// products yet, and which seller profile ids they're attributed to. Returns NO
// secrets — only counts, distinct sellerIds, per-seller counts, and a small
// product sample. Remove after debugging.
export async function GET() {
  const { products, configured, error } = await loadFeedOnly()

  const perSeller: Record<string, number> = {}
  // The display name ingestion resolved for each seller, so an unresolved
  // merchant is visible here instead of only as a vague "Sold by" line in the UI.
  const sellerNames: Record<string, string | null> = {}
  for (const p of products) {
    const key = p.sellerId ?? "(none)"
    perSeller[key] = (perSeller[key] ?? 0) + 1
    if (!(key in sellerNames)) sellerNames[key] = p.sellerName ?? null
  }
  const sellerIds = Object.keys(perSeller)

  const sample = products.slice(0, 8).map((p) => ({
    id: p.id,
    name: p.name,
    sellerId: p.sellerId ?? null,
    sellerName: p.sellerName ?? null,
    imageUrl: p.imageUrl,
  }))

  return NextResponse.json({
    configured,
    error,
    count: products.length,
    sellerIds,
    perSeller,
    sellerNames,
    sample,
  })
}
