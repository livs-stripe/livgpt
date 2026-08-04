import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe-server"

export const maxDuration = 10

export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get("stripe-signature")
  // The seller's webhook signing secret.
  const secret =
    process.env.STRIPE_SELLER_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET

  let event: Stripe.Event

  try {
    if (secret && signature) {
      const stripe = getStripe()
      event = stripe.webhooks.constructEvent(body, signature, secret)
    } else {
      event = JSON.parse(body) as Stripe.Event
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature"
    console.error("Seller webhook signature verification failed:", message)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  if (event.type === "checkout.session.completed") {
    // Fulfillment logic would go here (e.g. create order, notify warehouse).
  }

  return NextResponse.json({ received: true })
}
