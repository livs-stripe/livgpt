"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { loadStripe, type Stripe } from "@stripe/stripe-js"
import {
  AddressElement,
  Elements,
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
  Store,
  Trash2,
  X,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { formatPrice, sellerDisplayName } from "@/lib/parse-product"
import type { CartItem } from "@/lib/types"
import { isValidE164Phone, isValidEmail, toE164Phone } from "@/lib/utils"

// Agentic Commerce / Delegated Checkout: the agent collects the payment method
// with its OWN publishable key. When the RequestedSession is confirmed, Stripe
// mints a Shared Payment Token scoped to the seller (seller_profile_id) and
// routes the charge to that merchant — so no per-seller publishable keys are
// needed here. This mirrors the production model.
const AGENT_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

// Initialize Stripe.js with the agent's publishable key + the required beta
// flag. Cached per key so the instance is reused across renders.
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

const PLACEHOLDER_IMG = "/placeholder.svg"

/** Prefilled so the demo can be driven end to end without typing, mirroring the
 * prefilled shipping address. Editable in the panel. */
const DEMO_EMAIL = "demouser@example.com"

/** Reserved US fictional-use number, so it is obviously fake but still passes
 * E.164 validation. Prefilled and editable like the address and email. */
const DEMO_PHONE = "+14155550123"

/** Swaps a broken product image for the local placeholder, guarding against a
 * loop if the placeholder itself ever fails to load. */
function handleImageError(event: React.SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget
  if (img.src.endsWith(PLACEHOLDER_IMG)) return
  img.src = PLACEHOLDER_IMG
}

/** A shipping/fulfillment option returned by Stripe on the RequestedSession.
 * The exact shape is preview-API dependent, so we read the cost defensively. */
type FulfillmentOption = {
  id?: string
  amount?: number
  total?: { amount?: number }
  subtotal?: { amount?: number }
}

/** Picks the cheapest fulfillment option (falls back to the first when no cost
 * field is present). Returns undefined for an empty list. */
function pickCheapestFulfillmentOption(
  options: FulfillmentOption[],
): FulfillmentOption | undefined {
  if (options.length === 0) return undefined
  const cost = (o: FulfillmentOption) =>
    o.amount ?? o.total?.amount ?? o.subtotal?.amount ?? Number.POSITIVE_INFINITY
  return [...options].sort((a, b) => cost(a) - cost(b))[0]
}

type CheckoutPanelProps = {
  open: boolean
  items: CartItem[]
  theme: "dark" | "light"
  onUpdateQty: (productId: string, qty: number) => void
  onRemove: (productId: string) => void
  onClose: () => void
}

export function CheckoutPanel({
  open,
  items,
  theme,
  onUpdateQty,
  onRemove,
  onClose,
}: CheckoutPanelProps) {
  const stripe = getStripePromise(AGENT_PUBLISHABLE_KEY)

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  const subtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  )
  const currency = items[0]?.product.currency ?? "usd"
  const sellerName = sellerDisplayName(items[0]?.product) ?? "this merchant"

  const elementsOptions = useMemo(
    () =>
      items.length > 0
        ? ({
            mode: "payment" as const,
            amount: subtotal,
            currency,
            // Required for the Shared Payment Token flow: it lets us create the
            // PaymentMethod manually via stripe.preparePaymentMethod()/createPaymentMethod().
            paymentMethodCreation: "manual" as const,
            // `card` alone yields exactly the methods that stay in this panel:
            // it opts into Link's card integration (Link renders inline in the
            // card form) and auto-enables Apple Pay / Google Pay, while keeping
            // dashboard-enabled redirect methods such as Klarna and Affirm out.
            // Passing "link" here instead would make Link a separate payment
            // method rather than an inline part of the card form.
            paymentMethodTypes: ["card"],
            appearance: {
              theme: theme === "dark" ? ("night" as const) : ("stripe" as const),
            },
          })
        : undefined,
    [items.length, subtotal, currency, theme],
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
          {items.length > 0 ? (
            stripe && elementsOptions ? (
              <Elements stripe={stripe} options={elementsOptions}>
                <CheckoutForm
                  items={items}
                  sellerName={sellerName}
                  subtotal={subtotal}
                  currency={currency}
                  onUpdateQty={onUpdateQty}
                  onRemove={onRemove}
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
        No agent publishable key found. Set{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
        </code>{" "}
        (your agent account&apos;s publishable key) to enable the embedded
        payment form.
      </p>
    </div>
  )
}

type Status = "form" | "processing" | "success" | "error"

function CheckoutForm({
  items,
  sellerName,
  subtotal,
  currency,
  onUpdateQty,
  onRemove,
  onClose,
}: {
  items: CartItem[]
  sellerName: string
  subtotal: number
  currency: string
  onUpdateQty: (productId: string, qty: number) => void
  onRemove: (productId: string) => void
  onClose: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()

  const [status, setStatus] = useState<Status>("form")
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState(DEMO_EMAIL)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [order, setOrder] = useState<{
    orderId?: string
    orderStatusUrl?: string
  } | null>(null)

  // RequestedSession lifecycle. The session is (re)created from the WHOLE cart
  // whenever the contents change, so we never depend on per-line-item keys.
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [sessionLoading, setSessionLoading] = useState(false)

  // Signature of the cart contents; changing it triggers a session refresh.
  const signature = items
    .map((i) => `${i.product.id}:${i.quantity}`)
    .join(",")

  const latestReq = useRef(0)

  useEffect(() => {
    if (items.length === 0) return
    const reqId = ++latestReq.current
    setSessionLoading(true)
    setSessionError(null)

    // Debounce rapid quantity clicks into a single session refresh.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/checkout/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map((i) => ({
              productId: i.product.id,
              quantity: i.quantity,
            })),
            currency,
          }),
        })
        const data = await res.json()
        if (reqId !== latestReq.current) return // A newer refresh superseded this.
        if (!res.ok || !data.sessionId) {
          throw new Error(data.error || "Could not start checkout.")
        }
        setSessionId(data.sessionId)
      } catch (err) {
        if (reqId !== latestReq.current) return
        setSessionId(null)
        setSessionError(
          err instanceof Error ? err.message : "Could not start checkout.",
        )
      } finally {
        if (reqId === latestReq.current) setSessionLoading(false)
      }
    }, 350)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, currency])

  async function confirmPurchase() {
    if (!stripe || !elements) return
    if (!sessionId) {
      setError(sessionError || "Checkout is still preparing. Please try again.")
      setStatus("error")
      return
    }

    // Stripe requires an email on `fulfillment_details`, so stop here rather
    // than surfacing a raw missing-param error from the API.
    const buyerEmail = email.trim()
    if (!isValidEmail(buyerEmail)) {
      setEmailError("Enter a valid email address for your order confirmation.")
      setError(null)
      setStatus("form")
      return
    }
    setEmailError(null)

    setStatus("processing")
    setError(null)

    try {
      const { error: submitError } = await elements.submit()
      if (submitError) {
        throw new Error(submitError.message || "Please check your details.")
      }

      // Read the shipping address the buyer entered and attach it to the
      // RequestedSession before confirming — otherwise fulfillment has no
      // destination. The address must be complete before we proceed.
      const addressEl = elements.getElement("address")
      if (!addressEl) {
        throw new Error("Shipping address is unavailable. Please try again.")
      }
      const { complete, value } = await addressEl.getValue()
      if (!complete) {
        setError("Please enter a complete shipping address")
        setStatus("error")
        return
      }

      const buyerPhone = toE164Phone(value.phone)
      if (!isValidE164Phone(buyerPhone)) {
        setError("Please enter a valid phone number for delivery updates")
        setStatus("error")
        return
      }

      const shippingAddress = {
        name: value.name,
        line1: value.address.line1,
        line2: value.address.line2 || undefined,
        city: value.address.city,
        state: value.address.state,
        postal_code: value.address.postal_code,
        country: value.address.country,
      }

      // Attach the address; Stripe responds with the available fulfillment
      // options for that destination.
      const updateRes = await fetch("/api/checkout/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          shippingAddress,
          email: buyerEmail,
          phone: buyerPhone,
        }),
      })
      const updateData = await updateRes.json()
      if (!updateRes.ok || updateData.error) {
        throw new Error(updateData.error || "Could not save your shipping address.")
      }

      const fulfillmentOptions: FulfillmentOption[] = Array.isArray(
        updateData.fulfillmentOptions,
      )
        ? updateData.fulfillmentOptions
        : []
      const chosen = pickCheapestFulfillmentOption(fulfillmentOptions)
      if (!chosen) {
        setError(
          "No shipping option is available for this address. Please try a different address.",
        )
        setStatus("error")
        return
      }

      // Persist the chosen shipping option on the session so it is reflected at
      // confirm time. Only sent when the option exposes an id.
      if (chosen.id) {
        const selectRes = await fetch("/api/checkout/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            shippingAddress,
            email: buyerEmail,
            phone: buyerPhone,
            selectedFulfillmentOption: chosen.id,
          }),
        })
        const selectData = await selectRes.json()
        if (!selectRes.ok || selectData.error) {
          throw new Error(
            selectData.error || "Could not select a shipping option.",
          )
        }
      }

      // Prepare a PaymentMethod using the beta flow. Falls back to
      // createPaymentMethod if the beta method is unavailable.
      const stripeAny = stripe as unknown as {
        preparePaymentMethod?: (
          options: { elements: typeof elements },
        ) => Promise<{ paymentMethod?: { id: string }; error?: { message: string } }>
        createRadarSession?: () => Promise<{
          radarSession?: { id: string }
          error?: { message: string }
        }>
      }

      let paymentMethodId: string | undefined
      if (typeof stripeAny.preparePaymentMethod === "function") {
        // Pass the live Elements instance (the one that owns the mounted
        // PaymentElement) inside the options object, not positionally.
        const prepared = await stripeAny.preparePaymentMethod({ elements })
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

  const busy = status === "processing"

  return (
    <div className="flex flex-col gap-5">
      {/* Seller — a checkout targets a single merchant */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Store className="size-4" />
        <span>
          Sold by <span className="font-medium text-foreground">{sellerName}</span>
        </span>
      </div>

      {/* Cart line items */}
      <div className="flex flex-col gap-3">
        {items.map(({ product, quantity }) => (
          <div key={product.id} className="flex gap-3">
            <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={product.imageUrl || "/placeholder.svg"}
                alt={product.name}
                className="h-full w-full object-cover"
                onError={handleImageError}
              />
            </div>
            <div className="flex flex-1 flex-col">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium leading-tight">{product.name}</span>
                <button
                  type="button"
                  onClick={() => onRemove(product.id)}
                  disabled={busy}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"
                  aria-label={`Remove ${product.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <span className="text-sm text-muted-foreground">
                {formatPrice(product.price, product.currency)} each
              </span>
              <div className="mt-auto flex items-center justify-between gap-2">
                <div className="flex items-center rounded-md border border-border">
                  <button
                    type="button"
                    onClick={() => onUpdateQty(product.id, quantity - 1)}
                    disabled={quantity <= 1 || busy}
                    className="px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                    aria-label={`Decrease ${product.name} quantity`}
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-8 text-center text-sm font-medium tabular-nums">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdateQty(product.id, quantity + 1)}
                    disabled={quantity >= 5 || busy}
                    className="px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                    aria-label={`Increase ${product.name} quantity`}
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {formatPrice(product.price * quantity, product.currency)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Separator />

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Subtotal · {items.reduce((n, i) => n + i.quantity, 0)} item
          {items.reduce((n, i) => n + i.quantity, 0) === 1 ? "" : "s"}
        </span>
        <span className="text-lg font-bold tabular-nums">
          {formatPrice(subtotal, currency)}
        </span>
      </div>

      {sessionError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {sessionError}
        </div>
      ) : null}

      {/* Contact — also supplies `fulfillment_details.email` on the session */}
      <div className="flex flex-col gap-2">
        <label htmlFor="checkout-email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="checkout-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          disabled={busy}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "checkout-email-error" : undefined}
          onChange={(event) => {
            setEmail(event.target.value)
            if (emailError) setEmailError(null)
          }}
        />
        {emailError ? (
          <p id="checkout-email-error" className="text-sm text-destructive">
            {emailError}
          </p>
        ) : null}
      </div>

      {/* Shipping address */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Shipping address</span>
        <AddressElement
          options={{
            mode: "shipping",
            allowedCountries: ["US"],
            // Stripe requires `fulfillment_details[phone]`, and collecting it
            // here keeps it to a single input alongside the address.
            fields: { phone: "always" },
            validation: { phone: { required: "always" } },
            defaultValues: {
              name: "Demo Customer",
              phone: DEMO_PHONE,
              address: {
                line1: "354 Oyster Point Blvd",
                line2: "",
                city: "South San Francisco",
                state: "CA",
                postal_code: "94080",
                country: "US",
              },
            },
          }}
        />
      </div>

      {/* Card / payment details */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Payment</span>
        {/* Wallets are left at their default `auto`, so Link renders inline in
         * the card form and Apple/Google Pay appear on supporting browsers. */}
        <PaymentElement
          options={{ fields: { billingDetails: { phone: "auto" } } }}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button
        onClick={confirmPurchase}
        disabled={!stripe || busy || sessionLoading || !sessionId}
        size="lg"
        className="w-full"
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Processing...
          </>
        ) : sessionLoading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Updating total...
          </>
        ) : (
          <>
            <Lock className="size-4" />
            Confirm Purchase · {formatPrice(subtotal, currency)}
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
