"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { UIMessage } from "ai"
import { Menu, Moon, ShoppingCart, Sparkles, Sun } from "lucide-react"
import { toast } from "sonner"
import { ConversationSidebar } from "@/components/conversation-sidebar"
import { ChatThread } from "@/components/chat-thread"
import { CheckoutPanel } from "@/components/checkout-panel"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/parse-product"
import type { CartItem, Conversation, ProductResult } from "@/lib/types"

const MAX_QTY = 5

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

  // Cart + checkout state. A cart targets a single seller because a Delegated
  // Checkout RequestedSession can only span one seller profile.
  const [cart, setCart] = useState<CartItem[]>([])
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [checkoutGeneration, setCheckoutGeneration] = useState(0)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const cartCount = useMemo(
    () => cart.reduce((n, item) => n + item.quantity, 0),
    [cart],
  )
  const cartSubtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [cart],
  )
  const cartCurrency = cart[0]?.product.currency ?? "usd"

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

  // Buy Now purchases just this product. A Delegated Checkout session targets a
  // single seller, so each Buy Now starts a fresh single-item cart, which sidesteps
  // any cross-seller conflict entirely.
  const handleBuyNow = useCallback((product: ProductResult) => {
    setCart([{ product, quantity: 1 }])
    setCheckoutGeneration((n) => n + 1)
    setCheckoutOpen(true)
  }, [])

  const setItemQty = useCallback((productId: string, qty: number) => {
    const clamped = Math.min(MAX_QTY, Math.max(1, Math.floor(qty)))
    setCart((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, quantity: clamped } : i)),
    )
  }, [])

  const removeItem = useCallback((productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId))
  }, [])

  function openCart() {
    if (cart.length === 0) {
      toast.info("Your cart is empty. Add a product to get started.")
      return
    }
    setCheckoutOpen(true)
  }

  function closeCheckout() {
    setCheckoutOpen(false)
    toast.dismiss()
  }

  function completeCheckout() {
    setCart([])
    setCheckoutOpen(false)
    toast.dismiss()
  }

  // Close the sheet automatically if the cart is emptied while it's open.
  useEffect(() => {
    if (checkoutOpen && cart.length === 0) setCheckoutOpen(false)
  }, [checkoutOpen, cart.length])

  // Close the mobile sidebar drawer on Escape.
  useEffect(() => {
    if (!mobileSidebarOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileSidebarOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [mobileSidebarOpen])

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

      {/* Mobile sidebar drawer (below md) */}
      <div
        className={`fixed inset-0 z-40 md:hidden ${
          mobileSidebarOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!mobileSidebarOpen}
      >
        <div
          onClick={() => setMobileSidebarOpen(false)}
          className={`absolute inset-0 bg-black/60 transition-opacity ${
            mobileSidebarOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={`absolute inset-y-0 left-0 flex transition-transform duration-300 ${
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <ConversationSidebar
            conversations={conversations}
            activeId={activeId}
            onSelect={(id) => {
              setActiveId(id)
              setMobileSidebarOpen(false)
            }}
            onNew={() => {
              handleNew()
              setMobileSidebarOpen(false)
            }}
            onDelete={handleDelete}
          />
        </div>
      </div>

      <main className="flex h-full min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </Button>
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="size-4" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="flex items-center gap-2 text-sm font-semibold">
                Shop with Stripe
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {active.title === "New chat"
                  ? "Shop across stores, check out in chat"
                  : active.title}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              onClick={openCart}
              className="relative gap-2"
              aria-label={`Open cart (${cartCount} item${cartCount === 1 ? "" : "s"})`}
            >
              <ShoppingCart className="size-5" />
              {cartCount > 0 ? (
                <span className="text-sm font-medium tabular-nums">
                  {formatPrice(cartSubtotal, cartCurrency)}
                </span>
              ) : null}
              {cartCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {cartCount}
                </span>
              ) : null}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
          </div>
        </header>

        <ChatThread
          key={active.id}
          conversationId={active.id}
          initialMessages={active.messages as UIMessage[]}
          onMessagesChange={handleMessagesChange}
          onBuyNow={handleBuyNow}
        />
      </main>

      <CheckoutPanel
        key={checkoutGeneration}
        open={checkoutOpen}
        items={cart}
        theme={theme}
        onUpdateQty={setItemQty}
        onRemove={removeItem}
        onClose={closeCheckout}
        onComplete={completeCheckout}
      />
    </div>
  )
}
