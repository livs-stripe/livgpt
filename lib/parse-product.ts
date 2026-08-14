import type { ProductResult } from "./types"
import { CHECKOUT_SIGNAL } from "./checkout-signal"
import { knownSellerName } from "./seller-names"

const OPEN_TAG = "[PRODUCT_RESULT]"
const CLOSE_TAG = "[/PRODUCT_RESULT]"

const FOLLOW_UP_OPEN = "[FOLLOW_UPS]"
const FOLLOW_UP_CLOSE = "[/FOLLOW_UPS]"

/** Longest a suggested follow-up may be before it stops looking like a chip. */
const MAX_FOLLOW_UP_CHARS = 40
const MAX_FOLLOW_UPS = 3

/**
 * Reads the follow-up suggestions the assistant offers for its own turn, e.g.
 * `[FOLLOW_UPS]Something for night-time too | Fragrance-free options[/FOLLOW_UPS]`.
 *
 * The model writes these because it is the only thing that knows what the
 * conversation is about; there is deliberately no hardcoded fallback, so a turn
 * that offers nothing (or emits something unusable) simply shows no chips.
 * Returns nothing until the closing tag has arrived, so a half-streamed list
 * never renders.
 */
export function parseFollowUps(text: string): string[] {
  const start = text.indexOf(FOLLOW_UP_OPEN)
  if (start === -1) return []
  const end = text.indexOf(FOLLOW_UP_CLOSE, start)
  if (end === -1) return []

  const seen = new Set<string>()
  for (const raw of text.slice(start + FOLLOW_UP_OPEN.length, end).split("|")) {
    const suggestion = raw.trim()
    if (!suggestion || suggestion.length > MAX_FOLLOW_UP_CHARS) continue
    if (suggestion.includes("[") || suggestion.includes("]")) continue
    seen.add(suggestion)
    if (seen.size === MAX_FOLLOW_UPS) break
  }
  return [...seen]
}

/**
 * Removes every marker the assistant emits for the client from text that is
 * about to be displayed: the checkout signal, the follow-up block, and any
 * trailing fragment of a marker that is still streaming in. Only a genuine
 * prefix of a known marker is dropped, so ordinary bracketed prose survives.
 */
export function stripMarkers(text: string): string {
  if (!text) return text
  let out = text.replaceAll(CHECKOUT_SIGNAL, "")

  const start = out.indexOf(FOLLOW_UP_OPEN)
  if (start !== -1) {
    const end = out.indexOf(FOLLOW_UP_CLOSE, start)
    out =
      end === -1
        ? out.slice(0, start)
        : out.slice(0, start) + out.slice(end + FOLLOW_UP_CLOSE.length)
  }

  const bracket = out.lastIndexOf("[")
  if (bracket !== -1) {
    const tail = out.slice(bracket)
    const markers = [OPEN_TAG, CHECKOUT_SIGNAL, FOLLOW_UP_OPEN]
    if (markers.some((marker) => marker.startsWith(tail))) out = out.slice(0, bracket)
  }
  return out.trimEnd()
}

/**
 * Extracts the first balanced JSON object ({...}) from a string starting at or
 * after `from`. Returns null if no complete, balanced object is present yet
 * (e.g. while the response is still streaming).
 */
function extractJsonObject(text: string, from: number): string | null {
  const start = text.indexOf("{", from)
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const char = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') inString = false
    } else if (char === '"') {
      inString = true
    } else if (char === "{") {
      depth++
    } else if (char === "}") {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/** Validates that a parsed object looks like a usable product result. */
function isValidProduct(value: unknown): value is ProductResult {
  const p = value as ProductResult
  return Boolean(p && p.id && p.name && typeof p.price === "number")
}

/**
 * Normalizes a model-supplied currency into a value that is always safe to pass
 * to `Intl.NumberFormat`. The model is instructed to copy the currency verbatim
 * from the catalog, but LLMs occasionally emit an invalid code (e.g. "US", "$",
 * "dollars", or an empty string). An invalid code makes `Intl.NumberFormat`
 * throw a `RangeError`, which — with no error boundary — unmounts the whole
 * React tree and makes the chat "disappear". Falling back to USD keeps the UI
 * alive instead of crashing.
 */
function normalizeCurrency(currency: unknown): string {
  if (typeof currency !== "string" || currency.trim() === "") return "usd"
  const code = currency.trim().toUpperCase()
  try {
    new Intl.NumberFormat("en-US", { style: "currency", currency: code })
    return currency
  } catch {
    return "usd"
  }
}

/**
 * Extracts every [PRODUCT_RESULT] JSON block from an assistant message and
 * returns the parsed products along with the message text with all blocks
 * removed.
 *
 * The raw block(s) are stripped as soon as the first opening tag appears so
 * partial JSON never renders to the user while the response is still streaming,
 * and each product still parses even if its closing tag is missing or truncated.
 */
export function parseProductResult(text: string): {
  cleanText: string
  products: ProductResult[]
} {
  const firstOpen = text.indexOf(OPEN_TAG)
  if (firstOpen === -1) return { cleanText: text, products: [] }

  // Everything before the first opening tag is the human-readable message.
  const cleanText = text.slice(0, firstOpen).trim()

  const products: ProductResult[] = []
  const seen = new Set<string>()
  // The mock catalog only has a few images per sub-category, so distinct
  // products can share the same photo. Skip any product whose image was already
  // used in this message so no two cards render the identical picture.
  const seenImages = new Set<string>()
  let cursor = firstOpen

  while (cursor !== -1) {
    const jsonStr = extractJsonObject(text, cursor + OPEN_TAG.length)
    if (!jsonStr) break // Next block not complete yet (still streaming).
    try {
      const parsed = JSON.parse(jsonStr)
      const image = typeof parsed?.imageUrl === "string" ? parsed.imageUrl.trim() : ""
      if (isValidProduct(parsed) && !seen.has(parsed.id) && !(image && seenImages.has(image))) {
        seen.add(parsed.id)
        if (image) seenImages.add(image)
        products.push({ ...parsed, currency: normalizeCurrency(parsed.currency) })
      }
    } catch {
      // Ignore malformed block and continue scanning.
    }
    cursor = text.indexOf(OPEN_TAG, cursor + OPEN_TAG.length)
  }

  return { cleanText, products }
}

// Referenced to keep the closing tag meaningful for prompt/documentation parity.
export const PRODUCT_RESULT_TAGS = { open: OPEN_TAG, close: CLOSE_TAG }

/** A slug id segment is a plain lowercase word; anything else is a machine token. */
function isSlugWord(segment: string): boolean {
  return /^[a-z]+$/.test(segment)
}

/**
 * Derives a friendly merchant name from a *slug-style* catalog seller id,
 * e.g. "profile_harbor_and_home" -> "Harbor & Home".
 *
 * Returns null for a real Stripe seller profile id
 * ("profile_test_61V4rlJR6SOOGr86bA6V4rlIU4SQJK89xjP3m2SoKQrI"), which holds no
 * recoverable name: title-casing it produces an unreadable token. Feeds carry
 * the real name out of band instead (`ProductResult.sellerName`).
 */
export function sellerNameFromId(sellerId?: string): string | null {
  if (!sellerId) return null
  const segments = sellerId
    .replace(/^profile[_-]/, "")
    .replace(/^(test|live)[_-]/, "")
    .split(/[_-]/)
    .filter(Boolean)
  if (segments.length === 0 || !segments.every(isSlugWord)) return null
  return segments
    .map((w) => (w === "and" ? "&" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
}

/**
 * The merchant name to display for a product: the name the feed resolved and
 * carried through, else a known merchant for the seller id, else a name
 * recoverable from a slug-style id. Returns null when none of those hold, so
 * callers omit the attribution rather than render an opaque id.
 */
export function sellerDisplayName(product?: {
  sellerId?: string
  sellerName?: string
}): string | null {
  const supplied = product?.sellerName?.trim()
  // `sellerName` reaches us through a model-generated block, so reject anything
  // that came back as an id instead of a name (no brand word runs this long).
  const looksLikeId =
    !supplied ||
    supplied.length > 60 ||
    /^profile[_-]/i.test(supplied) ||
    /[A-Za-z0-9]{16,}/.test(supplied)
  if (!looksLikeId) return supplied
  return knownSellerName(product?.sellerId) ?? sellerNameFromId(product?.sellerId)
}

/**
 * Removes em dashes (—) and en dashes (–) from assistant text and replaces them
 * with natural punctuation, so responses read like normal human writing. The
 * system prompt already instructs the model to avoid them; this is a guaranteed
 * safety net for any that slip through. Hyphens (-) in product names like
 * "3-Wick" are U+002D and are intentionally left untouched.
 */
export function stripDashes(text: string): string {
  if (!text) return text
  return text
    // A dash flanked by spaces becomes a comma pause: "gifting — fun" -> "gifting, fun".
    .replace(/\s+[\u2014\u2013]\s+/g, ", ")
    // Any remaining em/en dash (e.g. tight "cooking—baking") becomes ", ".
    .replace(/[\u2014\u2013]/g, ", ")
    // Tidy up any accidental doubled punctuation like "!, " or ",, ".
    .replace(/([!?.,;:])\s*,\s+/g, "$1 ")
    .replace(/,\s*,\s*/g, ", ")
}

export function formatPrice(amount: number, currency = "usd"): string {
  const value = Number.isFinite(amount) ? amount / 100 : 0
  const code = typeof currency === "string" && currency.trim() ? currency.trim() : "usd"
  // `Intl.NumberFormat` throws a `RangeError` for invalid currency codes. Guard
  // it so a malformed value (e.g. from a model-generated product block) can
  // never crash the render tree; fall back to a plain formatted amount.
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code.toUpperCase(),
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${code.toUpperCase()}`
  }
}
