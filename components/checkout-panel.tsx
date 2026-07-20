"use client"

import { useEffect, useMemo, useState } from "react"
import { loadStripe, type Stripe } from "@stripe/stripe-js"
import {
  AddressElement,
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js"
import {
  CheckCircle2,
  Loader2,
  Lock,
  Minus,
  Package,
  Plus,
  X,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { formatPrice } from "@/lib/parse-product"
import { getSellerPublishableKey } from "@/lib/seller-keys"
import type { ProductResult } from "@/lib/types"

// Initialize Stripe.js with the SELLER's publishable key + the required beta
// flag. Cached per publishable key so each connected merchant gets its own
// Stripe instance (a product's seller determines which key is used).
const stripePromises = new Map<string, Promise<Stripe | null>>()
function getStripePromise(publishableKey: string | undefined) {
  if (!publishableKey) return null
  let promise = stripePromises.get(publishableKey)
  if (!promise) {
    promise = loadStripe(publishableKey, {
      betas: ["prepare_payment_method_beta_1"],
    } as never)
    stripePromises.set(publishableKey, promise)
  }
  return promise
}

type CheckoutPanelProps = {
  open: boolean
  product: ProductResult | null
  sessionId: string | null
  theme: "dark" | "light"
  onClose: () => void
}

export function CheckoutPanel({
  open,
  product,
  sessionId,
  theme,
  onClose,
}: CheckoutPanelProps) {
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    if (open) setQuantity(1)
  }, [open, product?.id])

  const publishableKey = getSellerPublishableKey(product?.sellerId)
  const stripe = getStripePromise(publishableKey)
  const subtotal = product ? product.price * quantity : 0

  const elementsOptions = useMemo(
    () =>
      product
        ? ({
            mode: "payment" as const,
            amount: subtotal,
            currency: product.currency,
            appearance: {
              theme: theme === "dark" ? ("night" as const) : ("stripe" as const),
            },
          })
        : undefined,
    [product, subtotal, theme],
  )

  return (
    <div
      className={`fixed inset-0 z-50 transition ${
        open ? "pointer-events-auto" : "pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Checkout"
        className={`absolute inset-x-0 bottom-0 mx-auto max-h-[92vh] w-full max-w-lg overflow-hidden rounded-t-2xl border border-border bg-card text-card-foreground shadow-2xl transition-transform duration-300 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Package className="size-4" />
            Checkout
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close checkout"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-60px)] overflow-y-auto px-5 py-4">
          {product && sessionId ? (
            stripe && elementsOptions ? (
              <Elements stripe={stripe} options={elementsOptions}>
                <CheckoutForm
                  product={product}
                  sessionId={sessionId}
                  quantity={quantity}
                  setQuantity={setQuantity}
                  subtotal={subtotal}
                  onClose={onClose}
                />
              </Elements>
            ) : (
              <MissingKeyNotice />
            )
          ) : null}
        </div>
      </div>
    </div>
  )
}

function MissingKeyNotice() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
      <Lock className="mx-auto mb-3 size-6" />
      <p className="font-medium text-foreground">Stripe is not configured</p>
      <p className="mt-1">
        No publishable key found for this seller. Set{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          NEXT_PUBLIC_SELLER_PUBLISHABLE_KEYS
        </code>{" "}
        (a JSON map of seller profile id → key) or{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          NEXT_PUBLIC_SELLER_PUBLISHABLE_KEY
        </code>{" "}
        to enable the embedded payment form.
      </p>
    </div>
  )
}

type Status = "form" | "processing" | "success" | "error"

function CheckoutForm({
  product,
  sessionId,
  quantity,
  setQuantity,
  subtotal,
  onClose,
}: {
  product: ProductResult
  sessionId: string
  quantity: number
  setQuantity: (q: number) => void
  subtotal: number
  onClose: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()

  const [status, setStatus] = useState<Status>("form")
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<{
    orderId?: string
    orderStatusUrl?: string
  } | null>(null)

  async function updateQuantity(next: number) {
    const clamped = Math.min(5, Math.max(1, next))
    setQuantity(clamped)
    // Sync quantity to the RequestedSession (best-effort).
    fetch("/api/checkout/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, quantity: clamped }),
    }).catch(() => {})
  }

  async function confirmPurchase() {
    if (!stripe || !elements) return
    setStatus("processing")
    setError(null)

    try {
      const { error: submitError } = await elements.submit()
      if (submitError) {
        throw new Error(submitError.message || "Please check your details.")
      }

      // Prepare a PaymentMethod using the beta flow. Falls back to
      // createPaymentMethod if the beta method is unavailable.
      const stripeAny = stripe as unknown as {
        preparePaymentMethod?: (
          elements: unknown,
        ) => Promise<{ paymentMethod?: { id: string }; error?: { message: string } }>
        createRadarSession?: () => Promise<{
          radarSession?: { id: string }
          error?: { message: string }
        }>
      }

      let paymentMethodId: string | undefined
      if (typeof stripeAny.preparePaymentMethod === "function") {
        const prepared = await stripeAny.preparePaymentMethod(elements)
        if (prepared.error) throw new Error(prepared.error.message)
        paymentMethodId = prepared.paymentMethod?.id
      } else {
        const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
          elements,
        })
        if (pmError) throw new Error(pmError.message || "Payment failed.")
        paymentMethodId = paymentMethod?.id
      }

      if (!paymentMethodId) {
        throw new Error("Could not create a payment method.")
      }

      // Collect a Radar session for fraud signals (best-effort).
      let radarSessionId: string | undefined
      if (typeof stripeAny.createRadarSession === "function") {
        try {
          const radar = await stripeAny.createRadarSession()
          radarSessionId = radar.radarSession?.id
        } catch {
          radarSessionId = undefined
        }
      }

      const res = await fetch("/api/checkout/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, paymentMethodId, radarSessionId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || "Could not confirm the order.")
      }

      setOrder({ orderId: data.orderId, orderStatusUrl: data.orderStatusUrl })
      setStatus("success")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
      setStatus("error")
    }
  }

  if (status === "success") {
    const eta = new Date()
    eta.setDate(eta.getDate() + 5)
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle2 className="size-14 text-emerald-500" />
        <h3 className="text-xl font-semibold">Order confirmed!</h3>
        <p className="text-sm text-muted-foreground">
          Order number:{" "}
          <span className="font-mono text-foreground">
            {order?.orderId ?? "—"}
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          Estimated delivery:{" "}
          {eta.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
          })}
        </p>
        <div className="mt-3 flex w-full flex-col gap-2">
          {order?.orderStatusUrl ? (
            <a
              href={order.orderStatusUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ size: "lg", className: "w-full" })}
            >
              Track Order
            </a>
          ) : null}
          <Button variant="outline" className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Order summary */}
      <div className="flex gap-3">
        <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.imageUrl || "/placeholder.svg"}
            alt={product.name}
            className="h-full w-full object-cover"
            crossOrigin="anonymous"
          />
        </div>
        <div className="flex flex-1 flex-col">
          <span className="font-medium">{product.name}</span>
          <span className="text-sm text-muted-foreground">
            {formatPrice(product.price, product.currency)} each
          </span>
          <div className="mt-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Qty</span>
            <div className="flex items-center rounded-md border border-border">
              <button
                type="button"
                onClick={() => updateQuantity(quantity - 1)}
                disabled={quantity <= 1}
                className="px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                aria-label="Decrease quantity"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="w-8 text-center text-sm font-medium">{quantity}</span>
              <button
                type="button"
                onClick={() => updateQuantity(quantity + 1)}
                disabled={quantity >= 5}
                className="px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                aria-label="Increase quantity"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="text-lg font-bold">
          {formatPrice(subtotal, product.currency)}
        </span>
      </div>

      {/* Express checkout (Apple Pay / Google Pay / Link) */}
      <div>
        <ExpressCheckoutElement
          onConfirm={confirmPurchase}
          options={{ buttonHeight: 44 }}
        />
      </div>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or pay with card</span>
        <Separator className="flex-1" />
      </div>

      {/* Shipping address */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Shipping address</span>
        <AddressElement options={{ mode: "shipping" }} />
      </div>

      {/* Card / payment details */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Payment</span>
        <PaymentElement options={{ fields: { billingDetails: { phone: "auto" } } }} />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button
        onClick={confirmPurchase}
        disabled={!stripe || status === "processing"}
        size="lg"
        className="w-full"
      >
        {status === "processing" ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Lock className="size-4" />
            Confirm Purchase · {formatPrice(subtotal, product.currency)}
          </>
        )}
      </Button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3" />
        Payments secured by Stripe
      </p>
    </div>
  )
}
