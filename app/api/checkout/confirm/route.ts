import { NextResponse } from "next/server"
import { stripeFetch } from "@/lib/stripe-server"

export const maxDuration = 30

type Body = {
  sessionId?: string
  paymentMethodId?: string
  radarSessionId?: string
}

export async function POST(req: Request) {
  try {
    const { sessionId, paymentMethodId, radarSessionId }: Body = await req.json()

    if (!sessionId || !paymentMethodId) {
      return NextResponse.json(
        { error: "Missing sessionId or paymentMethodId" },
        { status: 400 },
      )
    }

    const body: Record<string, unknown> = {
      payment_method: paymentMethodId,
    }

    if (radarSessionId) {
      body.risk_details = {
        client_device_metadata_details: {
          radar_session: radarSessionId,
        },
      }
    }

    const { ok, status, data } = await stripeFetch<{
      id: string
      status?: string
      order?: { id?: string; status_url?: string }
      order_status_url?: string
      error?: { message: string }
    }>(`/v1/delegated_checkout/requested_sessions/${sessionId}/confirm`, {
      method: "POST",
      body,
    })

    if (!ok) {
      const message =
        (data as { error?: { message: string } })?.error?.message ||
        "Failed to confirm checkout session"
      return NextResponse.json({ error: message }, { status })
    }

    return NextResponse.json({
      orderId: data.order?.id ?? data.id,
      orderStatusUrl: data.order?.status_url ?? data.order_status_url ?? null,
      status: "completed",
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
