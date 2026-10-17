# Bachs Next.js digital products starter

A Next.js App Router store that sells digital products with [Bachs](https://bachs.io): fixed-price and pay-what-you-want products, guest checkout, and downloads released only after Bachs confirms the payment.

It is the working code for the [Sell digital products use case](https://docs.bachs.io/build/use-cases/digital-products). Read that page for the full explanation.

**This is a local development starter.** Orders live in one local JSON file, and buyers find their orders through a browser cookie. Replace the store, and email buyers their order link, before deploying. The checkout route refuses live API keys until you do.

## SDK dependency

This starter uses the official Bachs SDK, `@bachs/sdk`, for checkout and webhook verification. `npm ci` installs it from npm, pinned to version 1.0.0 in `package.json` and `package-lock.json`.

## Run in sandbox

You need Node.js 22 or later, a [sandbox API key](https://docs.bachs.io/authentication) with `products:write` and `payments:write`, and the [Bachs CLI](https://docs.bachs.io/cli/overview#install).

```bash
npm ci
cp .env.example .env
# Set BACHS_API_KEY in .env, then:
npm run setup:products
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`. Copy the two product IDs the script prints into `.env`.

In a second terminal:

```bash
npm run listen
```

Copy the `whsec_` secret it prints into `BACHS_WEBHOOK_SECRET` in `.env`, then start the store:

```bash
npm run dev
```

Open http://localhost:3000, click **Buy**, and pay on the sandbox checkout with any test card number (for example `4242 4242 4242 4242`). Return to http://localhost:3000: your order shows as **Paid** and offers the download. Bachs refuses `localhost` as a checkout return address, so for local testing you return to the store yourself.

Each new `listen` session has a new signing secret. Update `.env` and restart the store when you restart the listener.

## How it works

| File | Responsibility |
| --- | --- |
| `lib/catalog.ts` | The products, their prices and their files. The browser sends only a product key. |
| `app/api/checkout/route.ts` | Saves the order and its Idempotency-Key, then creates a guest checkout with the order ID as its `reference`. |
| `app/api/webhooks/bachs/route.ts` | Verifies the webhook with the SDK, reads the checkout back from Bachs, and applies the decision. |
| `lib/fulfilment.ts` | `decide()`: delivers only a `completed` checkout whose reference, currency and amount match the order. |
| `lib/store.ts` | Saves order changes and processed event IDs together, in one atomic write. |
| `app/orders/[orderId]/page.tsx` | The order page. It reads the saved order and never marks anything paid. |
| `app/api/downloads/[orderId]/route.ts` | Serves the file for a paid order to whoever holds its secret token. |

### Why it reads the checkout back

The store fulfils on either `checkout.completed` or `collection.succeeded`, whichever arrives first, and delivers each order once. Before delivering, it retrieves the checkout from Bachs. If Bachs does not report it as `completed` yet, the route answers `503` so Bachs retries the event later. If the amount or currency does not match the order, the order is held for review instead of delivered.

A payment can arrive after `checkout.expired`. The store treats an expired checkout as not final, so a late payment still completes the order.

## Verification

```bash
npm run verify
```

This runs unit tests for the payment decision and the order store, a type check, a production build, and HTTP smoke checks against the built app with a local Bachs API fixture. The smoke checks use dummy keys and make no real payment. Run the sandbox steps above to test a real checkout.

## Make it yours

- **Products:** edit `lib/catalog.ts`, put your files in `private/`, and create matching products in Bachs. Prices in the catalog must match Bachs; they are checked before delivery.
- **Store:** replace `lib/store.ts` with a transactional database. Keep the order update and the processed event ID in one transaction.
- **Buyer access:** email each buyer the link to their order page after payment. The webhook has the buyer's email on the checkout's `customer_details`.
- **Return address:** on a public deployment, set `CHECKOUT_SUCCESS_URL` so buyers return to your store automatically.
- **Overlay:** to keep buyers on your page, open the `checkout_url` with the [Bachs overlay](https://docs.bachs.io/guides/checkout/overlay-checkout).

## Go live

Follow the [go-live checklist](https://docs.bachs.io/build/use-cases/digital-products#go-live-checklist): create the products in production, set `BACHS_ENVIRONMENT=production` with an `sk_live_` key, and register a production webhook endpoint for `checkout.completed`, `collection.succeeded` and `checkout.expired`. Its signing secret differs from the local one.

## Building with an AI assistant

`AGENTS.md` explains the project and its checks; `CLAUDE.md` points to it. To extend the store with a coding assistant, use the [Bachs prompts](https://docs.bachs.io/build/ai/prompts) or install the [Bachs skill](https://github.com/bachsdev/bachs-skills).

## License

MIT. See [LICENSE](LICENSE).
