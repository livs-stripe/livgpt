import Stripe from "stripe"

export const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION ?? "2025-12-15.preview"
export const SELLER_PROFILE_ID = process.env.SELLER_PROFILE_ID ?? ""

/**
 * Maps a catalog product's `sellerId` to the real Stripe *seller profile id*
 * the agent transacts against, so Delegated Checkout charges settle on that
 * merchant's account (and show up in their Dashboard).
 *
 * The demo catalog ships with placeholder seller ids (e.g. "profile_lumen_beauty").
 * To run a live sandbox demo, set SELLER_PROFILE_IDS to a JSON map of
 * { "<catalog_seller_id>": "<real_sandbox_profile_id>" }. Unmapped sellers fall
 * back to SELLER_PROFILE_ID. Keep this keyed the same way as
 * NEXT_PUBLIC_SELLER_PUBLISHABLE_KEYS so profile id + publishable key line up.
 */
let cachedProfileMap: Record<string, string> | null = null
function profileIdMap(): Record<string, string> {
  if (cachedProfileMap) return cachedProfileMap
  const raw = process.env.SELLER_PROFILE_IDS
  if (!raw) return (cachedProfileMap = {})
  try {
    const parsed = JSON.parse(raw)
    cachedProfileMap =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, string>)
        : {}
  } catch {
    cachedProfileMap = {}
  }
  return cachedProfileMap
}

/** Resolves a catalog seller id to the real Stripe seller profile id to charge. */
export function resolveSellerProfileId(catalogSellerId?: string): string {
  const mapped = catalogSellerId ? profileIdMap()[catalogSellerId] : undefined
  return mapped || SELLER_PROFILE_ID || catalogSellerId || ""
}

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
