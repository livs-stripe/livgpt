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

    // Walk one level into subdirectories to surface manifests / catalog files.
    const children: Record<string, string[]> = {}
    let manifestCount = 0
    for (const entry of rootList) {
      if (entry.type === "d") {
        const sub = feedPath.replace(/\/$/, "") + "/" + entry.name
        try {
          const subList = await sftp.list(sub)
          children[entry.name] = subList.map((s) => s.name)
          for (const s of subList) {
            if (/manifest.*\.json$/i.test(s.name)) manifestCount++
            if (s.type === "d") {
              try {
                const deep = await sftp.list(sub + "/" + s.name)
                children[`${entry.name}/${s.name}`] = deep.map((d) => d.name)
                for (const d of deep) if (/manifest.*\.json$/i.test(d.name)) manifestCount++
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

    return NextResponse.json({
      ...presence,
      connected: true,
      rootEntryCount: rootEntries.length,
      rootEntries,
      children,
      manifestCount,
    })
  } catch (err) {
    await sftp.end().catch(() => {})
    return NextResponse.json({
      ...presence,
      connected: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
