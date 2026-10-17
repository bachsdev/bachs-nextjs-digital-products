# AGENTS.md

A Next.js (App Router) store that sells digital products with Bachs one-time
checkout. The flow it implements is documented at
https://docs.bachs.io/build/use-cases/digital-products.

## Commands

- `npm test`: unit tests (Vitest). Run after every change to `lib/`.
- `npm run typecheck` and `npm run build`: must pass before you finish.
- `npm run test:smoke`: HTTP checks of the built app against fixture API responses.
- `npm run verify`: all of the above.
- `npm run listen`: forwards sandbox webhooks to the local webhook route.
- `npm run setup:products`: creates the two products in the sandbox.

## Where things are

- `lib/catalog.ts`: products, prices and files. Prices must match Bachs.
- `app/api/checkout/route.ts`: creates the order, then the guest checkout.
- `app/api/webhooks/bachs/route.ts`: verifies webhooks and applies decisions.
- `lib/fulfilment.ts`: `decide()`, the only place that decides delivery.
- `lib/store.ts`: the data layer. Other code only uses its exported functions.
- `lib/bachs.ts`: a thin adapter over @bachs/sdk.

## Bachs integration rules

- Use @bachs/sdk for checkout sessions and webhooks.constructEvent for
  signature verification. @bachs/sdk installs from npm at an exact version;
  when upgrading it, update package.json and package-lock.json together and
  run npm run verify.
- Docs: read the Bachs page for the task. Every page is available as Markdown
  by adding .md to its URL, and https://docs.bachs.io/llms.txt lists every
  page. Do not invent endpoints, fields, events or error codes.
- Keep secret keys on the server. Never put one in a NEXT_PUBLIC_ variable.
- Money is a decimal string ("19.00") with a currency. Compare amounts as
  minor units (lib/money.ts), never as floating-point numbers.
- The browser sends a product key only. Never accept a price or product ID
  from the client.
- Deliver only from verified webhooks, after reading the checkout back from
  Bachs and matching its reference, currency and amount to the order. The
  order page and success redirect never mark an order paid.
- Delivery is at least once and not ordered. Keep the processed-event check,
  and keep order changes and event IDs in one atomic write.
- Return 5xx when handling fails or the checkout is not completed yet, so
  Bachs retries. Return 400 only for an invalid signature.
- A checkout reference is unique for good, including expired checkouts. The
  order ID is the reference, so each order has exactly one checkout.
- A payment can arrive after checkout.expired. Do not treat expiry as final.
