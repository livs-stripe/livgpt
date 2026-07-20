"use client"

import type { UIMessage } from "ai"
import { Bot, User } from "lucide-react"
import { ProductCard } from "@/components/product-card"
import { parseProductResult } from "@/lib/parse-product"
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
  onBuy: (product: ProductResult, sessionId: string, quantity: number) => void
}

export function ChatMessage({ message, onBuy }: ChatMessageProps) {
  const isUser = message.role === "user"
  const rawText = getText(message)
  const { cleanText, products } = isUser
    ? { cleanText: rawText, products: [] as ProductResult[] }
    : parseProductResult(rawText)

  return (
    <div className={`flex w-full gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-blue-600 text-white" : "bg-muted text-foreground"
        }`}
        aria-hidden="true"
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div className={`flex max-w-[80%] flex-col ${isUser ? "items-end" : "items-start"}`}>
        {cleanText ? (
          <div
            className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              isUser
                ? "rounded-tr-sm bg-blue-600 text-white"
                : "rounded-tl-sm bg-muted text-foreground"
            }`}
          >
            {cleanText}
          </div>
        ) : null}
        {products.length > 0 ? (
          <div className="mt-3 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} onBuy={onBuy} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
