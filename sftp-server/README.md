# livgpt-sftp — Stripe Agentic Commerce product-feed delivery destination

This is the **agent-side SFTP endpoint that Stripe connects to and writes seller
catalogs into**. You uploaded your merchants' CSVs on the Stripe (seller) side;
Stripe now syndicates those catalogs here, and the agent app
(`lib/product-feed.ts`, an SFTP client) reads them.

It is built on **[SFTPGo](https://github.com/drakkan/sftpgo)** and deploys to
Fly.io.

## Why SFTPGo (and not atmoz/sftp)

Stripe creates directories **at the SFTP root** (`/[profile_id]/...`) and writes
`/stripe-verification.txt` there too — so the SFTP root must be **writable** by
the Stripe user. The default `atmoz/sftp` (OpenSSH) chroot requires the chroot
directory to be **root-owned and non-writable**, which directly conflicts with
that. SFTPGo instead roots each user at a normal, fully-writable home directory
(no chroot-ownership rule), and additionally gives us:

- native **Ed25519 public-key auth**, with password auth easily disabled;
- **idempotent, env-driven user provisioning** (`loaddata` on boot) so Stripe's
  public key and the app credential are injected at deploy time, never baked in;
- clean use of a **persistent volume** for delivered files + stable host keys.

## What Stripe delivers (and where it lands)

Stripe writes this tree into the SFTP root; `manifest.json` is uploaded **last**
as the completion signal, and shards are gzip'd `.csv.gz`:

```
/stripe-verification.txt                                  (you: challenge token)
/[stripe_profile_id]/merchant_metadata.json               (Stripe)
/[stripe_profile_id]/catalog/full_catalog_part_N_of_M.csv.gz
/[stripe_profile_id]/catalog/manifest.json
/[stripe_profile_id]/updates/...
```

The SFTP root maps to `/srv/sftpgo/data` on the persistent volume.

## Users / auth model

Two users share the same storage root (`/srv/sftpgo/data`):

| User | Default name | Auth | Permissions | Used by |
| --- | --- | --- | --- | --- |
| Stripe writer | `stripe` | Ed25519 **public key only** (password + keyboard-interactive denied) | full (`*`) — must create dirs/files at root | Stripe delivery |
| App reader | `app` | its **own key or password** | read-only (`list`, `download`) | `lib/product-feed.ts` |

Everything is provisioned at boot by `entrypoint.sh` from environment variables
(injected as Fly secrets) — **nothing is hardcoded in the image**:

| Secret / env | Purpose |
| --- | --- |
| `STRIPE_SFTP_PUBLIC_KEY` | Stripe's generated public key → Stripe user's authorized key |
| `STRIPE_VERIFICATION_TOKEN` | Stripe's challenge token → written to `/stripe-verification.txt` |
| `APP_SFTP_PASSWORD` *or* `APP_SFTP_PUBLIC_KEY` | credential for the read-only app user |
| `STRIPE_SFTP_USERNAME` | optional, default `stripe` |
| `APP_SFTP_USERNAME` | optional, default `app` |
| `DEMO_MODE` | optional, `true` seeds the bundled demo catalog (see below) |

Boot import uses `loaddata` mode `0` (add + update), so **key rotation** (Stripe
rotates every 365 days) is just: update the secret and redeploy.

---

## Onboarding runbook (do these in order)

You will bounce between your terminal and the Stripe Dashboard. The order
matters: Stripe can only generate its key pair **after** you give it a reachable
host, and it only starts delivering **after** you install its key + token.

### Step 1 — Deploy the server to Fly

```bash
cd sftp-server

fly launch --no-deploy                 # create the app (keep name livgpt-sftp, or edit fly.toml)
fly volumes create sftp_data \         # persistent storage for delivered feeds
  --region iad --size 3
fly deploy                             # build + start SFTPGo
fly ips allocate-v4                    # DEDICATED IPv4 — required for raw TCP:22
fly ips list                           # note the IPv4; this is your SFTP host
```

> Fly's shared IPv4 only routes HTTP/TLS. Raw **TCP:22 needs a dedicated IPv4**,
> so `fly ips allocate-v4` is not optional.

At this point the server is up but has **no users yet** (no secrets set) — that
is expected. Stripe just needs to be able to reach the host on port 22.

### Step 2 — Start onboarding in Stripe & copy Stripe's public key

In the **Stripe Dashboard → Agentic commerce → agent onboarding → "Configure
product feed acceptance"**, enter:

- **Host**: the Fly IPv4 from `fly ips list`
- **Port**: `22`
- **Username**: your chosen Stripe username (default `stripe`)

Stripe then **generates a key pair and shows you its PUBLIC key**, plus a
one-time **challenge/verification token**. Copy both. (Stripe keeps the private
key and connects as the SFTP client.)

### Step 3 — Install Stripe's key + token as Fly secrets, and set the app credential

```bash
# Generate a key for the app reader (recommended over a password):
ssh-keygen -t ed25519 -f app_key -N ""     # -> app_key (private) + app_key.pub

fly secrets set \
  STRIPE_SFTP_PUBLIC_KEY="ssh-ed25519 AAAA... (paste Stripe's public key)" \
  STRIPE_VERIFICATION_TOKEN="(paste Stripe's challenge token)" \
  APP_SFTP_PUBLIC_KEY="$(cat app_key.pub)"
# Setting secrets triggers a redeploy; the entrypoint provisions both users and
# writes /stripe-verification.txt on boot.
```

> Prefer a key for the app user. If you must use a password instead, set
> `APP_SFTP_PASSWORD="<strong-password>"` and skip `APP_SFTP_PUBLIC_KEY`.

### Step 4 — Complete verification & wait for delivery

Back in Stripe, **complete verification** — Stripe reads
`/stripe-verification.txt` and confirms it matches. Then wait for delivery to
begin. Delivery only starts once a **seller has the agent enabled** (e.g. toggle
on a **Test Seller**). When a `manifest.json` appears under
`/[profile_id]/catalog/`, that seller's feed is complete.

### Step 5 — Point the agent app at the server

Set these in the app's Vercel env (Production), then redeploy:

```
SFTP_HOST=<the Fly IPv4 from step 1>
SFTP_PORT=22
SFTP_USERNAME=app                       # matches APP_SFTP_USERNAME
SFTP_PRIVATE_KEY=<contents of app_key>  # the PRIVATE key (or use SFTP_PASSWORD)
SFTP_FEED_PATH=/
```

- Use `SFTP_PASSWORD=<the password>` instead of `SFTP_PRIVATE_KEY` if you chose
  password auth for the app user.
- `SFTP_FEED_PATH=/` (the root) works because the app scans **recursively** for
  `manifest.json`; it picks up each `/[profile_id]/catalog/manifest.json` and
  stamps `sellerId` with the real `stripe_profile_id` from the manifest.
- **Delete `SELLER_PROFILE_IDS`** from the app env — profile ids now come from
  the delivered manifests.

Verify end-to-end by hitting the app's **`/api/catalog`** endpoint; you should
see products attributed to each delivered seller.

---

## You must supply

- **Stripe's public key** and **challenge token** (from Stripe onboarding, step 2).
- Your chosen **Stripe username** (or accept the default `stripe`).
- A **strong app read credential** — an Ed25519 key (recommended) or password.
- A **dedicated Fly IPv4** (step 1).

## Local test tip

You can exercise everything except Fly locally with Docker:

```bash
cd sftp-server
docker build -t livgpt-sftp .

# Generate a throwaway app key for the test:
ssh-keygen -t ed25519 -f /tmp/app_key -N ""

docker run --rm -p 2222:22 \
  -e STRIPE_SFTP_PUBLIC_KEY="$(cat /tmp/app_key.pub)" \
  -e STRIPE_VERIFICATION_TOKEN="local-test-token" \
  -e APP_SFTP_PUBLIC_KEY="$(cat /tmp/app_key.pub)" \
  -e DEMO_MODE=true \
  livgpt-sftp

# In another shell — read as the app user (DEMO_MODE seeds sample feeds):
sftp -P 2222 -i /tmp/app_key app@localhost
#   sftp> ls
#   sftp> get stripe-verification.txt
```

`DEMO_MODE=true` seeds the bundled static catalog (below) into an empty volume so
there is something to read before real Stripe feeds arrive. It is **off by
default** and never overwrites Stripe-delivered files.

## Demo catalog (optional, not in the delivery path)

`catalog/` is a static, multi-merchant sample feed generated from
`mock-catalog/<slug>/products.csv`. It is copied into the image at
`/opt/demo-catalog/` and only enters the SFTP tree when `DEMO_MODE=true`. Real
delivery starts from an empty, Stripe-populated volume and ignores it entirely.

Regenerate it (slug → profile-id map lives in the script):

```bash
cd sftp-server
python3 build_catalog.py
```

## Files

```
sftp-server/
  Dockerfile        SFTPGo image + jq/su-exec + demo catalog staged aside
  entrypoint.sh     boot provisioning: token file, loaddata users, demo seed, drop privs
  fly.toml          app config: TCP:22 service, persistent volume, SFTPGo env
  build_catalog.py  regenerates the optional demo catalog
  catalog/          the optional demo catalog (demo mode only)
  README.md         this file
```
