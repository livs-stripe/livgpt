"use client"

import { useCallback, useEffect, useState } from "react"
import type { UIMessage } from "ai"
import { Moon, Sun } from "lucide-react"
import { toast } from "sonner"
import { ConversationSidebar } from "@/components/conversation-sidebar"
import { ChatThread } from "@/components/chat-thread"
import { CheckoutPanel } from "@/components/checkout-panel"
import { Button } from "@/components/ui/button"
import type { Conversation, ProductResult } from "@/lib/types"

const STORAGE_KEY = "ai-shopping-agent:conversations"
const THEME_KEY = "ai-shopping-agent:theme"

function uid() {
  return `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function newConversation(): Conversation {
  const now = Date.now()
  return { id: uid(), title: "New chat", createdAt: now, updatedAt: now, messages: [] }
}

function firstUserText(messages: UIMessage[]): string | null {
  const first = messages.find((m) => m.role === "user")
  if (!first?.parts) return null
  const text = first.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim()
  return text || null
}

export function ChatApp() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [theme, setTheme] = useState<"dark" | "light">("dark")
  const [hydrated, setHydrated] = useState(false)

  // Checkout state
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [checkoutProduct, setCheckoutProduct] = useState<ProductResult | null>(null)
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null)

  // Load from localStorage on mount
  useEffect(() => {
    const storedTheme = (localStorage.getItem(THEME_KEY) as "dark" | "light") || "dark"
    setTheme(storedTheme)

    let parsed: Conversation[] = []
    try {
      parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")
    } catch {
      parsed = []
    }

    if (parsed.length === 0) {
      const first = newConversation()
      parsed = [first]
    }
    setConversations(parsed)
    setActiveId(parsed[0].id)
    setHydrated(true)
  }, [])

  // Apply theme
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    if (hydrated) localStorage.setItem(THEME_KEY, theme)
  }, [theme, hydrated])

  // Persist conversations
  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
  }, [conversations, hydrated])

  const handleMessagesChange = useCallback((id: string, messages: UIMessage[]) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c
        const title =
          c.title === "New chat"
            ? firstUserText(messages)?.slice(0, 40) || c.title
            : c.title
        return { ...c, messages, title, updatedAt: Date.now() }
      }),
    )
  }, [])

  function handleNew() {
    const conv = newConversation()
    setConversations((prev) => [conv, ...prev])
    setActiveId(conv.id)
  }

  function handleDelete(id: string) {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id)
      if (next.length === 0) {
        const conv = newConversation()
        setActiveId(conv.id)
        return [conv]
      }
      if (id === activeId) setActiveId(next[0].id)
      return next
    })
  }

  function handleBuy(product: ProductResult, sessionId: string) {
    setCheckoutProduct(product)
    setCheckoutSessionId(sessionId)
    setCheckoutOpen(true)
  }

  function closeCheckout() {
    setCheckoutOpen(false)
    toast.dismiss()
  }

  const active = conversations.find((c) => c.id === activeId) || null

  if (!hydrated || !active) {
    return <div className="h-screen w-full bg-background" />
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <div className="hidden md:flex">
        <ConversationSidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={setActiveId}
          onNew={handleNew}
          onDelete={handleDelete}
        />
      </div>

      <main className="flex h-full flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">LivGPT</span>
            <span className="truncate text-xs text-muted-foreground">
              {active.title}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>
        </header>

        <ChatThread
          key={active.id}
          conversationId={active.id}
          initialMessages={active.messages as UIMessage[]}
          onMessagesChange={handleMessagesChange}
          onBuy={handleBuy}
        />
      </main>

      <CheckoutPanel
        open={checkoutOpen}
        product={checkoutProduct}
        sessionId={checkoutSessionId}
        theme={theme}
        onClose={closeCheckout}
      />
    </div>
  )
}
