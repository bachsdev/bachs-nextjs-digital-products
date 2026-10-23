import { webhooks, BachsApiError, BachsWebhookError, type WebhookEvent } from "@bachs/sdk";
import { getCheckoutSession } from "@/lib/bachs";
import { decide, eventCheckout, FULFILMENT_EVENTS } from "@/lib/fulfilment";
import { applyEvent, findOrder, isEventProcessed } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.BACHS_WEBHOOK_SECRET;
  if (!secret || secret === "whsec_...") {
    return new Response("Webhook secret is not configured", { status: 500 });
  }

  let event: WebhookEvent;
  try {
    // The SDK verifies the original bytes before decoding JSON.
    event = webhooks.constructEvent(new Uint8Array(await req.arrayBuffer()), req.headers, secret);
  } catch (err) {
    if (err instanceof BachsWebhookError) return new Response("Invalid webhook", { status: 400 });
    return new Response("Webhook verification failed", { status: 500 });
  }

  try {
    if (await isEventProcessed(event.id)) return new Response("OK");
    const ref = eventCheckout(event);
    const order = await findOrder(ref);

    if (FULFILMENT_EVENTS.has(event.type) && order && order.state !== "paid") {
      const checkoutId = ref.checkoutId ?? order.checkoutId;
      if (!checkoutId) throw new Error("Event names no checkout");
      // Trust what Bachs reports now, not the event alone.
      const checkout = await getCheckoutSession(checkoutId);
      const decision = decide(order, checkout);
      if (decision.action === "wait") {
        console.log("Bachs webhook", event.type, event.id, "retry later:", decision.reason);
        return new Response("Checkout not completed yet", { status: 503 }); // Bachs retries 5xx
      }
      const result = await applyEvent(event.id, order.id, decision.action === "paid"
        ? { kind: "paid", buyerEmail: decision.buyerEmail, amount: decision.amount, currency: decision.currency }
        : { kind: "review", reason: decision.reason });
      console.log("Bachs webhook", event.type, event.id, result);
      return new Response("OK");
    }

    const result = await applyEvent(event.id, order?.id,
      event.type === "checkout.expired" ? { kind: "expired" } : { kind: "none" });
    console.log("Bachs webhook", event.type, event.id, result);
    return new Response("OK");
  } catch (err) {
    // 5xx so Bachs retries. Never answer 4xx for our own failures.
    console.error("Bachs webhook processing failed", event.id,
      err instanceof BachsApiError ? { statusCode: err.statusCode, code: err.errorCode } : "");
    return new Response("Could not handle event", { status: 500 });
  }
}
