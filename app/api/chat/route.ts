import { convertToModelMessages, streamText, type UIMessage } from "ai"
import { catalogForPrompt, loadCatalog } from "@/lib/product-feed"

export const maxDuration = 30
export const runtime = "nodejs"

function buildSystemPrompt(catalogText: string, hasProducts: boolean): string {
  return `You are Liv, a friendly and knowledgeable shopping assistant. Every product you can offer comes from the live Stripe Agentic Commerce product feed of the connected seller (shown below). You help users discover and purchase these products.

When a user asks to find, buy, or shows interest in something:
1. Search ONLY the available catalog below. Never invent products or use items that are not listed.
2. ALWAYS present a few relevant options (2 to 4 products) when possible, so the user can compare and choose. Briefly describe the options naturally in your message first.
3. After your description, append one JSON block PER recommended product, each in this exact format:
   [PRODUCT_RESULT]{"id":"...","name":"...","price":2999,"currency":"usd","imageUrl":"...","description":"...","sellerId":"..."}[/PRODUCT_RESULT]

When the user says "buy this", "purchase", "checkout", or similar:
- Confirm you're initiating checkout.
- The UI will automatically open the checkout panel.

Always be friendly, concise, and helpful. You can answer general questions about the products in the catalog.

Rules for the JSON blocks:
- Output 2 to 4 [PRODUCT_RESULT] blocks for any product recommendation, ordered best match first (or fewer if fewer relevant products exist).
- Each "price" must be the integer amount in cents exactly as listed in the catalog.
- Use the id, imageUrl, currency, and sellerId exactly as listed in the catalog. Never invent or alter these values.
- If the catalog has nothing relevant, say so honestly and suggest the closest available alternatives.
${hasProducts ? "" : "- The seller's feed currently has no products available. Let the user know politely that the store catalog is still syncing and no items are available to purchase yet, and do NOT output any [PRODUCT_RESULT] blocks.\n"}
AVAILABLE CATALOG (from the connected Stripe seller's product feed):
${catalogText}`
}

/** Extracts the text of the most recent user message for relevance filtering. */
function latestUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== "user") continue
    if (!message.parts) return ""
    return message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ")
  }
  return ""
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json()

  const { products, error } = await loadCatalog()
  if (error) {
    console.error("Product feed load error:", error)
  }
  // Only include the products most relevant to the latest user message instead
  // of the entire ~750-item feed. This keeps the system prompt small so the
  // model streams the first token quickly (previously ~65k catalog tokens/turn).
  const systemPrompt = buildSystemPrompt(
    catalogForPrompt(products, latestUserText(messages)),
    products.length > 0,
  )

  const result = streamText({
    // Routed through the Vercel AI Gateway (zero-config for OpenAI in v0),
    // so it does not depend on a personal OPENAI_API_KEY / its quota.
    model: "openai/gpt-5",
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse({
    onError: (err) => {
      console.error("/api/chat error:", err)
      if (err instanceof Error) return err.message
      return "Something went wrong generating a response."
    },
  })
}
