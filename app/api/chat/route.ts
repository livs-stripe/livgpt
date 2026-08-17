import { createOpenAI } from "@ai-sdk/openai"
import { convertToModelMessages, streamText, type LanguageModel, type UIMessage } from "ai"
import {
  buildSystemPrompt,
  compactMessagesForModel,
  conversationQuery,
  storeSummary,
} from "@/lib/chat-prompt"
import { catalogForPrompt, loadCatalog } from "@/lib/product-feed"

export const maxDuration = 60
export const runtime = "nodejs"

// The chat model, named once. Provider objects take the bare model id; the
// Vercel AI Gateway instead takes a string of the form `<provider>/<model>`,
// where the `openai/` prefix is the Gateway's provider-routing syntax and not
// part of the model id itself.
const MODEL = "gpt-5.5"
const GATEWAY_MODEL = `openai/${MODEL}`

/**
 * Picks the LLM provider from the environment so the same code runs in every
 * deployment target:
 *
 * 1. `OPENAI_API_KEY` — call the OpenAI API directly. Needed on hosts that have
 *    public egress but no Vercel AI Gateway (e.g. the Cloud Run deployment).
 * 2. `LITELLM_BASE_URL` — Stripe's internal LiteLLM proxy, which speaks the
 *    OpenAI API. Opt-in for local development on a corp laptop ONLY: the proxy
 *    requires a hardware-bound device certificate plus an interactive YubiKey
 *    tap, so it is unreachable from any server and must never be the default.
 * 3. Neither — hand `streamText` a bare string model, which the Vercel AI
 *    Gateway routes for us. Zero config, and no personal key or quota involved.
 */
function resolveModel(): LanguageModel {
  if (process.env.OPENAI_API_KEY) {
    return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(MODEL)
  }
  if (process.env.LITELLM_BASE_URL) {
    const litellm = createOpenAI({
      baseURL: process.env.LITELLM_BASE_URL,
      apiKey: process.env.LITELLM_API_KEY || "use_case=development&team=aunz-sa",
    })
    // `.chat()` targets /chat/completions, the route LiteLLM always exposes;
    // the provider's default callable would use the Responses API instead.
    return litellm.chat(MODEL)
  }
  return GATEWAY_MODEL
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json()

  const { products, error } = await loadCatalog()
  if (error) {
    console.error("Product feed load error:", error)
  }
  // Only include the products most relevant to the conversation instead of the
  // entire ~1000-item feed. This keeps the system prompt small so the model
  // streams the first token quickly (previously ~65k catalog tokens/turn).
  // The relevance query spans the recent turns, not just the latest message, so
  // a follow-up like "something cheaper" still retrieves the right shelf.
  const systemPrompt = buildSystemPrompt(
    catalogForPrompt(products, conversationQuery(messages)),
    products.length > 0,
    storeSummary(products),
  )

  const result = streamText({
    model: resolveModel(),
    system: systemPrompt,
    messages: await convertToModelMessages(compactMessagesForModel(messages)),
  })

  return result.toUIMessageStreamResponse({
    onError: (err) => {
      // Log the detailed error server-side only; never leak internals to the
      // client. The UI shows a fixed, friendly message.
      console.error("/api/chat error:", err)
      return "Something went wrong generating a response. Please try again."
    },
  })
}
