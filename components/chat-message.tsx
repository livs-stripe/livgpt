"use client"

import type { UIMessage } from "ai"
import { Bot, User } from "lucide-react"
import { ProductCard } from "@/components/product-card"
import { Carousel } from "@/components/ui/carousel"
import { parseProductResult, stripDashes, stripMarkers } from "@/lib/parse-product"
import type { ProductResult } from "@/lib/types"

function getText(message: UIMessage): string {
  if (!message.parts) return ""
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
}

type ChatMessageProps = {
  message: UIMessage
  onBuyNow: (product: ProductResult) => void
}

export function ChatMessage({ message, onBuyNow }: ChatMessageProps) {
  const isUser = message.role === "user"
  const rawText = getText(message)
  const { cleanText, products } = isUser
    ? { cleanText: rawText, products: [] as ProductResult[] }
    : parseProductResult(rawText)
  // Never render em/en dashes in assistant replies (keep the user's own text
  // as-is), and never render the markers meant only for the client.
  const displayText = isUser ? cleanText : stripDashes(stripMarkers(cleanText))

  return (
    <div className={`flex w-full gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-blue-600 text-white" : "bg-muted text-foreground"
        }`}
        aria-hidden="true"
      >
        {isUser ? <User className="size-5" /> : <Bot className="size-5" />}
      </div>
      {/* Assistant turns take the full column so the product rail can show a
          card and a half of the next one; user bubbles stay readable. */}
      <div
        className={`flex min-w-0 flex-col ${
          isUser ? "max-w-[min(40rem,88%)] items-end" : "w-full items-start"
        }`}
      >
        {displayText ? (
          <div
            className={`whitespace-pre-wrap rounded-2xl px-5 py-3.5 text-base leading-7 ${
              isUser
                ? "rounded-tr-sm bg-blue-600 text-white"
                : "rounded-tl-sm bg-muted text-foreground"
            }`}
          >
            {displayText}
          </div>
        ) : null}
        {products.length > 0 ? (
          <Carousel
            label={`${products.length} product${products.length === 1 ? "" : "s"} to browse`}
            className="mt-4 w-full"
          >
            {products.map((p) => (
              <div key={p.id} className="w-[300px] shrink-0 snap-start">
                <ProductCard product={p} onBuyNow={onBuyNow} />
              </div>
            ))}
          </Carousel>
        ) : null}
      </div>
    </div>
  )
}
