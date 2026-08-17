import type { SyntheticEvent } from "react"

/**
 * Catalog photos are static files on the public image host. The shopping UI
 * sits behind Vercel Deployment Protection, so an image_link aimed at that app
 * (or a root-relative /mock-catalog path resolved against it) 401s and the card
 * shows "Image unavailable". Always load from the public host. Unique-SKU
 * merchants also have a deterministic JPEG per id; prefer that over whatever
 * the model copied, which is often the product page URL or a retired .png path.
 */
export const PUBLIC_IMAGE_ORIGIN = "https://livgpt.vercel.app"
export const PLACEHOLDER_IMG = "/placeholder.svg"

const CATALOG_IMAGE = /\/mock-catalog\/images\/[^\s?#]+/

const SKU_FOLDERS: Record<string, string> = {
  HAH: "harbor-and-home",
  LB: "lumen-beauty",
  NA: "northwind-apparel",
  VE: "voltedge-electronics",
}

const SKU_RE = /\b((?:HAH|LB|NA|VE)-[A-Z0-9]+-\d+)\b/i

function skuFrom(value?: string | null): string {
  return value?.trim().match(SKU_RE)?.[1]?.toUpperCase() ?? ""
}

export function catalogImagePath(id?: string | null): string {
  const sku = skuFrom(id)
  if (!sku) return ""
  const folder = SKU_FOLDERS[sku.split("-")[0]]
  if (!folder) return ""
  return `/mock-catalog/images/${folder}/${sku}.jpg`
}

export function catalogImageFromId(id?: string | null): string {
  const path = catalogImagePath(id)
  return path ? `${PUBLIC_IMAGE_ORIGIN}${path}` : ""
}

export function publicProductImageUrl(raw?: string | null): string {
  const value = raw?.trim() ?? ""
  if (!value) return ""

  const catalogPath = value.match(CATALOG_IMAGE)?.[0]
  if (catalogPath) {
    const path = skuFrom(catalogPath)
      ? catalogPath.replace(/\.png$/i, ".jpg")
      : catalogPath
    return `${PUBLIC_IMAGE_ORIGIN}${path}`
  }

  if (value.startsWith("/")) return `${PUBLIC_IMAGE_ORIGIN}${value}`

  return value
}

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

export function handleProductImageError(
  event: SyntheticEvent<HTMLImageElement>,
  productId?: string,
) {
  const img = event.currentTarget
  if (img.src.endsWith(PLACEHOLDER_IMG)) return

  const rawSrc = img.getAttribute("src") || img.src
  const next =
    catalogImageFromId(productId) ||
    catalogImageFromId(rawSrc) ||
    publicProductImageUrl(rawSrc)

  if (next && img.dataset.retried !== "1" && next !== img.src) {
    img.dataset.retried = "1"
    img.src = next
    return
  }
  img.src = PLACEHOLDER_IMG
}
