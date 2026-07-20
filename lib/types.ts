export type ProductResult = {
  id: string
  name: string
  /** Price in smallest currency unit (cents) */
  price: number
  currency: string
  imageUrl: string
  description: string
  sellerId: string
}

/** A product sourced from the Stripe Agentic Commerce product feed. */
export type CatalogProduct = {
  id: string
  name: string
  /** Price in smallest currency unit (cents) */
  price: number
  currency: string
  imageUrl: string
  description: string
  category?: string
  /** Stripe seller profile id this product is purchased from. */
  sellerId?: string
  available?: boolean
}

export type Conversation = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  /** Persisted UIMessage[] from the AI SDK useChat hook */
  messages: unknown[]
}

export type CreateSessionResponse = {
  sessionId: string
  clientSecret?: string | null
}

export type ShippingAddress = {
  line1?: string
  line2?: string
  city?: string
  state?: string
  postal_code?: string
  country?: string
  name?: string
}

export type ConfirmResponse = {
  orderId?: string
  orderStatusUrl?: string
  status?: "completed" | "failed"
  error?: string
}
