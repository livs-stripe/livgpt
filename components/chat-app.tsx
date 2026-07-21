"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { UIMessage } from "ai"
import { Moon, ShoppingCart, Sun } from "lucide-react"
import { toast } from "sonner"
import { ConversationSidebar } from "@/components/conversation-sidebar"
import { ChatThread } from "@/components/chat-thread"
import { CheckoutPanel } from "@/components/checkout-panel"
import { Button } from "@/components/ui/button"
import { formatPrice, sellerNameFromId } from "@/lib/parse-product"
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

  const cartSeller = cart[0]?.product.sellerId
  const cartCount = useMemo(
    () => cart.reduce((n, item) => n + item.quantity, 0),
    [cart],
  )
  const cartSubtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [cart],
  )
  const cartCurrency = cart[0]?.product.currency ?? "usd"

  const getCartQty = useCallback(
    (productId: string) => cart.find((i) => i.product.id === productId)?.quantity ?? 0,
    [cart],
  )

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

  // Adds a product, capping quantity. Assumes the seller matches (or the cart is
  // empty); seller conflicts are resolved by the callers below.
  const addUnit = useCallback((product: ProductResult) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: Math.min(MAX_QTY, i.quantity + 1) }
            : i,
        )
      }
      return [...prev, { product, quantity: 1 }]
    })
  }, [])

  // Prompts the user to replace a different-seller cart, then runs `after`.
  const promptReplace = useCallback(
    (product: ProductResult, after?: () => void) => {
      toast(`Your cart has items from ${sellerNameFromId(cartSeller)}.`, {
        description: `A checkout can only include one seller. Replace it with ${sellerNameFromId(
          product.sellerId,
        )}?`,
        action: {
          label: "Replace cart",
          onClick: () => {
            setCart([{ product, quantity: 1 }])
            after?.()
          },
        },
      })
    },
    [cartSeller],
  )

  const handleAddToCart = useCallback(
    (product: ProductResult) => {
      if (cart.length > 0 && cartSeller !== product.sellerId) {
        promptReplace(product)
        return
      }
      const atCap = getCartQty(product.id) >= MAX_QTY
      addUnit(product)
      if (atCap) {
        toast.info(`Max quantity (${MAX_QTY}) reached for ${product.name}.`)
      } else {
        toast.success(`Added ${product.name} to cart.`)
      }
    },
    [cart.length, cartSeller, getCartQty, addUnit, promptReplace],
  )

  const handleBuyNow = useCallback(
    (product: ProductResult) => {
      if (cart.length > 0 && cartSeller !== product.sellerId) {
        promptReplace(product, () => setCheckoutOpen(true))
        return
      }
      if (getCartQty(product.id) === 0) addUnit(product)
      setCheckoutOpen(true)
    },
    [cart.length, cartSeller, getCartQty, addUnit, promptReplace],
  )

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

  // Close the sheet automatically if the cart is emptied while it's open.
  useEffect(() => {
    if (checkoutOpen && cart.length === 0) setCheckoutOpen(false)
  }, [checkoutOpen, cart.length])

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

      <main className="flex h-full min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">LivGPT</span>
            <span className="truncate text-xs text-muted-foreground">
              {active.title}
            </span>
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
          onAddToCart={handleAddToCart}
          onBuyNow={handleBuyNow}
          getCartQty={getCartQty}
        />
      </main>

      <CheckoutPanel
        open={checkoutOpen}
        items={cart}
        theme={theme}
        onUpdateQty={setItemQty}
        onRemove={removeItem}
        onClose={closeCheckout}
      />
    </div>
  )
}
