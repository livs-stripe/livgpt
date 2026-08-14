import { NextResponse } from "next/server"
import { stripeFetch } from "@/lib/stripe-server"
import type { ShippingAddress } from "@/lib/types"
import { isValidEmail } from "@/lib/utils"

export const maxDuration = 30

type Body = {
  sessionId?: string
  shippingAddress?: ShippingAddress
  /** Buyer email. Stripe requires it on `fulfillment_details`, so any update
   * that sets fulfillment details must include it. */
  email?: string
  /** Stripe fulfillment option id chosen for this session (from a prior update's
   * `fulfillmentOptions`). Persists the buyer's shipping selection on the session. */
  selectedFulfillmentOption?: string
  /** Update a single line item's quantity. `lineItemKey` is Stripe's line item key. */
  quantity?: number
  lineItemKey?: string
}

export async function POST(req: Request) {
  try {
    const {
      sessionId,
      shippingAddress,
      email,
      selectedFulfillmentOption,
      quantity,
      lineItemKey,
    }: Body = await req.json()

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 })
    }

    const body: Record<string, unknown> = {}

    // Fulfillment contact + address + selected option — Stripe returns available
    // fulfillment options in the updated RequestedSession, and remembers the
    // chosen option so it is reflected on the session at confirm time.
    const setsFulfillment = Boolean(
      shippingAddress || selectedFulfillmentOption || email,
    )
    if (setsFulfillment) {
      const buyerEmail = email?.trim()
      if (!isValidEmail(buyerEmail)) {
        return NextResponse.json(
          { error: "Enter a valid email address to continue." },
          { status: 400 },
        )
      }

      const fulfillmentDetails: Record<string, unknown> = { email: buyerEmail }
      if (shippingAddress) {
        fulfillmentDetails.name = shippingAddress.name
        fulfillmentDetails.address = {
          line1: shippingAddress.line1,
          line2: shippingAddress.line2,
          city: shippingAddress.city,
          state: shippingAddress.state,
          postal_code: shippingAddress.postal_code,
          country: shippingAddress.country,
        }
      }
      if (selectedFulfillmentOption) {
        fulfillmentDetails.selected_fulfillment_option = selectedFulfillmentOption
      }
      body.fulfillment_details = fulfillmentDetails
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
