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
