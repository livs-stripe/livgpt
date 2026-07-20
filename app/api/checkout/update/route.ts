import { NextResponse } from "next/server"
import { stripeFetch } from "@/lib/stripe-server"
import type { ShippingAddress } from "@/lib/types"

export const maxDuration = 30

type Body = {
  sessionId?: string
  shippingAddress?: ShippingAddress
  quantity?: number
}

export async function POST(req: Request) {
  try {
    const { sessionId, shippingAddress, quantity }: Body = await req.json()

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 })
    }

    const body: Record<string, unknown> = {}

    if (shippingAddress) {
      body.shipping_details = {
        name: shippingAddress.name,
        address: {
          line1: shippingAddress.line1,
          line2: shippingAddress.line2,
          city: shippingAddress.city,
          state: shippingAddress.state,
          postal_code: shippingAddress.postal_code,
          country: shippingAddress.country,
        },
      }
    }

    if (typeof quantity === "number") {
      body.metadata = { quantity: String(Math.min(5, Math.max(1, quantity))) }
    }

    const { ok, status, data } = await stripeFetch<{
      id: string
      shipping_options?: unknown
      error?: { message: string }
    }>(`/v1/delegated_checkout/requested_sessions/${sessionId}`, {
      method: "POST", // Stripe form API uses POST for updates
      body,
    })

    if (!ok) {
      const message =
        (data as { error?: { message: string } })?.error?.message ||
        "Failed to update checkout session"
      return NextResponse.json({ error: message }, { status })
    }

    return NextResponse.json({
      sessionId: data.id,
      shippingOptions: data.shipping_options ?? [],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
