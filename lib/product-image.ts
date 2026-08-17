import type { SyntheticEvent } from "react"

/**
 * Catalog photos are static files on the public image host. The shopping UI
 * itself sits behind Vercel Deployment Protection, so any image_link that still
 * points at that app (or is a root-relative /mock-catalog path) 401s and the
 * card shows "Image unavailable". Rewrite those URLs here, at ingest and at
 * render, so a stale feed or a model-copied path still resolves.
 */
export const PUBLIC_IMAGE_ORIGIN = "https://livgpt.vercel.app"
export const PLACEHOLDER_IMG = "/placeholder.svg"

const CATALOG_IMAGE = /\/mock-catalog\/images\/[^\s?#]+/

export function publicProductImageUrl(raw?: string | null): string {
  const value = raw?.trim() ?? ""
  if (!value) return ""

  const catalogPath = value.match(CATALOG_IMAGE)?.[0]
  if (catalogPath) return `${PUBLIC_IMAGE_ORIGIN}${catalogPath}`

  if (value.startsWith("/")) return `${PUBLIC_IMAGE_ORIGIN}${value}`

  return value
}

/** On a broken image, try the public host once, then the local placeholder. */
export function handleProductImageError(
  event: SyntheticEvent<HTMLImageElement>,
) {
  const img = event.currentTarget
  if (img.src.endsWith(PLACEHOLDER_IMG)) return
  const rewritten = publicProductImageUrl(img.getAttribute("src") || img.src)
  if (rewritten && rewritten !== img.src && img.dataset.retried !== "1") {
    img.dataset.retried = "1"
    img.src = rewritten
    return
  }
  img.src = PLACEHOLDER_IMG
}
