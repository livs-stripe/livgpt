import Stripe from "stripe"

export const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION ?? "2025-12-15.preview"
export const SELLER_PROFILE_ID = process.env.SELLER_PROFILE_ID ?? ""

/**
 * Stripe Node SDK instance (used for webhook signature verification and
 * standard API access). The Delegated Checkout preview endpoints are called
 * directly via `stripeFetch` below since they are not yet typed in the SDK.
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set")
  }
  // Cast: preview API versions are not part of the SDK's literal union.
  return new Stripe(key, {
    apiVersion: STRIPE_API_VERSION as never,
  })
}

/**
 * Flattens a nested object into Stripe's form-encoded bracket notation.
 * e.g. { line_items: [{ name: "x" }] } -> line_items[0][name]=x
 */
export function toFormEncoded(
  data: Record<string, unknown>,
  parentKey?: string,
  params: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue
    const fullKey = parentKey ? `${parentKey}[${key}]` : key

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item !== null && typeof item === "object") {
          toFormEncoded(item as Record<string, unknown>, `${fullKey}[${index}]`, params)
        } else {
          params.append(`${fullKey}[${index}]`, String(item))
        }
      })
    } else if (typeof value === "object") {
      toFormEncoded(value as Record<string, unknown>, fullKey, params)
    } else {
      params.append(fullKey, String(value))
    }
  }
  return params
}

type StripeFetchOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  body?: Record<string, unknown>
}

/**
 * Calls a Stripe REST endpoint directly with the agent's secret key.
 * Used for the Delegated Checkout (Agentic Commerce) preview endpoints.
 */
export async function stripeFetch<T = unknown>(
  path: string,
  { method = "POST", body }: StripeFetchOptions = {},
): Promise<{ ok: boolean; status: number; data: T }> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set")
  }

  const url = `https://api.stripe.com${path}`
  const encodedBody = body ? toFormEncoded(body).toString() : undefined

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": STRIPE_API_VERSION,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encodedBody,
  })

  let data: T
  try {
    data = (await res.json()) as T
  } catch {
    data = {} as T
  }

  return { ok: res.ok, status: res.status, data }
}
