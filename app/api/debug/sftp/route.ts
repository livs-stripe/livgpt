import SftpClient from "ssh2-sftp-client"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

// TEMPORARY diagnostic: connects to the configured SFTP endpoint using the
// credentials already stored in Vercel and reports what's actually there.
// Returns NO secrets — only presence booleans, directory entry names, and
// counts, plus any connection error message. Remove after debugging.

function normalizePrivateKey(raw: string): string {
  let key = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw
  key = key.trim()
  return key
}

// Shape of the manifest.json Stripe writes beside each seller's catalog. Only
// the fields this diagnostic reports back are described here.
type ManifestSummary = {
  path: string
  profileId: string | null
  merchant: string | null
  batchTimestamp: string | null
  feedType: string | null
  totalShards: number | null
  fileCount: number | null
  readable: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null
}

function summarizeManifest(
  path: string,
  body: unknown,
  merchantNames: Map<string, string>,
): ManifestSummary {
  const obj = asRecord(body)
  const profileId = str(obj?.stripe_profile_id)
  const files = Array.isArray(obj?.files) ? obj.files : null
  return {
    path,
    profileId,
    merchant: profileId ? (merchantNames.get(profileId) ?? null) : null,
    batchTimestamp: str(obj?.batch_timestamp),
    feedType: str(obj?.feed_type),
    totalShards: typeof obj?.total_shards === "number" ? obj.total_shards : null,
    fileCount: files ? files.length : null,
    // A walk entry that failed to download or parse is stored as a string, so a
    // non-object body means we found the file but could not read it.
    readable: obj !== null,
  }
}

function parseSellerProfileIds(): Record<string, string> | null {
  const raw = process.env.SELLER_PROFILE_IDS
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : null
  } catch {
    return null
  }
}

export async function GET() {
  const host = process.env.SFTP_HOST ?? ""
  const port = Number(process.env.SFTP_PORT ?? "22")
  const username = process.env.SFTP_USERNAME ?? ""
  const password = process.env.SFTP_PASSWORD
  const privateKeyRaw = process.env.SFTP_PRIVATE_KEY
  const passphrase = process.env.SFTP_PASSPHRASE || undefined
  const feedPath = process.env.SFTP_FEED_PATH ?? "/"

  const presence = {
    hasHost: Boolean(host),
    host: host || null,
    port,
    username: username || null,
    authMethod: privateKeyRaw ? "privateKey" : password ? "password" : "none",
    hasPassphrase: Boolean(passphrase),
    feedPath,
    mockCatalog: process.env.MOCK_CATALOG ?? "on (default)",
  }

  if (!host || !username || (!password && !privateKeyRaw)) {
    return NextResponse.json({
      ...presence,
      connected: false,
      feedArrived: false,
      manifestCount: 0,
      summary:
        "SFTP is not configured in this environment, so no feed can have arrived here.",
      error:
        "SFTP is not fully configured in this environment (need host, username, and a password or private key).",
    })
  }

  const sftp = new SftpClient()
  try {
    await sftp.connect({
      host,
      port,
      username,
      ...(privateKeyRaw ? { privateKey: normalizePrivateKey(privateKeyRaw) } : {}),
      ...(privateKeyRaw && passphrase ? { passphrase } : {}),
      ...(password ? { password } : {}),
      readyTimeout: 20000,
      algorithms: {
        serverHostKey: [
          "ssh-ed25519",
          "ecdsa-sha2-nistp256",
          "ecdsa-sha2-nistp384",
          "ecdsa-sha2-nistp521",
          "rsa-sha2-512",
          "rsa-sha2-256",
        ],
      },
    })

    const rootList = await sftp.list(feedPath)
    const rootEntries = rootList.map((e) => ({ name: e.name, type: e.type }))

    // Deep recursive listing (bounded) so we can see catalog/ contents and any
    // manifest.json bodies, to diagnose shard path/name mismatches.
    const tree: Record<string, { name: string; type: string; size?: number }[]> = {}
    const manifestBodies: Record<string, unknown> = {}
    // Every manifest path the deep walk saw, readable or not. This is the single
    // source of truth for manifestCount: manifests live three levels below the
    // feed path (/root/<profile_id>/catalog/manifest.json), so any shallower
    // scan misses them and would report 0 while feeds are in fact present.
    const manifestPaths: string[] = []
    // Stripe drops a merchant_metadata.json beside each seller's catalog/. It is
    // the feed's own description of the merchant, so it is the natural source of
    // a display name for the "Sold by" line.
    const metadataBodies: Record<string, unknown> = {}
    async function walk(dir: string, depth: number): Promise<void> {
      if (depth > 5) return
      let list: Awaited<ReturnType<typeof sftp.list>>
      try {
        list = await sftp.list(dir)
      } catch (e) {
        tree[dir] = [{ name: `<unreadable: ${e instanceof Error ? e.message : String(e)}>`, type: "?" }]
        return
      }
      tree[dir] = list.map((e) => ({ name: e.name, type: e.type, size: e.size }))
      for (const e of list) {
        const full = dir.replace(/\/$/, "") + "/" + e.name
        if (e.type === "d") {
          await walk(full, depth + 1)
        } else if (/manifest.*\.json$|merchant_metadata\.json$/i.test(e.name)) {
          const isMetadata = /merchant_metadata\.json$/i.test(e.name)
          const into = isMetadata ? metadataBodies : manifestBodies
          if (!isMetadata) manifestPaths.push(full)
          try {
            const buf = await sftp.get(full)
            const text = Buffer.isBuffer(buf)
              ? buf.toString("utf8")
              : typeof buf === "string"
                ? buf
                : Buffer.from(buf as unknown as Uint8Array).toString("utf8")
            into[full] = JSON.parse(text)
          } catch (e) {
            into[full] = `<unreadable: ${e instanceof Error ? e.message : String(e)}>`
          }
        }
      }
    }
    await walk(feedPath, 0)

    // Read the contents of stripe-verification.txt (if present) so we can
    // confirm it matches the challenge token shown in the Stripe dashboard.
    // This token is NOT a secret (Stripe displays it in the UI), so returning
    // it from this diagnostic endpoint is safe.
    let verificationToken: string | null = null
    const verifyEntry = rootList.find((e) => e.name === "stripe-verification.txt")
    if (verifyEntry) {
      try {
        const base = feedPath.replace(/\/$/, "")
        const verifyPath = `${base}/stripe-verification.txt`
        const data = await sftp.get(verifyPath)
        const buf = Buffer.isBuffer(data)
          ? data
          : typeof data === "string"
            ? Buffer.from(data)
            : Buffer.from(data as unknown as Uint8Array)
        verificationToken = buf.toString("utf8").trim()
      } catch (e) {
        verificationToken = `<unreadable: ${e instanceof Error ? e.message : String(e)}>`
      }
    }

    // Walk one level into subdirectories as a flat, easy-to-read index of the
    // tree above. Deliberately does NOT count manifests — it cannot see three
    // levels down, which is exactly how this diagnostic used to report 0
    // manifests while the feed had arrived.
    const children: Record<string, string[]> = {}
    for (const entry of rootList) {
      if (entry.type === "d") {
        const sub = feedPath.replace(/\/$/, "") + "/" + entry.name
        try {
          const subList = await sftp.list(sub)
          children[entry.name] = subList.map((s) => s.name)
          for (const s of subList) {
            if (s.type === "d") {
              try {
                const deep = await sftp.list(sub + "/" + s.name)
                children[`${entry.name}/${s.name}`] = deep.map((d) => d.name)
              } catch {
                /* ignore depth errors */
              }
            }
          }
        } catch {
          children[entry.name] = ["<unreadable>"]
        }
      }
    }

    await sftp.end().catch(() => {})

    const merchantNames = new Map<string, string>()
    for (const body of Object.values(metadataBodies)) {
      const obj = asRecord(body)
      const id = str(obj?.stripe_profile_id)
      const name = str(obj?.display_name)
      if (id && name) merchantNames.set(id, name)
    }

    const manifests = manifestPaths
      .map((path) => summarizeManifest(path, manifestBodies[path], merchantNames))
      .sort((a, b) => (b.batchTimestamp ?? "").localeCompare(a.batchTimestamp ?? ""))
    const manifestCount = manifests.length
    const readable = manifests.filter((m) => m.readable)
    const latestBatchTimestamp = readable
      .map((m) => m.batchTimestamp)
      .filter((t): t is string => Boolean(t))
      .sort()
      .pop() ?? null
    const feedArrived = readable.length > 0

    return NextResponse.json({
      ...presence,
      connected: true,
      // The answer to "has a feed arrived?" — first, and derived from the same
      // deep walk as `tree` / `manifestBodies` so it cannot contradict them.
      feedArrived,
      manifestCount,
      latestBatchTimestamp,
      summary: feedArrived
        ? `Feed present: ${manifestCount} manifest(s) under ${feedPath}, latest batch ${latestBatchTimestamp ?? "unknown"}.`
        : manifestCount > 0
          ? `Connected, found ${manifestCount} manifest(s) but none could be read — see manifests[].`
          : `Connected to ${host} but no manifest.json found anywhere under ${feedPath} — no feed has been delivered yet.`,
      manifests,
      rootEntryCount: rootEntries.length,
      rootEntries,
      verificationToken,
      children,
      tree,
      manifestBodies,
      metadataBodies,
      // Catalog seller id -> real Stripe profile id. Neither side is a secret
      // (the ids are in the repo and in the tree above); surfaced so a delivered
      // profile id can be attributed to the merchant it was configured for.
      sellerProfileIds: parseSellerProfileIds(),
    })
  } catch (err) {
    await sftp.end().catch(() => {})
    return NextResponse.json({
      ...presence,
      connected: false,
      feedArrived: false,
      manifestCount: 0,
      summary: "Could not connect to the SFTP endpoint, so feed arrival is unknown.",
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
