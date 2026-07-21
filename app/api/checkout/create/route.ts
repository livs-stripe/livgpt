import { NextResponse } from "next/server"
import { getProductById } from "@/lib/product-feed"
import { resolveSellerProfileId, stripeFetch } from "@/lib/stripe-server"

export const maxDuration = 30

type CartItem = {
  productId?: string
  quantity?: number
}

/**
 * Request payload contract:
 *
 * Multi-item (preferred):
 *   { "items": [{ "productId": "...", "quantity": 2 }, ...], "currency"?: "usd" }
 *
 * Single-item (backwards compatible):
 *   { "productId": "...", "quantity": 1, "currency"?: "usd" }
 *
 * All products in a single request MUST belong to the same seller — a Delegated
 * Checkout RequestedSession targets exactly one seller network profile.
 */
type Body = {
  items?: CartItem[]
  productId?: string
  quantity?: number
  currency?: string
}

function clampQty(q: unknown): number {
  const n = typeof q === "number" ? q : 1
  return Math.min(5, Math.max(1, Math.floor(n)))
}

export async function POST(req: Request) {
  try {
    const { items, productId, quantity, currency }: Body = await req.json()

    // Normalize single-item and multi-item payloads into one cart shape.
    const cart: CartItem[] =
      Array.isArray(items) && items.length > 0
        ? items
        : productId
          ? [{ productId, quantity }]
          : []

    if (cart.length === 0) {
      return NextResponse.json(
        { error: "Missing items (provide `items: [{ productId, quantity }]` or `productId`)" },
        { status: 400 },
      )
    }

    // Resolve every product from the catalog.
    const resolved = await Promise.all(
      cart.map(async (item) => {
        if (!item.productId) return { item, product: undefined }
        const product = await getProductById(item.productId)
        return { item, product }
      }),
    )

    const missing = resolved.find((r) => !r.product)
    if (missing) {
      return NextResponse.json(
        { error: `Product not found: ${missing.item.productId ?? "(missing productId)"}` },
        { status: 404 },
      )
    }

    // Enforce one-seller-per-session: all products must share the same seller
    // network profile, since a RequestedSession targets a single seller.
    const sellerProfileIds = new Set(
      resolved.map((r) => resolveSellerProfileId(r.product!.sellerId)),
    )
    if (sellerProfileIds.size > 1) {
      return NextResponse.json(
        {
          error:
            "All items in a checkout session must belong to the same seller. Create a separate session per seller.",
        },
        { status: 400 },
      )
    }

    const sellerProfileId = [...sellerProfileIds][0]
    if (!sellerProfileId) {
      return NextResponse.json(
        {
          error:
            "No seller profile id configured for this product. Set SELLER_PROFILE_IDS (map of catalog seller id -> real Stripe profile id) or SELLER_PROFILE_ID.",
        },
        { status: 400 },
      )
    }

    const cur = (currency || resolved[0].product!.currency).toLowerCase()

    // Stripe computes the cart total from the seller's catalog, so we only send
    // the SKU (the catalog product id) and quantity per line item.
    const lineItemDetails = resolved.map((r) => ({
      sku_id: r.product!.id,
      quantity: clampQty(r.item.quantity),
    }))

    const { ok, status, data } = await stripeFetch<{
      id: string
      client_secret?: string
      error?: { message: string }
    }>("/v1/delegated_checkout/requested_sessions", {
      method: "POST",
      body: {
        seller_details: { network_profile: sellerProfileId },
        currency: cur,
        line_item_details: lineItemDetails,
      },
    })

    if (!ok) {
      const rawMessage =
        (data as { error?: { message: string } })?.error?.message ||
        "Failed to create checkout session"

      // Keep the raw Stripe error for debugging, but never surface the opaque
      // "Unrecognized request URL" to shoppers. That specific 404 means this
      // Stripe account isn't enrolled in the (waitlist-gated, private preview)
      // embedded Delegated Checkout API — verified: the account's key is valid
      // and the API version is applied, yet /v1/delegated_checkout/... 404s
      // while sibling preview endpoints resolve. It's an account entitlement
      // gap, not a bug in this request.
      console.error("[checkout/create] Stripe error", {
        status,
        raw: data,
      })

      const notEnrolled =
        status === 404 && /Unrecognized request URL/i.test(rawMessage)
      const message = notEnrolled
        ? "Checkout isn't available yet — this store's agent account needs Delegated Checkout access enabled in Stripe (Agentic Commerce onboarding is still pending)."
        : rawMessage

      return NextResponse.json(
        { error: message, code: notEnrolled ? "delegated_checkout_not_enabled" : undefined },
        { status },
      )
    }

    return NextResponse.json({
      sessionId: data.id,
      clientSecret: data.client_secret ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
