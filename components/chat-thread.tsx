"use client"

import { useEffect, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { ArrowUp, Loader2, ShoppingBag, AlertCircle } from "lucide-react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { ChatMessage } from "@/components/chat-message"
import { ErrorBoundary } from "@/components/error-boundary"
import { hasCheckoutSignal } from "@/lib/checkout-signal"
import { parseProductResult } from "@/lib/parse-product"
import type { ProductResult } from "@/lib/types"

/**
 * Openers for an empty thread, three drawn at random per conversation.
 *
 * Hand written, never templated from catalog data: an earlier version
 * interpolated a category from /api/catalog and rendered the raw feed taxonomy
 * path ("What home & garden > household supplies > storage & organization do
 * you have?") straight into the UI.
 *
 * Every prompt was sent to the live feed and checked to return sensible
 * products from the store it targets, so a random draw always demos well. They
 * cover the behaviours the assistant handles (vague asks that earn a question
 * back, budgets, occasions, single store needs, cross store gifting, and
 * problem-first framings) and they only reach for the three merchants the live
 * feed serves: Harbor & Home, Lumen Beauty, and Northwind Apparel. Nothing here
 * points at outdoor, electronics, or travel, where the feed returns nothing.
 */
const SUGGESTION_POOL = [
  "I need a gift and I have no idea where to start",
  "Help me find a birthday gift under $50",
  "It's my mum's birthday next week and she's impossible to buy for",
  "I need a Mother's Day gift and I want it to feel thoughtful",
  "Surprise me with something under $40",
  "A thank you gift for my neighbour, around $30",
  "Put together a housewarming gift that isn't just a candle",
  "I want a cosy night in gift, under $80",
  "Something for a new mum who never gets time for herself",
  "I need a birthday gift for my dad, he's into cooking",
  "It's my friend's 30th and she loves a long bath",
  "Two gifts for under $60 total, one for my flatmate and one for me",
  "My skin's been really dry lately, what would you recommend?",
  "I want to start a proper skincare routine, where do I begin?",
  "My hair keeps getting frizzy, is there something that helps?",
  "I always forget sunscreen, make it easy for me",
  "I can never get to sleep, is there anything that would help?",
  "I just moved into a new apartment and need to sort out the kitchen",
  "My kitchen counter is a mess, help me get it organised",
  "We need better storage for the hall cupboard",
  "I want to upgrade my morning coffee setup",
  "My bedroom feels cold and bare, what would warm it up?",
  "I need new bedding, ours has seen better days",
  "I want to make my dinner table look nicer",
  "I want something soft to lounge around in at home",
  "I want a hoodie that isn't too casual",
  "I'm starting at the gym again and need something to train in",
  "I need a plain tee that will actually last",
  "I need a cap and sunglasses for a beach weekend",
  "My backpack is falling apart, what have you got?",
]

/** Draws `count` distinct openers from the pool. */
function drawSuggestions(count = 3): string[] {
  const remaining = [...SUGGESTION_POOL]
  const drawn: string[] = []
  while (drawn.length < count && remaining.length > 0) {
    drawn.push(...remaining.splice(Math.floor(Math.random() * remaining.length), 1))
  }
  return drawn
}

/**
 * One-tap follow-ups offered under the newest set of product cards. They mirror
 * the refinements the assistant is built to handle, so the next turn builds on
 * the last one instead of starting a fresh search.
 */
const FOLLOW_UPS = ["Something cheaper", "Which would you pick?", "What about another store?"]

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type CatalogResponse = {
  configured: boolean
  error: string | null
  count: number
  categories: string[]
}

type FeedNotice = { tone: "info" | "error"; message: string }

/**
 * Shows a friendly, audience-safe notice when the catalog is empty. We never
 * surface configuration, environment, or connection details to shoppers.
 */
function getFeedNotice(catalog: CatalogResponse): FeedNotice | null {
  if (catalog.count > 0) return null
  return {
    tone: "info",
    message: "The stores are restocking, please check back shortly.",
  }
}

function messageText(message: UIMessage): string {
  if (!message.parts) return ""
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
}

/**
 * Whether the newest message is an assistant turn that put a choice on screen.
 * Follow-up chips only make sense there: after a clarifying question or a
 * "nothing fits" reply, "something cheaper" would be nonsense.
 */
function showsProductChoice(message: UIMessage | undefined): boolean {
  if (!message || message.role !== "assistant") return false
  return parseProductResult(messageText(message)).products.length >= 2
}

type ChatThreadProps = {
  conversationId: string
  initialMessages: UIMessage[]
  onMessagesChange: (id: string, messages: UIMessage[]) => void
  onBuyNow: (product: ProductResult) => void
}

export function ChatThread({
  conversationId,
  initialMessages,
  onMessagesChange,
  onBuyNow,
}: ChatThreadProps) {
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: catalog } = useSWR<CatalogResponse>("/api/catalog", fetcher, {
    revalidateOnFocus: false,
  })
  const feedEmpty = catalog ? catalog.count === 0 : false
  const feedNotice = catalog ? getFeedNotice(catalog) : null

  // Freeze the transport and the initial messages for the lifetime of this
  // mount. The parent persists messages on every update, which hands this
  // component a brand-new `initialMessages` array identity on each render; if
  // that flowed into useChat it could reset the live thread (wiping messages
  // after a product result). A fresh mount per conversation is driven by the
  // `key={active.id}` in the parent, so freezing here is safe and preserves
  // history across conversation switches.
  const [transport] = useState(
    () => new DefaultChatTransport({ api: "/api/chat" }),
  )
  const [initialChatMessages] = useState(() => initialMessages)

  // Draw the starter prompts once per mount. A lazy initializer cannot cause a
  // hydration mismatch here because the parent renders a placeholder until it
  // has hydrated, so this subtree never renders on the server and the first
  // client render is the only render of it. Holding the draw in state also keeps
  // it fixed while the shopper types and while a response streams, and the
  // parent's `key={active.id}` means a new conversation gets a fresh draw
  // without disturbing the thread it replaces. If this component is ever server
  // rendered, move the draw into a mount effect.
  const [suggestions] = useState(() => drawSuggestions())

  const { messages, sendMessage, status, error } = useChat({
    id: conversationId,
    transport,
    messages: initialChatMessages,
  })

  const isLoading = status === "streaming" || status === "submitted"

  useEffect(() => {
    onMessagesChange(conversationId, messages)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages, status])

  // Open the checkout panel when the assistant signals the shopper has settled
  // on one item, so "I'll take the second one" behaves like it sounds.
  //
  // Three guards keep the panel from ever opening on its own:
  //   - messages restored from storage are recorded at mount and never acted on,
  //     so replaying a conversation (or switching back to one) opens nothing;
  //   - every completed assistant message is marked as seen before anything
  //     else happens, so a re-render, a scroll, or a state update cannot repeat
  //     an open that already happened;
  //   - a turn must resolve to exactly one product, which rules out the 2 to 4
  //     product recommendation turns.
  const restoredMessageIds = useRef(new Set(initialChatMessages.map((m) => m.id)))
  const checkoutHandledIds = useRef(new Set<string>())

  useEffect(() => {
    if (isLoading) return
    const latest = messages[messages.length - 1]
    if (!latest || latest.role !== "assistant") return
    if (restoredMessageIds.current.has(latest.id)) return
    if (checkoutHandledIds.current.has(latest.id)) return
    checkoutHandledIds.current.add(latest.id)

    const text = messageText(latest)
    if (!hasCheckoutSignal(text)) return
    const { products } = parseProductResult(text)
    if (products.length !== 1) return
    onBuyNow(products[0])
  }, [messages, isLoading, onBuyNow, initialChatMessages])

  function submit(text: string) {
    const value = text.trim()
    if (!value || isLoading) return
    sendMessage({ text: value })
    setInput("")
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-6 py-16 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <ShoppingBag className="size-7" />
              </div>
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold text-balance">
                  What are you shopping for?
                </h1>
                <p className="text-sm text-muted-foreground text-pretty">
                  Tell me what you&apos;re after and I&apos;ll pull options from the
                  stores I can shop, then help you check out.
                </p>
              </div>
              {feedEmpty && feedNotice ? (
                <div
                  className={`flex max-w-md items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-sm ${
                    feedNotice.tone === "error"
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{feedNotice.message}</span>
                </div>
              ) : (
                <div className="flex w-full max-w-md flex-col gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => submit(s)}
                      className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm text-card-foreground transition-colors hover:bg-muted"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            messages.map((m) => (
              <ErrorBoundary key={m.id}>
                <ChatMessage message={m} onBuyNow={onBuyNow} />
              </ErrorBoundary>
            ))
          )}

          {!isLoading && showsProductChoice(messages[messages.length - 1]) ? (
            <div className="mt-3 flex flex-wrap gap-2 pl-11">
              {FOLLOW_UPS.map((f) => (
                <button
                  key={f}
                  onClick={() => submit(f)}
                  className="rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {f}
                </button>
              ))}
            </div>
          ) : null}

          {status === "submitted" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Thinking...
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-border bg-background/80 backdrop-blur">
        {error ? (
          <div className="mx-auto flex w-full max-w-2xl items-start gap-2 px-4 pt-3">
            <div className="flex flex-1 items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>
                Something went wrong generating a response. Please try sending
                your message again.
              </span>
            </div>
          </div>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit(input)
          }}
          className="mx-auto flex w-full max-w-2xl items-end gap-2 px-4 py-4"
        >
          <div className="flex flex-1 items-center rounded-2xl border border-border bg-card px-4 py-1 focus-within:ring-2 focus-within:ring-ring">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the shopping assistant…"
              className="flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Ask the shopping assistant"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
            className="size-11 shrink-0 rounded-full"
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <ArrowUp className="size-5" />
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
