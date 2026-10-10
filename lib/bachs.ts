import { Bachs, BachsConfigError } from "@bachs/sdk";

// App-specific mapping only. HTTP, validation and retries belong to the SDK.
export function getBachs() {
  const environment = process.env.BACHS_ENVIRONMENT || "sandbox";
  if (environment !== "sandbox" && environment !== "production") {
    throw new BachsConfigError("Set BACHS_ENVIRONMENT to sandbox or production.");
  }
  return new Bachs({
    apiKey: process.env.BACHS_API_KEY || "",
    environment,
    baseURL: process.env.BACHS_API_URL || undefined,
  });
}

// A guest checkout: Bachs collects the buyer's email on the checkout page.
// The order ID is the checkout reference, so each order maps to one checkout.
export function createCheckoutSession(input: {
  productId: string;
  orderId: string;
  idempotencyKey: string;
  successUrl?: string;
  cancelUrl?: string;
}) {
  return getBachs().checkoutSessions.create({
    product_cart: [{ product_id: input.productId, quantity: 1 }],
    reference: input.orderId,
    metadata: { order_id: input.orderId },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  }, { idempotencyKey: input.idempotencyKey });
}

export function getCheckoutSession(checkoutId: string) {
  return getBachs().checkoutSessions.get(checkoutId);
}
