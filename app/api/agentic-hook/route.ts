import { NextResponse } from "next/server"

// Minimal, dependency-free seller hook for Stripe Agentic Commerce.
// It handles the `v1.delegated_checkout.finalize_checkout` event and must
// always respond HTTP 200 within Stripe's ~4s timeout. Keep this file free of
// heavy imports (no Stripe SDK, no lib/*) so it cold-starts quickly.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Health check so the Endpoint URL can be verified in a browser.
export async function GET() {
  return NextResponse.json({ ok: true })
}

export async function POST(req: Request) {
  // Read the body defensively. We never verify the Stripe signature here (this
  // is a permissive demo stub) and we never crash on empty/non-JSON bodies.
  try {
    const raw = await req.text()
    if (raw) {
      JSON.parse(raw)
    }
  } catch {
    // Ignore malformed/empty bodies — we always approve below.
  }

  // Documented approve response for the finalize_checkout hook:
  // https://docs.stripe.com/agentic-commerce/for-sellers/hooks
  // The `{ approved: true }` field is a harmless superset in case the live
  // preview API expects a different top-level shape; adjust if needed.
  return NextResponse.json({
    manual_approval_details: {
      type: "approved",
    },
    approved: true,
  })
}
