import { NextResponse } from "next/server"
import { getStripe, stripeFetch } from "@/lib/stripe-server"

// App Router route handlers always receive the raw body via req.text(),
// so there is no body parser to disable (that is a Pages Router concern).
export const maxDuration = 10

export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get("stripe-signature")
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  let event: { type?: string; data?: { object?: { id?: string } }; id?: string }

  try {
    if (secret && signature) {
      const stripe = getStripe()
      // constructEvent verifies the signature against the raw body.
      event = stripe.webhooks.constructEvent(body, signature, secret) as never
    } else {
      // No secret configured (e.g. local exploration) — parse without verifying.
      event = JSON.parse(body)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature"
    console.error("Agent webhook signature verification failed:", message)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const type = event.type
  const objectId = event.data?.object?.id

  try {
    switch (type) {
      case "v2.orchestrated_commerce.agreement.partially_confirmed": {
        // Auto-approve all connections for this test agent.
        if (objectId) {
          await stripeFetch(
            `/v1/orchestrated_commerce/agreements/${objectId}/confirm`,
            { method: "POST", body: {} },
          )
          console.log("Orchestrated commerce agreement auto-confirmed:", objectId)
        }
        break
      }
      case "v2.orchestrated_commerce.agreement.confirmed":
        console.log("Orchestrated commerce agreement confirmed (feed incoming):", objectId)
        break
      case "v2.orchestrated_commerce.agreement.terminated":
        console.log("Orchestrated commerce agreement terminated:", objectId)
        break
      default:
        console.log("Unhandled agent webhook event:", type)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "handler error"
    console.error("Agent webhook handler error:", message)
  }

  return NextResponse.json({ received: true })
}
