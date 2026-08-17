import type { SyntheticEvent } from "react"

/**
 * Catalog photos are static files on the public image host. The shopping UI
 * itself sits behind Vercel Deployment Protection, so any image_link that still
 * points at that app (or is a root-relative /mock-catalog path) 401s and the
 * card shows "Image unavailable". Unique-SKU merchants also have a deterministic
 * JPEG per id; prefer that over whatever the model copied, which is often the
 * product page URL or a retired .png path.
 */
export const PUBLIC_IMAGE_ORIGIN = "https://livgpt.vercel.app"
export const PLACEHOLDER_IMG = "/placeholder.svg"

const CATALOG_IMAGE = /\/mock-catalog\/images\/[^\s?#]+/

/** Prefix → folder for merchants with one JPEG per SKU. */
const SKU_FOLDERS: Record<string, string> = {
  HAH: "harbor-and-home",
  LB: "lumen-beauty",
  NA: "northwind-apparel",
  VE: "voltedge-electronics",
}

const SKU_RE = /\b((?:HAH|LB|NA|VE)-[A-Z0-9]+-\d+)\b/i

export function catalogImageFromId(id?: string | null): string {
  const sku = id?.trim().match(SKU_RE)?.[1]?.toUpperCase() ?? ""
  if (!sku) return ""
  const prefix = sku.split("-")[0]
  const folder = SKU_FOLDERS[prefix]
  if (!folder) return ""
  return `${PUBLIC_IMAGE_ORIGIN}/mock-catalog/images/${folder}/${sku}.jpg`
}

export function publicProductImageUrl(raw?: string | null): string {
  const value = raw?.trim() ?? ""
  if (!value) return ""

  const catalogPath = value.match(CATALOG_IMAGE)?.[0]
  if (catalogPath) return `${PUBLIC_IMAGE_ORIGIN}${catalogPath}`

  if (value.startsWith("/")) return `${PUBLIC_IMAGE_ORIGIN}${value}`

  return value
}

/** Best URL for a card: SKU JPEG when we know the merchant, else the rewritten feed URL. */
export function imageUrlForProduct(product: {
  id?: string
  imageUrl?: string
}): string {
  return (
    catalogImageFromId(product.id) ||
    catalogImageFromId(product.imageUrl) ||
    publicProductImageUrl(product.imageUrl)
  )
}

/** On a broken image, try the SKU JPEG / public host, then the local placeholder. */
export function handleProductImageError(
  event: SyntheticEvent<HTMLImageElement>,
  productId?: string,
) {
  const img = event.currentTarget
  if (img.src.endsWith(PLACEHOLDER_IMG)) return

  const attempts = [
    catalogImageFromId(productId),
    publicProductImageUrl(img.getAttribute("src") || img.src).replace(/\.png$/i, ".jpg"),
  ].filter((url) => url && url !== img.src)

  const next = attempts[0]
  if (next && img.dataset.retried !== "1") {
    img.dataset.retried = "1"
    img.src = next
    return
  }
  img.src = PLACEHOLDER_IMG
}
