# Shop with Stripe

A chat-based shopping agent that uses **GPT-5** (served by Stripe's internal
**LiteLLM proxy**) to help users find and purchase products through **Stripe's
Agentic Commerce (Delegated Checkout)** API.

Built with the Next.js App Router, the Vercel AI SDK (streaming chat), Stripe
Elements, and Tailwind CSS + shadcn/ui.

## How it works

1. The user chats with the assistant on the main page.
2. When GPT-5 identifies a product, it appends a `[PRODUCT_RESULT]{...}[/PRODUCT_RESULT]`
   JSON block to its message. The client parses this and renders an inline
   `ProductCard`.
3. Clicking **Buy Now** calls `/api/checkout/create`, which opens a Delegated
   Checkout `RequestedSession`, and the `CheckoutPanel` bottom sheet slides up.
4. The panel renders Stripe Elements (Address + Payment, with Link and card).
   On confirm it prepares a PaymentMethod and calls `/api/checkout/confirm`.

## Architecture notes (important)

1. **The agent (this app)** uses `STRIPE_SECRET_KEY` for the Delegated Checkout API.
2. **The seller** is a separate Stripe account, identified by `SELLER_PROFILE_ID`.
3. **Stripe Elements are initialized with the AGENT's publishable key**
   (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`). At confirm time Stripe mints a
   Shared Payment Token scoped to the seller, so no per-merchant publishable
   key is needed.
4. The `preparePaymentMethod` **beta flag is required** — Stripe.js is loaded with
   `betas: ['prepare_payment_method_beta_1']`.
5. **Webhooks must be registered in the Stripe Dashboard** for both the agent and
   seller accounts:
   - Agent → `/api/webhooks/agent` (OCA lifecycle events)
   - Seller → `/api/webhooks/seller` (`checkout.session.completed`)
6. The **API version must be the preview version the Delegated Checkout
   (Agentic Commerce) API is served under** — set
   `STRIPE_API_VERSION=2026-04-22.preview`. A different preview date makes the
   `requested_sessions` endpoints return "Unrecognized request URL".
7. **The chat LLM provider is env-driven** (`app/api/chat/route.ts`), in this
   precedence:
   1. `OPENAI_API_KEY` set → call the OpenAI API directly. Use this on hosts with
      public egress but no Vercel AI Gateway (e.g. Cloud Run / stripedemos).
   2. `LITELLM_BASE_URL` set → call Stripe's internal LiteLLM proxy
      (`litellm-srv`, OpenAI-API compatible). **Local corp-laptop development
      only** — see the note below.
   3. Neither set (**default**) → route a bare `openai/gpt-5.5` string model
      through the **Vercel AI Gateway**, which needs no key of ours. This is what
      the Vercel deployment uses, with zero configuration.

   `litellm.corp.stripe.com` requires a hardware-bound corp **device certificate
   plus an interactive YubiKey 2FA tap**, brokered by the local `certproxy` daemon
   on `127.0.0.1:7892`. It is therefore unreachable from **any** server (Vercel,
   Cloud Run, containers, CI); setting `LITELLM_BASE_URL` in a deployment breaks
   chat at the transport layer. `/api/debug/version` reports the active path as
   `llmProvider`.
8. For local testing, use the Stripe CLI:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/agent
   ```
9. **Merchant names are read from Stripe, not stored here.** A feed identifies its
   seller only by profile id, so ingestion resolves the "Sold by" name from that
   seller's Stripe business profile
   (`GET /v2/network/business_profiles/{profile_id}`) — whatever the merchant
   calls themselves in the Dashboard. `/api/debug/feed` reports the name resolved
   per seller, and `/api/debug/version` reports this agent's own profile via the
   `me` variant of the same endpoint.

## Environment variables

Copy `.env.local.example` to `.env.local` and fill in the values:

| Variable | Description |
| --- | --- |
| `STRIPE_SECRET_KEY` | Agent account secret key (Delegated Checkout API) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Agent account publishable key (used by Stripe Elements; the SPT is scoped to the seller at confirm time, so no per-seller key is needed) |
| `SELLER_PROFILE_IDS` | JSON map of catalog seller id → real Stripe profile id. **Demo shim only** — in production the real `stripe_profile_id` arrives in each SFTP feed manifest, so leave this empty. |
| `SELLER_PROFILE_ID` | Single-seller fallback profile id (used for feeds without a manifest). Leave empty in production. |
| `STRIPE_WEBHOOK_SECRET` | Agent webhook signing secret |
| `STRIPE_SELLER_WEBHOOK_SECRET` | Seller webhook signing secret (optional) |
| `STRIPE_API_VERSION` | Must be `2026-04-22.preview` |
| `SFTP_HOST` | SFTP endpoint Stripe delivers feeds to, as registered under agent onboarding. Any SFTP host works; the demo uses an AWS Transfer Family server. |
| `SFTP_PORT` | SFTP port (default `22`) |
| `SFTP_USERNAME` | Read-only reader user this app authenticates as on the SFTP host |
| `SFTP_PRIVATE_KEY` | Private key for the reader user (BEGIN/END included). Provide this **or** `SFTP_PASSWORD`. |
| `SFTP_PASSWORD` | Password for the reader user (alternative to `SFTP_PRIVATE_KEY`) |
| `SFTP_PASSPHRASE` | Passphrase for `SFTP_PRIVATE_KEY`, only if the key is encrypted (optional) |
| `SFTP_FEED_PATH` | Remote directory Stripe drops feeds into (default `/`, the SFTP root) |
| ~~`MOCK_CATALOG`~~ | **Removed and ignored.** The Stripe-delivered SFTP feed is the only catalog source; there is no bundled fallback. An unconfigured, empty, or unreachable feed shows an empty store. Delete this variable from any environment that still sets it. |
| `OPENAI_API_KEY` | Optional. Set it to call the OpenAI API directly — needed on non-Vercel hosts that have public egress but no Vercel AI Gateway (e.g. the Cloud Run / stripedemos deployment). Takes precedence over everything below. |
| `LITELLM_BASE_URL` | Optional, **local corp-laptop development only** (e.g. `https://litellm.corp.stripe.com/v1`). Requires a corp device certificate **and** an interactive YubiKey 2FA tap via the local `certproxy` daemon on `127.0.0.1:7892`, so it does **not** work from any server — never set it in a deployment. |
| `LITELLM_API_KEY` | Optional cost-attribution string for `LITELLM_BASE_URL`. Defaults to `use_case=development&team=aunz-sa`. Ignored unless `LITELLM_BASE_URL` is set. |
| _(neither set)_ | Default: chat streams `openai/gpt-5.5` through the **Vercel AI Gateway**, no credentials required. Leave both unset on Vercel. |
| `NEXT_PUBLIC_BASE_URL` | Public base URL of the deployment |

## API routes

| Route | Purpose |
| --- | --- |
| `POST /api/chat` | Streaming GPT-5 chat (Vercel AI SDK) |
| `POST /api/checkout/create` | Create a Delegated Checkout `RequestedSession` |
| `POST /api/checkout/update` | Update session (shipping address / quantity) |
| `POST /api/checkout/confirm` | Confirm with PaymentMethod + Radar session |
| `POST /api/webhooks/agent` | Stripe v2 OCA lifecycle events |
| `POST /api/webhooks/seller` | `checkout.session.completed` (fulfillment) |

## Develop

```bash
pnpm install
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Deploy

Deploy to Vercel and add all environment variables in the project settings. The
`vercel.json` configures function durations for the checkout and webhook routes.

### Sharing a protected deployment

The demo deployment has Vercel Deployment Protection on (both Vercel
Authentication and Password Protection), so every request without a Vercel
session gets a `401` — it works in the deploying account's browser and nowhere
else. Protection does not have to be turned off to share a link: use
**Protection Bypass for Automation**, which mints a cookie that any browser can
carry.

```
https://<deployment-host>/?x-vercel-protection-bypass=<SECRET>&x-vercel-set-bypass-cookie=true
```

Opening that once responds `307` and sets a `_vercel_jwt` cookie valid for 7
days, after which that browser loads the app (and its API routes) normally with
no query string. Notes:

- `<SECRET>` is the project's bypass secret, not stored in this repo. Read it
  from Vercel → Project Settings → Deployment Protection → Protection Bypass for
  Automation, or `GET /v9/projects/<project>?slug=<team>` and take the key of
  the `protectionBypass` object. Deployments also receive it as
  `VERCEL_AUTOMATION_BYPASS_SECRET`.
- The cookie is `SameSite=Lax`, which is enough for someone clicking or pasting
  the link. Use `x-vercel-set-bypass-cookie=samesitenone` only if the app has to
  load inside a third-party iframe.
- Treat the link as a credential — anyone with it reaches the protected
  deployment. Regenerate the secret in project settings once the demo is over.
- For scripted requests, `vercel curl <url>` handles protection automatically
  and needs no secret.
