import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Stripe rejects a Delegated Checkout RequestedSession whose
 * `fulfillment_details` omits a well-formed `email`, so both the panel and the
 * update route gate on this before calling the API. */
export function isValidEmail(value: string | undefined | null): boolean {
  if (!value) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/** Normalizes a typed phone number to E.164, which is what Stripe expects for
 * `fulfillment_details[phone]`. The Address Element hands back whatever the
 * shopper typed, and this checkout is US-only, so bare 10-digit and 1-prefixed
 * numbers are promoted to +1. Returns undefined when it can't be normalized. */
export function toE164Phone(value: string | undefined | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  const digits = trimmed.replace(/\D/g, "")
  if (trimmed.startsWith("+")) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`
  return undefined
}

export function isValidE164Phone(value: string | undefined | null): boolean {
  if (!value) return false
  return /^\+[1-9]\d{7,14}$/.test(value)
}
