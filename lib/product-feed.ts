import "server-only"
import { gunzipSync } from "node:zlib"
import { parse as parseCsv } from "csv-parse/sync"
import SftpClient from "ssh2-sftp-client"
import type { CatalogProduct } from "./types"
import { loadMockCatalog, mockCatalogEnabled } from "./mock-catalog"

type ConnectOptions = Parameters<SftpClient["connect"]>[0]

/**
 * Reads the product catalog from the Stripe Agentic Commerce product feeds that
 * Stripe delivers to your SFTP host (AWS Transfer Family, whose home directory
 * is an S3 bucket).
 *
 * Flow:
 *   Seller publishes catalog -> Stripe -> delivers feed files to your SFTP host.
 *   This module connects to that host as an SFTP client, downloads the manifest
 *   JSON + Gzip-compressed CSV shards, and parses the Google Merchant style rows
 *   into purchasable products. Every product returned maps to a real line item
 *   bought through Delegated Checkout against your seller.
 *
 * NOTE: SFTP uses port 22. The v0 preview sandbox blocks raw outbound port 22,
 * so the catalog will be empty in the in-editor preview. It works once deployed
 * to a normal Vercel environment (or any host that allows outbound SSH).
 *
 * Feed shape (per Stripe spec):
 *   - A manifest JSON: { stripe_profile_id, batch_timestamp, feed_type,
 *       total_shards, files: [{ name: "..._part_1_of_2.csv.gz" }, ...] }
 *   - One or more UTF-8, Gzip-compressed CSV shards referenced by the manifest.
 *   - CSV columns: id, title, description, link, image_link, brand, price,
 *       availability, image_additional_link, item_group_id, ...
 */

type Manifest = {
  stripe_profile_id?: string
  batch_timestamp?: string
  feed_type?: string
  total_shards?: number
  files?: { name: string }[]
}

type FeedConfig = {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  remotePath: string
}

/** Raised when SFTP config is present but invalid (surfaced to the UI). */
class FeedConfigError extends Error {}

/**
 * Normalizes a pasted private key and catches the most common mistakes so we
 * can return a clear, actionable error instead of "Unsupported key format".
 * Also rebuilds PEM line wrapping if the env form stripped the newlines.
 */
function normalizePrivateKey(raw: string): string {
  let key = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw
  key = key.trim()

  if (/^(ssh-(rsa|ed25519|dss)|ecdsa-sha2-)/.test(key)) {
    throw new FeedConfigError(
      "SFTP_PRIVATE_KEY looks like a PUBLIC key (it starts with 'ssh-...'). " +
        "That public key belongs in your server's authorized_keys. Set " +
        "SFTP_PRIVATE_KEY to the matching PRIVATE key (the '-----BEGIN OPENSSH PRIVATE KEY-----' file).",
    )
  }
  if (/PuTTY-User-Key-File/i.test(key)) {
    throw new FeedConfigError(
      "SFTP_PRIVATE_KEY is in PuTTY .ppk format, which isn't supported. " +
        "Convert it to OpenSSH/PEM format (PuTTYgen -> Conversions -> Export OpenSSH key).",
    )
  }

  const pem = key.match(/-----BEGIN ([A-Z0-9 ]+?)-----([\s\S]*?)-----END \1-----/)
  if (!pem) {
    throw new FeedConfigError(
      "SFTP_PRIVATE_KEY is not a recognizable private key. It should include a " +
        "'-----BEGIN ... PRIVATE KEY-----' header and footer.",
    )
  }

  // If newlines were stripped (single-line env value), rebuild proper PEM
  // formatting by re-wrapping the base64 body at 64 characters per line.
  const label = pem[1].trim()
  const body = pem[2].replace(/\s+/g, "")
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body
  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----\n`
}

function readConfig(): FeedConfig | null {
  const host = process.env.SFTP_HOST
  const username = process.env.SFTP_USERNAME
  const password = process.env.SFTP_PASSWORD
  const rawKey = process.env.SFTP_PRIVATE_KEY?.trim()
  const privateKey = rawKey ? normalizePrivateKey(rawKey) : undefined

  if (!host || !username || (!password && !privateKey)) return null

  return {
    host,
    port: Number(process.env.SFTP_PORT ?? "22"),
    username,
    password,
    privateKey,
    remotePath: process.env.SFTP_FEED_PATH ?? "/",
  }
}

/** SSH algorithms compatible with AWS Transfer Family security policies. */
const SSH_ALGORITHMS: NonNullable<ConnectOptions["algorithms"]> = {
  serverHostKey: [
    "ssh-ed25519",
    "ecdsa-sha2-nistp256",
    "ecdsa-sha2-nistp384",
    "ecdsa-sha2-nistp521",
    "rsa-sha2-512",
    "rsa-sha2-256",
  ],
}

/** Parses a Google Merchant style price like "29.99 USD" into cents + currency. */
function parsePrice(raw: string): { amount: number; currency: string } | null {
  if (!raw) return null
  const match = raw.trim().match(/([\d.,]+)\s*([A-Za-z]{3})?/)
  if (!match) return null
  const value = Number.parseFloat(match[1].replace(/,/g, ""))
  if (Number.isNaN(value)) return null
  return {
    amount: Math.round(value * 100),
    currency: (match[2] ?? "usd").toLowerCase(),
  }
}

function rowToProduct(
  row: Record<string, string>,
  sellerProfileId: string,
): CatalogProduct | null {
  const id = row.id ?? row.offer_id ?? row.sku
  const name = row.title ?? row.name
  const priceRaw = row.price ?? row.sale_price ?? ""
  const price = parsePrice(priceRaw)
  if (!id || !name || !price) return null

  return {
    id,
    name,
    price: price.amount,
    currency: price.currency,
    imageUrl: row.image_link ?? row.image ?? "",
    description: row.description ?? "",
    category: row.product_type ?? row.google_product_category ?? "general",
    sellerId: sellerProfileId,
    available:
      !row.availability ||
      /in[_\s]?stock/i.test(row.availability) ||
      row.availability.toLowerCase() === "available",
  }
}

type RemoteFile = { path: string; modified: number }

/** Recursively lists files under a remote directory (bounded depth). */
async function listFiles(
  sftp: SftpClient,
  dir: string,
  depth = 0,
): Promise<RemoteFile[]> {
  if (depth > 3) return []
  let entries: Awaited<ReturnType<SftpClient["list"]>>
  try {
    entries = await sftp.list(dir)
  } catch {
    return []
  }
  const files: RemoteFile[] = []
  for (const entry of entries) {
    const full = dir.endsWith("/") ? `${dir}${entry.name}` : `${dir}/${entry.name}`
    if (entry.type === "d") {
      files.push(...(await listFiles(sftp, full, depth + 1)))
    } else if (entry.type === "-") {
      files.push({ path: full, modified: entry.modifyTime ?? 0 })
    }
  }
  return files
}

async function getBuffer(sftp: SftpClient, path: string): Promise<Buffer> {
  const data = await sftp.get(path)
  if (Buffer.isBuffer(data)) return data
  if (typeof data === "string") return Buffer.from(data)
  return Buffer.from(data as unknown as Uint8Array)
}

/** Downloads + parses CSV shards, stamping each product with the given seller. */
async function ingestShards(
  sftp: SftpClient,
  shardPaths: string[],
  sellerProfileId: string,
  products: CatalogProduct[],
  seen: Set<string>,
): Promise<void> {
  for (const path of shardPaths) {
    const raw = await getBuffer(sftp, path)
    const csvText = path.endsWith(".gz")
      ? gunzipSync(raw).toString("utf8")
      : raw.toString("utf8")

    const rows = parseCsv(csvText, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    }) as Record<string, string>[]

    for (const row of rows) {
      const product = rowToProduct(row, sellerProfileId)
      // Dedupe per seller so two merchants can reuse the same feed id.
      const key = `${product?.sellerId ?? ""}:${product?.id ?? ""}`
      if (product && !seen.has(key)) {
        seen.add(key)
        products.push(product)
      }
    }
  }
}

async function downloadFeed(config: FeedConfig): Promise<CatalogProduct[]> {
  const sftp = new SftpClient()
  // Used only when a feed has no manifest (raw CSVs) to attribute a seller.
  const fallbackSellerId = process.env.SELLER_PROFILE_ID ?? ""

  try {
    await sftp.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      privateKey: config.privateKey,
      readyTimeout: 25000,
      algorithms: SSH_ALGORITHMS,
    })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    const msg = err instanceof Error ? err.message : String(err)
    await sftp.end().catch(() => {})
    if (code === "ECONNRESET" || /reset/i.test(msg)) {
      throw new Error(
        "SFTP connection was reset during the SSH handshake. In the v0 preview this is expected " +
          "(outbound port 22 is blocked); deploy to Vercel to use SFTP. Otherwise verify the AWS " +
          "Transfer Family user, attached public key, and that the endpoint is publicly reachable.",
      )
    }
    if (code === "ETIMEDOUT" || /timed? ?out/i.test(msg)) {
      throw new Error(
        `Timed out connecting to SFTP host ${config.host}:${config.port}. The v0 preview blocks outbound port 22; deploy to Vercel, or check the host/port/firewall.`,
      )
    }
    if (/All configured authentication methods failed/i.test(msg)) {
      throw new Error(
        "SFTP authentication failed. Check that SFTP_USERNAME matches your Transfer Family user and that the public key for SFTP_PRIVATE_KEY is attached to that user.",
      )
    }
    throw new Error(`SFTP connection failed: ${msg}`)
  }

  try {
    const files = await listFiles(sftp, config.remotePath)

    // Each seller's feed arrives as its own manifest carrying that seller's
    // stripe_profile_id. Process every manifest (newest batch per seller wins)
    // so products from all connected merchants are ingested and correctly
    // attributed. Fall back to raw .csv(.gz) files if no manifests exist.
    const manifestFiles = files
      .filter((f) => /manifest.*\.json$|\.manifest\.json$/i.test(f.path))
      .sort((a, b) => b.modified - a.modified)

    const products: CatalogProduct[] = []
    const seen = new Set<string>()
    const processedSellers = new Set<string>()
    let usedManifest = false

    for (const manifestFile of manifestFiles) {
      let manifest: Manifest
      try {
        const manifestBuf = await getBuffer(sftp, manifestFile.path)
        manifest = JSON.parse(manifestBuf.toString("utf8")) as Manifest
      } catch {
        continue
      }

      const sellerId = manifest.stripe_profile_id || fallbackSellerId
      // Skip older batches for a seller we've already loaded (newest wins).
      if (sellerId && processedSellers.has(sellerId)) continue

      const dir = manifestFile.path.replace(/\/[^/]+$/, "")
      const shardPaths = (manifest.files ?? []).map((f) =>
        f.name.includes("/") ? f.name : `${dir}/${f.name}`,
      )
      if (shardPaths.length === 0) continue

      await ingestShards(sftp, shardPaths, sellerId, products, seen)
      if (sellerId) processedSellers.add(sellerId)
      usedManifest = true
    }

    if (!usedManifest) {
      const shardPaths = files
        .filter((f) => /\.csv\.gz$|\.csv$/i.test(f.path))
        .sort((a, b) => b.modified - a.modified)
        .map((f) => f.path)
      await ingestShards(sftp, shardPaths, fallbackSellerId, products, seen)
    }

    return products
  } finally {
    await sftp.end().catch(() => {})
  }
}

// Simple per-instance cache so we don't reconnect on every request.
let cache: { products: CatalogProduct[]; at: number } | null = null
const TTL_MS = 5 * 60 * 1000

export type CatalogState = {
  products: CatalogProduct[]
  configured: boolean
  error: string | null
}

export async function loadCatalog(forceRefresh = false): Promise<CatalogState> {
  let config: FeedConfig | null
  try {
    config = readConfig()
  } catch (err) {
    return {
      products: [],
      configured: true,
      error: err instanceof Error ? err.message : "Invalid product feed configuration.",
    }
  }

  // No SFTP feed configured. Serve the bundled multi-merchant demo catalog so
  // the deployed app works out of the box; real feeds take over once SFTP is set.
  if (!config) {
    if (mockCatalogEnabled()) {
      return { products: loadMockCatalog(), configured: true, error: null }
    }
    return {
      products: [],
      configured: false,
      error:
        "Product feed SFTP is not configured. Set SFTP_HOST, SFTP_USERNAME, and SFTP_PASSWORD or SFTP_PRIVATE_KEY.",
    }
  }

  if (!forceRefresh && cache && Date.now() - cache.at < TTL_MS) {
    return { products: cache.products, configured: true, error: null }
  }

  try {
    const products = await downloadFeed(config)
    // An SFTP feed that returns nothing (e.g. still syncing) falls back to the
    // demo catalog rather than showing an empty store.
    if (products.length === 0 && mockCatalogEnabled()) {
      return { products: loadMockCatalog(), configured: true, error: null }
    }
    cache = { products, at: Date.now() }
    return { products, configured: true, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read product feed."
    // Serve stale cache on transient errors if we have one.
    if (cache) {
      return { products: cache.products, configured: true, error: message }
    }
    // Otherwise fall back to the bundled demo catalog so the app stays usable.
    if (mockCatalogEnabled()) {
      return { products: loadMockCatalog(), configured: true, error: null }
    }
    return { products: [], configured: true, error: message }
  }
}

export async function getProductById(id: string): Promise<CatalogProduct | undefined> {
  const { products } = await loadCatalog()
  return products.find((p) => p.id === id)
}

/** A compact, model-friendly representation of the catalog for the system prompt. */
export function catalogForPrompt(products: CatalogProduct[]): string {
  if (products.length === 0) {
    return "(No products are currently available from the connected seller's feed.)"
  }
  return products
    .map(
      (p) =>
        `- id=${p.id} | name=${p.name} | price=${p.price} ${p.currency} | category=${p.category ?? "general"} | available=${p.available !== false} | imageUrl=${p.imageUrl} | sellerId=${p.sellerId ?? ""} | description=${p.description}`,
    )
    .join("\n")
}
