import { NextResponse } from "next/server"
import { getProductById } from "@/lib/product-feed"
import { SELLER_PROFILE_ID, stripeFetch } from "@/lib/stripe-server"

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
    // Prefer the seller this product's feed came from; fall back to the env default.
    const sellerProfileId = product.sellerId || SELLER_PROFILE_ID

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
