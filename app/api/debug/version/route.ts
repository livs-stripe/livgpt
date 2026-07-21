import { NextResponse } from "next/server"
import { STRIPE_API_VERSION } from "@/lib/stripe-server"

export const dynamic = "force-dynamic"

// Non-secret diagnostic: reports the effective Stripe API version the running
// deployment resolves (code default vs. STRIPE_API_VERSION env override) and
// which Stripe-related env vars are present (booleans only, never values).
export async function GET() {
  return NextResponse.json({
    effectiveStripeApiVersion: STRIPE_API_VERSION,
    envOverrideSet: Boolean(process.env.STRIPE_API_VERSION),
    hasSecretKey: Boolean(process.env.STRIPE_SECRET_KEY),
    hasPublishableKey: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    hasSellerProfileIds: Boolean(process.env.SELLER_PROFILE_IDS),
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  })
}
