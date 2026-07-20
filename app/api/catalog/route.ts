import { NextResponse } from "next/server"
import { loadCatalog } from "@/lib/product-feed"

export const maxDuration = 30
export const runtime = "nodejs"

export async function GET(req: Request) {
  const forceRefresh = new URL(req.url).searchParams.get("refresh") === "1"
  const { products, configured, error } = await loadCatalog(forceRefresh)

  return NextResponse.json({
    configured,
    error,
    count: products.length,
    products,
  })
}
