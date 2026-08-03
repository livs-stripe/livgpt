import { NextResponse } from "next/server"
import { STRIPE_API_VERSION, stripeFetch } from "@/lib/stripe-server"

export const dynamic = "force-dynamic"

// Non-secret diagnostic: reports the effective Stripe API version the running
// deployment resolves (code default vs. STRIPE_API_VERSION env override),
// which Stripe-related env vars are present (booleans only, never values), and
// the live Stripe *account id* the deployed secret key belongs to (so we can
// confirm which agent account is actually in use). The account id is an
// `acct_...` identifier, not a secret.
export async function GET() {
  let stripeAccountId: string | null = null
  let accountError: string | null = null
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const { ok, status, data } = await stripeFetch<{ id?: string; error?: { message?: string } }>(
        "/v1/account",
        { method: "GET" },
      )
      if (ok && data?.id) {
        stripeAccountId = data.id
      } else {
        accountError = data?.error?.message ?? `account lookup failed (status ${status})`
      }
    } catch (err) {
      accountError = err instanceof Error ? err.message : "account lookup error"
    }
  }

  return NextResponse.json({
    effectiveStripeApiVersion: STRIPE_API_VERSION,
    envOverrideSet: Boolean(process.env.STRIPE_API_VERSION),
    hasSecretKey: Boolean(process.env.STRIPE_SECRET_KEY),
    hasPublishableKey: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    hasSellerProfileIds: Boolean(process.env.SELLER_PROFILE_IDS),
    stripeAccountId,
    accountError,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  })
}
