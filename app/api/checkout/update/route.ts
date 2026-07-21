import { NextResponse } from "next/server"
import { stripeFetch } from "@/lib/stripe-server"
import type { ShippingAddress } from "@/lib/types"

export const maxDuration = 30

type Body = {
  sessionId?: string
  shippingAddress?: ShippingAddress
  /** Update a single line item's quantity. `lineItemKey` is Stripe's line item key. */
  quantity?: number
  lineItemKey?: string
}

export async function POST(req: Request) {
  try {
    const { sessionId, shippingAddress, quantity, lineItemKey }: Body = await req.json()

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 })
    }

    const body: Record<string, unknown> = {}

    // Fulfillment address — Stripe returns available fulfillment options in the
    // updated RequestedSession.
    if (shippingAddress) {
      body.fulfillment_details = {
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

    // Quantity updates target a line item via its Stripe-assigned `key`.
    if (typeof quantity === "number") {
      body.line_item_details = [
        {
          ...(lineItemKey ? { key: lineItemKey } : {}),
          quantity: Math.min(5, Math.max(1, Math.floor(quantity))),
        },
      ]
    }

    const { ok, status, data } = await stripeFetch<{
      id: string
      fulfillment_details?: { fulfillment_options?: unknown }
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
      fulfillmentOptions: data.fulfillment_details?.fulfillment_options ?? [],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
