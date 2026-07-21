# livgpt-sftp — demo SFTP product-feed source

A self-contained SFTP server that serves a **static demo product catalog** for
the livgpt Agentic Commerce demo. It is an easy stand-in for real Stripe SFTP
feed delivery (AWS Transfer Family, etc.): the app's SFTP client
(`lib/product-feed.ts`) connects to it and ingests the feeds exactly as it would
in production.

Each merchant directory ships a `manifest.json` carrying the **real Stripe
sandbox profile id**. Because `product-feed.ts` stamps every product's
`sellerId` with `manifest.stripe_profile_id`, profile ids now flow straight from
the feed — so the hardcoded `SELLER_PROFILE_IDS` env map is no longer needed and
can be deleted.

Built from the open-source [`atmoz/sftp`](https://hub.docker.com/r/atmoz/sftp)
image. The catalog is baked into the image, so no persistent volume is required
for this read-only demo.

## Layout served over SFTP

```
/feeds/
  harbor-and-home/    manifest.json + products.csv
  lumen-beauty/       manifest.json + products.csv
  northwind-apparel/  manifest.json + products.csv
  summit-outdoors/    manifest.json + products.csv
```

Each `manifest.json`:

```json
{
  "stripe_profile_id": "profile_test_...",
  "feed_type": "products",
  "total_shards": 1,
  "files": [{ "name": "products.csv" }]
}
```

## Regenerating the catalog

`catalog/` is generated (not hand-edited) from `mock-catalog/<slug>/products.csv`:

```
cd sftp-server
python3 build_catalog.py
```

The slug → profile-id map lives inside `build_catalog.py`. The script is
idempotent — it rewrites `catalog/` from scratch each run.

## Why Fly.io and not Vercel

SFTP needs a raw, always-on **TCP:22** daemon with a stable listener. Vercel's
Docker support runs **HTTP-only autoscaling Functions on port 80**, scales to
zero (SIGTERM), and gives you only an ephemeral disk — none of which works for a
long-lived SSH/SFTP server. Fly.io exposes raw TCP, so it's the right fit.

## Deploy

```
cd sftp-server
# 1. set a real password in the Dockerfile CMD first
#    (replace REPLACE_WITH_STRONG_PASSWORD)
fly launch --no-deploy      # create the app (accept name livgpt-sftp or adjust fly.toml)
fly deploy
fly ips allocate-v4         # dedicated IPv4 so TCP:22 is reachable
fly ips list                # note the IPv4
```

> **You must** (a) replace `REPLACE_WITH_STRONG_PASSWORD` in the Dockerfile
> `CMD` with a real password before deploying, and (b) allocate a **dedicated
> IPv4** — Fly's shared IPv4 only routes HTTP, so raw TCP:22 needs its own IPv4.

## Wire the app to it

Set these env vars in Vercel (Production), then redeploy:

```
SFTP_HOST=<the allocated Fly IPv4 (or app host)>
SFTP_PORT=22
SFTP_USERNAME=stripefeeds
SFTP_PASSWORD=<the password you set in the Dockerfile CMD>
SFTP_FEED_PATH=/feeds
```

Then **delete** the `SELLER_PROFILE_IDS` env var: with real profile ids flowing
from the manifests, `product.sellerId` becomes the real Stripe profile id
automatically.

## Local test

```
docker build -t livgpt-sftp .
docker run -p 2222:22 livgpt-sftp
sftp -P 2222 stripefeeds@localhost   # password = whatever you set in the CMD
```
