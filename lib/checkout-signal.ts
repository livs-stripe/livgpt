/**
 * The marker the assistant appends when the shopper has committed to buying one
 * specific item, so the client can open the checkout panel for them instead of
 * asking them to press a button.
 *
 * It lives outside the [PRODUCT_RESULT] blocks and after them, so the product
 * JSON contract and its parser are untouched, and so a partially streamed marker
 * never appears in the visible message text.
 */
export const CHECKOUT_SIGNAL = "[OPEN_CHECKOUT]"

export function hasCheckoutSignal(text: string): boolean {
  return text.includes(CHECKOUT_SIGNAL)
}

/** Removes the marker, and any partially streamed prefix of it, from display text. */
export function stripCheckoutSignal(text: string): string {
  if (!text) return text
  const stripped = text.replaceAll(CHECKOUT_SIGNAL, "")
  // Mid-stream the tail can hold an incomplete marker such as "[OPEN_CHEC".
  const bracket = stripped.lastIndexOf("[")
  const tail = bracket === -1 ? "" : stripped.slice(bracket)
  return (tail && CHECKOUT_SIGNAL.startsWith(tail) ? stripped.slice(0, bracket) : stripped).trimEnd()
}
