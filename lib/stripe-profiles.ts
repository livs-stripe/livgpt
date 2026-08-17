import "server-only"
import { stripeFetch } from "./stripe-server"

/**
 * Merchant names come from Stripe, never from this repo. Every business on the
 * Stripe network has a business profile — the identity a seller sets up and the
 * Dashboard displays — so a store's name is read from that profile:
 *
 *   GET /v2/network/business_profiles/{profile_id}  -> { display_name, ... }
 *   GET /v2/network/business_profiles/me            -> this agent's own profile
 *
 * A feed identifies its seller only by profile id, which is exactly the key this
 * endpoint takes, so the name shown next to a product is whatever that merchant
 * calls themselves in Stripe. Lookups are cached per instance because names
 * change far more rarely than the feed is ingested, and a failure resolves to
 * null so the caller can fall back to what the feed itself carries.
 *
 * The path is tied to STRIPE_API_VERSION: this resource is `business_profiles`
 * as of the 2026-04-22.preview the app pins, and is reached at
 * `/v2/network/profiles/{id}` in later previews. Raising the pinned version
 * without revisiting these paths would silently leave every store unnamed.
 */

type NetworkBusinessProfile = {
  id?: string
  display_name?: string
  username?: string
  url?: string
}

const TTL_MS = 60 * 60 * 1000
const nameCache = new Map<string, { name: string | null; at: number }>()

/**
 * Whether an id can address a network business profile. Real ids carry a long
 * opaque tail ("profile_test_61V4rlJR6SOO..."); the demo catalog's slug-style
 * placeholders ("profile_lumen_beauty") name no business on the network, so they
 * are rejected here instead of spending a request to be told so.
 */
function isNetworkProfileId(id: string): boolean {
  return /^profile_(?:test_|live_)?[A-Za-z0-9]{20,}$/.test(id)
}

async function retrieveProfile(path: string): Promise<NetworkBusinessProfile | null> {
  try {
    const { ok, data } = await stripeFetch<NetworkBusinessProfile>(path, { method: "GET" })
    return ok ? data : null
  } catch {
    // No secret key configured, or the call failed outright.
    return null
  }
}

/** The name the given seller goes by in Stripe, or null if it can't be read. */
export async function stripeSellerName(profileId?: string): Promise<string | null> {
  const id = profileId?.trim()
  if (!id || !isNetworkProfileId(id)) return null

  const cached = nameCache.get(id)
  if (cached && Date.now() - cached.at < TTL_MS) return cached.name

  const profile = await retrieveProfile(
    `/v2/network/business_profiles/${encodeURIComponent(id)}`,
  )
  const name = profile?.display_name?.trim() || null
  nameCache.set(id, { name, at: Date.now() })
  return name
}

/**
 * This agent's own network profile. The profile id is the identity sellers see
 * (and pair with in an orchestrated commerce agreement), so it is worth being
 * able to read rather than keep a note of.
 */
export async function agentNetworkProfile(): Promise<NetworkBusinessProfile | null> {
  return retrieveProfile("/v2/network/business_profiles/me")
}
