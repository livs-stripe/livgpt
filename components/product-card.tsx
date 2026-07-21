"use client"

import { Check, Plus, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/parse-product"
import type { ProductResult } from "@/lib/types"

type ProductCardProps = {
  product: ProductResult
  /** Quantity of this product currently in the cart (0 if none). */
  inCartQty?: number
  onAddToCart: (product: ProductResult) => void
  onBuyNow: (product: ProductResult) => void
}

export function ProductCard({
  product,
  inCartQty = 0,
  onAddToCart,
  onBuyNow,
}: ProductCardProps) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.imageUrl || "/placeholder.svg"}
          alt={product.name}
          className="h-full w-full object-cover"
          crossOrigin="anonymous"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold leading-tight text-pretty">{product.name}</h3>
          <span className="shrink-0 text-lg font-bold text-emerald-500">
            {formatPrice(product.price, product.currency)}
          </span>
        </div>
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {product.description}
        </p>
        <div className="mt-auto flex gap-2 pt-1">
          <Button
            onClick={() => onAddToCart(product)}
            variant="outline"
            className="flex-1"
          >
            {inCartQty > 0 ? (
              <>
                <Check className="size-4" />
                In cart ({inCartQty})
              </>
            ) : (
              <>
                <Plus className="size-4" />
                Add
              </>
            )}
          </Button>
          <Button onClick={() => onBuyNow(product)} className="flex-1">
            <ShoppingBag className="size-4" />
            Buy Now
          </Button>
        </div>
      </div>
    </div>
  )
}
