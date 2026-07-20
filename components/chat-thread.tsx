"use client"

import { useEffect, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { ArrowUp, Loader2, ShoppingBag, AlertCircle } from "lucide-react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { ChatMessage } from "@/components/chat-message"
import type { CatalogProduct, ProductResult } from "@/lib/types"

const FALLBACK_SUGGESTIONS = [
  "What can I shop for here?",
  "Show me your most popular items",
  "Help me find a gift",
  "What's available under $50?",
]

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type CatalogResponse = {
  configured: boolean
  error: string | null
  count: number
  products: CatalogProduct[]
}

type FeedNotice = { tone: "info" | "error"; message: string }

/**
 * Explains *why* the catalog is empty using the fields the API already returns,
 * instead of always showing the generic "still syncing" message. This surfaces
 * misconfiguration and connection errors that were previously swallowed.
 */
function getFeedNotice(catalog: CatalogResponse): FeedNotice | null {
  if (catalog.count > 0) return null
  if (!catalog.configured) {
    return {
      tone: "error",
      message:
        catalog.error ??
        "The product feed isn't configured. Set the SFTP_* environment variables in the Vercel project.",
    }
  }
  if (catalog.error) {
    return { tone: "error", message: catalog.error }
  }
  return {
    tone: "info",
    message:
      "The store catalog is still syncing from the seller's Stripe product feed. Check back shortly once products arrive.",
  }
}

/** Builds friendly starter prompts from whatever the seller actually sells. */
function buildSuggestions(products: CatalogProduct[]): string[] {
  if (products.length === 0) return FALLBACK_SUGGESTIONS
  const names = products.slice(0, 3).map((p) => `Show me the ${p.name}`)
  const categories = Array.from(
    new Set(products.map((p) => p.category).filter(Boolean)),
  ).slice(0, 1) as string[]
  const categoryPrompt = categories.length
    ? `What ${categories[0]} do you have?`
    : "What's available to buy?"
  return [...names, categoryPrompt].slice(0, 4)
}

type ChatThreadProps = {
  conversationId: string
  initialMessages: UIMessage[]
  onMessagesChange: (id: string, messages: UIMessage[]) => void
  onBuy: (product: ProductResult, sessionId: string, quantity: number) => void
}

export function ChatThread({
  conversationId,
  initialMessages,
  onMessagesChange,
  onBuy,
}: ChatThreadProps) {
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: catalog } = useSWR<CatalogResponse>("/api/catalog", fetcher, {
    revalidateOnFocus: false,
  })
  const suggestions = buildSuggestions(catalog?.products ?? [])
  const feedEmpty = catalog ? catalog.count === 0 : false
  const feedNotice = catalog ? getFeedNotice(catalog) : null

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    messages: initialMessages,
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

  function submit(text: string) {
    const value = text.trim()
    if (!value || isLoading) return
    sendMessage({ text: value })
    setInput("")
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
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
                  Describe what you need and I&apos;ll find it from the seller&apos;s
                  catalog and help you check out.
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
                <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
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
              <ChatMessage key={m.id} message={m} onBuy={onBuy} />
            ))
          )}

          {status === "submitted" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Thinking...
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-border bg-background/80 backdrop-blur">
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
              placeholder="Talk to Liv..."
              className="flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Talk to Liv"
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
