# LivGPT

A chat-based shopping agent that uses **OpenAI GPT-5** to help users find and
purchase products through **Stripe's Agentic Commerce (Delegated Checkout)** API.

Built with the Next.js App Router, the Vercel AI SDK (streaming chat), Stripe
Elements, and Tailwind CSS + shadcn/ui.

## How it works

1. The user chats with the assistant on the main page.
2. When GPT-5 identifies a product, it appends a `[PRODUCT_RESULT]{...}[/PRODUCT_RESULT]`
   JSON block to its message. The client parses this and renders an inline
   `ProductCard`.
3. Clicking **Buy Now** calls `/api/checkout/create`, which opens a Delegated
   Checkout `RequestedSession`, and the `CheckoutPanel` bottom sheet slides up.
4. The panel renders Stripe Elements (Express Checkout + Address + Payment).
   On confirm it prepares a PaymentMethod and calls `/api/checkout/confirm`.

## Architecture notes (important)

1. **The agent (this app)** uses `STRIPE_SECRET_KEY` for the Delegated Checkout API.
2. **The seller** is a separate Stripe account, identified by `SELLER_PROFILE_ID`.
3. **Stripe Elements are initialized with the SELLER's publishable key**
   (`NEXT_PUBLIC_SELLER_PUBLISHABLE_KEY`), **not** the agent's key.
4. The `preparePaymentMethod` **beta flag is required** — Stripe.js is loaded with
   `betas: ['prepare_payment_method_beta_1']`.
5. **Webhooks must be registered in the Stripe Dashboard** for both the agent and
   seller accounts:
   - Agent → `/api/webhooks/agent` (OCA lifecycle events)
   - Seller → `/api/webhooks/seller` (`checkout.session.completed`)
6. The **API version must be a preview version** — set
   `STRIPE_API_VERSION=2025-12-15.preview`.
7. For local testing, use the Stripe CLI:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/agent
   ```

## Environment variables

Copy `.env.local.example` to `.env.local` and fill in the values:

| Variable | Description |
| --- | --- |
| `STRIPE_SECRET_KEY` | Agent account secret key (Delegated Checkout API) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Agent account publishable key |
| `NEXT_PUBLIC_SELLER_PUBLISHABLE_KEY` | Seller account publishable key (used by Elements) |
| `SELLER_PROFILE_ID` | The seller profile the agent transacts against |
| `STRIPE_WEBHOOK_SECRET` | Agent webhook signing secret |
| `STRIPE_SELLER_WEBHOOK_SECRET` | Seller webhook signing secret (optional) |
| `STRIPE_API_VERSION` | Must be `2025-12-15.preview` |
| `OPENAI_API_KEY` | OpenAI API key for GPT-5 |
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
