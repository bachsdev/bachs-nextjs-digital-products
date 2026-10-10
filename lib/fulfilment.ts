import type { WebhookEvent } from "@bachs/sdk";
import { catalogItem } from "./catalog";
import { toMinor } from "./money";

// The order states this app stores. "creating" and "uncertain" belong to the
// checkout route; webhooks move an order to "paid", "review" or "expired".
export type OrderState = "creating" | "uncertain" | "open" | "paid" | "review" | "expired";

export type Order = {
  id: string;
  token: string; // secret the buyer holds; opens the order page and download
  productKey: string;
  productId: string;
  checkoutKey: string; // Idempotency-Key for creating the checkout
  state: OrderState;
  checkoutId?: string;
  checkoutUrl?: string;
  expiresAt?: string;
  buyerEmail?: string;
  paidAmount?: string;
  paidCurrency?: string;
  paidAt?: string;
  reviewReason?: string;
  createdAt: string;
};

// What the app reads back from Bachs before it delivers anything.
export type CheckoutSnapshot = {
  status: string;
  amount?: string;
  currency?: string;
  reference?: string | null;
  customer_details?: { email?: string | null } | null;
};

export const FULFILMENT_EVENTS = new Set(["checkout.completed", "collection.succeeded"]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The checkout an event is about, and the order it names. Both events carry
// checkout_id; reference and metadata.order_id are the order ID this app set.
export function eventCheckout(event: WebhookEvent) {
  const data = event.data;
  const metadata = record(data.metadata) ? data.metadata : {};
  const checkoutId = typeof data.checkout_id === "string" ? data.checkout_id : undefined;
  const orderId = typeof data.reference === "string" ? data.reference
    : typeof metadata.order_id === "string" ? metadata.order_id : undefined;
  return { checkoutId, orderId };
}

export type Decision =
  | { action: "paid"; buyerEmail?: string; amount: string; currency: string }
  | { action: "review"; reason: string }
  | { action: "wait"; reason: string };

/**
 * Decides whether an order can be delivered, from the checkout as Bachs
 * reports it now. A webhook only says something happened; this read is what
 * the app trusts. "wait" means not completed yet: answer 5xx so Bachs retries.
 * "review" means the payment does not match the order, so do not deliver.
 */
export function decide(order: Order, checkout: CheckoutSnapshot): Decision {
  if (checkout.status !== "completed") {
    return { action: "wait", reason: `checkout is ${checkout.status}` };
  }
  const item = catalogItem(order.productKey);
  if (!item) return { action: "review", reason: "unknown product" };
  if (checkout.reference && checkout.reference !== order.id) {
    return { action: "review", reason: "checkout reference does not match the order" };
  }
  const paid = typeof checkout.amount === "string" ? toMinor(checkout.amount) : undefined;
  if (checkout.currency !== item.currency || paid === undefined) {
    return { action: "review", reason: "payment currency or amount is missing or different" };
  }
  const enough = item.pricing === "fixed" ? paid === toMinor(item.amount) : paid >= toMinor(item.minimum)!;
  if (!enough) return { action: "review", reason: `paid ${checkout.amount} ${checkout.currency}` };
  return {
    action: "paid",
    buyerEmail: checkout.customer_details?.email ?? undefined,
    amount: checkout.amount!,
    currency: checkout.currency,
  };
}
