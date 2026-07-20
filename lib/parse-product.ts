import type { ProductResult } from "./types"

const OPEN_TAG = "[PRODUCT_RESULT]"
const CLOSE_TAG = "[/PRODUCT_RESULT]"

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
  let cursor = firstOpen

  while (cursor !== -1) {
    const jsonStr = extractJsonObject(text, cursor + OPEN_TAG.length)
    if (!jsonStr) break // Next block not complete yet (still streaming).
    try {
      const parsed = JSON.parse(jsonStr)
      if (isValidProduct(parsed) && !seen.has(parsed.id)) {
        seen.add(parsed.id)
        products.push(parsed)
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

export function formatPrice(amount: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}
