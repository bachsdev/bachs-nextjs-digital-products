import { BachsApiError, BachsConfigError } from "@bachs/sdk";
import { createCheckoutSession } from "@/lib/bachs";
import { rememberOrder } from "@/lib/buyer";
import { productIdFor } from "@/lib/catalog";
import { attachCheckout, createOrder, discardOrder, markOrderUncertain } from "@/lib/store";

export const runtime = "nodejs";

// POST { product: "guide" | "pack" } -> { checkout_url, order_id }
export async function POST(req: Request) {
  if (process.env.BACHS_API_KEY?.startsWith("sk_live_")) {
    // The local JSON store is for development only.
    return Response.json({ error: "Replace the local store before using live keys." }, { status: 500 });
  }
  const input = await req.json().catch(() => null);
  const key = input && typeof input === "object" && !Array.isArray(input) ? input.product : undefined;
  const productId = typeof key === "string" ? productIdFor(key) : undefined;
  if (!productId) return Response.json({ error: "Unknown product" }, { status: 400 });

  // Save the order and its Idempotency-Key before calling Bachs.
  const order = await createOrder(key, productId);
  try {
    const checkout = await createCheckoutSession({
      productId,
      orderId: order.id,
      idempotencyKey: order.checkoutKey,
      successUrl: process.env.CHECKOUT_SUCCESS_URL || undefined,
      cancelUrl: process.env.CHECKOUT_CANCEL_URL || undefined,
    });
    await attachCheckout(order.id, checkout);
    await rememberOrder(order.id, order.token);
    return Response.json({ checkout_url: checkout.checkout_url, order_id: order.id });
  } catch (err) {
    if ((err instanceof BachsApiError && !err.outcomeUnknown) || err instanceof BachsConfigError) {
      await discardOrder(order.id);
      console.error("Bachs refused the checkout", err instanceof BachsApiError ? { statusCode: err.statusCode, code: err.errorCode } : "configuration");
      return Response.json({ error: "Could not start checkout" }, { status: 502 });
    }
    // The checkout may exist. Keep the order: if the buyer paid, its webhook
    // still names this order (the checkout reference) and fulfils it.
    await markOrderUncertain(order.id).catch(() => undefined);
    await rememberOrder(order.id, order.token).catch(() => undefined);
    console.error("Bachs checkout outcome uncertain", order.id);
    return Response.json({ error: "Could not confirm checkout. Check your order before trying again.", order_id: order.id }, { status: 502 });
  }
}
