import { NextResponse } from "next/server"
import { getProductById } from "@/lib/product-feed"
import { resolveSellerProfileId, stripeFetch } from "@/lib/stripe-server"

export const maxDuration = 30

type Body = {
  productId?: string
  quantity?: number
  currency?: string
}

export async function POST(req: Request) {
  try {
    const { productId, quantity = 1, currency }: Body = await req.json()

    if (!productId) {
      return NextResponse.json({ error: "Missing productId" }, { status: 400 })
    }

    const product = await getProductById(productId)
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    const qty = Math.min(5, Math.max(1, quantity))
    const cur = (currency || product.currency).toLowerCase()
    // Map the catalog seller to the real sandbox profile id we charge against
    // (so the transaction lands in that merchant's Stripe Dashboard).
    const sellerProfileId = resolveSellerProfileId(product.sellerId)
    if (!sellerProfileId) {
      return NextResponse.json(
        {
          error:
            "No seller profile id configured for this product. Set SELLER_PROFILE_IDS (map of catalog seller id -> real Stripe profile id) or SELLER_PROFILE_ID.",
        },
        { status: 400 },
      )
    }

    // Create a Delegated Checkout RequestedSession with the seller's profile.
    const { ok, status, data } = await stripeFetch<{
      id: string
      client_secret?: string
      error?: { message: string }
    }>("/v1/delegated_checkout/requested_sessions", {
      method: "POST",
      body: {
        seller_profile_id: sellerProfileId,
        currency: cur,
        line_items: [
          {
            name: product.name,
            amount: product.price,
            currency: product.currency,
            quantity: qty,
          },
        ],
      },
    })

    if (!ok) {
      const message =
        (data as { error?: { message: string } })?.error?.message ||
        "Failed to create checkout session"
      return NextResponse.json({ error: message }, { status })
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
