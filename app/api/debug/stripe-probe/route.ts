import { NextResponse } from "next/server"
import { STRIPE_API_VERSION } from "@/lib/stripe-server"

export const dynamic = "force-dynamic"
export const maxDuration = 30

// TEMPORARY diagnostic. Calls Stripe with the deployment's key and returns the
// FULL raw error payloads + selected response headers so we can definitively
// classify why the Delegated Checkout endpoint 404s (account-not-enrolled vs.
// wrong-version vs. invalid-key vs. bad-profile-id).
//
// SAFETY: never returns the secret key or any key material — only the key MODE
// prefix (e.g. "sk_test_"), booleans, Stripe's own error bodies, and response
// headers (request-id / stripe-version). Delete this route once classified.

type ProbeResult = {
  label: string
  method: string
  path: string
  status: number | null
  ok: boolean
  errorBody: unknown
  requestId: string | null
  stripeVersion: string | null
  networkError?: string
}

async function probe(
  label: string,
  method: "GET" | "POST",
  path: string,
  body: string | undefined,
  key: string,
): Promise<ProbeResult> {
  try {
    const res = await fetch(`https://api.stripe.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Stripe-Version": STRIPE_API_VERSION,
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body,
    })
    let parsed: unknown = null
    try {
      parsed = await res.json()
    } catch {
      parsed = null
    }
    return {
      label,
      method,
      path,
      status: res.status,
      ok: res.ok,
      errorBody: parsed,
      requestId: res.headers.get("request-id"),
      stripeVersion: res.headers.get("stripe-version"),
    }
  } catch (err) {
    return {
      label,
      method,
      path,
      status: null,
      ok: false,
      errorBody: null,
      requestId: null,
      stripeVersion: null,
      networkError: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function GET() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY not set" }, { status: 500 })
  }

  const keyMode = key.startsWith("sk_live")
    ? "live"
    : key.startsWith("sk_test")
      ? "test"
      : key.startsWith("rk_")
        ? "restricted"
        : "unknown"

  const dcBody = new URLSearchParams()
  dcBody.append("seller_details[network_profile]", "profile_probe_test")
  dcBody.append("currency", "usd")
  dcBody.append("line_item_details[0][sku_id]", "sku_probe_test")
  dcBody.append("line_item_details[0][quantity]", "1")

  const sptBody = new URLSearchParams()
  sptBody.append("currency", "usd")

  const [control, delegatedCheckout, sharedPayment] = await Promise.all([
    probe("control:GET /v1/balance", "GET", "/v1/balance", undefined, key),
    probe(
      "delegated_checkout:POST /v1/delegated_checkout/requested_sessions",
      "POST",
      "/v1/delegated_checkout/requested_sessions",
      dcBody.toString(),
      key,
    ),
    probe(
      "shared_payment:POST /v1/shared_payment/issued_tokens",
      "POST",
      "/v1/shared_payment/issued_tokens",
      sptBody.toString(),
      key,
    ),
  ])

  return NextResponse.json({
    effectiveStripeApiVersion: STRIPE_API_VERSION,
    keyMode,
    keyPrefix: key.slice(0, 8),
    probes: { control, delegatedCheckout, sharedPayment },
  })
}
