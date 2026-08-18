"use client"

import { useEffect, useState } from "react"
import { ShoppingBag, Store, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { formatPrice, sellerDisplayName } from "@/lib/parse-product"
import {
  PLACEHOLDER_IMG,
  handleProductImageError,
  imageUrlForProduct,
} from "@/lib/product-image"
import type { ProductResult } from "@/lib/types"

type ProductCardProps = {
  product: ProductResult
  onBuyNow: (product: ProductResult) => void
}

export function ProductCard({ product, onBuyNow }: ProductCardProps) {
  const [detailOpen, setDetailOpen] = useState(false)
  const sellerName = sellerDisplayName(product)

  return (
    <>
      <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md">
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className="group block aspect-[4/3] w-full overflow-hidden bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`View details for ${product.name}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrlForProduct(product) || PLACEHOLDER_IMG}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            onError={(event) => handleProductImageError(event, product.id)}
          />
        </button>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            aria-label={`View details for ${product.name}`}
          >
            <div className="flex items-start justify-between gap-2">
              {/* Clamped so a long feed title cannot push a card in the rail to
                  four lines and knock the row out of alignment. */}
              <h3 className="line-clamp-2 text-[17px] font-semibold leading-snug text-pretty">
                {product.name}
              </h3>
              <span className="shrink-0 text-lg font-bold text-emerald-500">
                {formatPrice(product.price, product.currency)}
              </span>
            </div>
            {sellerName ? (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {sellerName}
              </p>
            ) : null}
            <p className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          </button>
          <div className="mt-auto flex gap-2 pt-1">
            <Button onClick={() => onBuyNow(product)} className="w-full">
              <ShoppingBag className="size-4" />
              Buy Now
            </Button>
          </div>
        </div>
      </div>

      <ProductDetail
        product={product}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onBuyNow={onBuyNow}
      />
    </>
  )
}

function ProductDetail({
  product,
  open,
  onClose,
  onBuyNow,
}: {
  product: ProductResult
  open: boolean
  onClose: () => void
  onBuyNow: (product: ProductResult) => void
}) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  const sellerName = sellerDisplayName(product)

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
        aria-label={product.name}
        className={`absolute inset-x-0 bottom-0 mx-auto max-h-[92vh] w-full max-w-lg overflow-hidden rounded-t-2xl border border-border bg-card text-card-foreground shadow-2xl transition-transform duration-300 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">Product details</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close product details"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-60px)] overflow-y-auto">
          <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrlForProduct(product) || PLACEHOLDER_IMG}
              alt={product.name}
              className="h-full w-full object-cover"
              onError={(event) => handleProductImageError(event, product.id)}
            />
          </div>

          <div className="flex flex-col gap-4 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold leading-tight text-pretty">
                {product.name}
              </h3>
              <span className="shrink-0 text-xl font-bold text-emerald-500">
                {formatPrice(product.price, product.currency)}
              </span>
            </div>

            {sellerName ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Store className="size-4" />
                <span>
                  Sold by{" "}
                  <span className="font-medium text-foreground">{sellerName}</span>
                </span>
              </div>
            ) : null}

            <Separator />

            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {product.description}
            </p>

            <div className="mt-2 flex gap-2">
              <Button onClick={() => onBuyNow(product)} className="w-full">
                <ShoppingBag className="size-4" />
                Buy Now
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
