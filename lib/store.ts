// Local development only: one process, one JSON file. Use a transactional
// database before deploying this starter. Other code only uses the functions
// exported here, so you can replace this file without touching the routes.
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import type { Order } from "./fulfilment";

type Data = {
  orders: Record<string, Order>;
  processedEvents: string[];
};

const FILE = path.join(process.env.BACHS_DATA_DIR || path.join(process.cwd(), ".data"), "store.json");
const empty = (): Data => ({ orders: {}, processedEvents: [] });

async function read(): Promise<Data> {
  let raw: string;
  try { raw = await readFile(FILE, "utf8"); }
  catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return empty();
    throw err; // Do not turn an unreadable store into an empty order book.
  }
  const data = JSON.parse(raw);
  if (!data || typeof data !== "object" || !data.orders || !Array.isArray(data.processedEvents)) {
    throw new Error("Invalid local order store");
  }
  return { ...empty(), ...data };
}

// Writes run one at a time and replace the file atomically, so an order
// update and its webhook event ID are saved together or not at all.
let queue: Promise<unknown> = Promise.resolve();
function update<T>(change: (data: Data) => T | Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    const data = await read();
    const result = await change(data);
    await mkdir(path.dirname(FILE), { recursive: true });
    const temporary = `${FILE}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(data, null, 2));
      await rename(temporary, FILE);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    return result;
  });
  queue = next.catch(() => undefined);
  return next;
}

export async function getOrder(orderId: string) {
  return (await read()).orders[orderId];
}

export async function findOrder(ref: { checkoutId?: string; orderId?: string }) {
  const { orders } = await read();
  if (ref.orderId && orders[ref.orderId]) return orders[ref.orderId];
  return Object.values(orders).find((o) => ref.checkoutId && o.checkoutId === ref.checkoutId);
}

export async function isEventProcessed(eventId: string) {
  return (await read()).processedEvents.includes(eventId);
}

// Checkout route: reserve the order and its Idempotency-Key before calling Bachs.
export function createOrder(productKey: string, productId: string) {
  return update((data) => {
    const order: Order = {
      id: `ord_${randomUUID().replace(/-/g, "")}`,
      token: randomBytes(24).toString("base64url"),
      productKey,
      productId,
      checkoutKey: randomUUID(),
      state: "creating",
      createdAt: new Date().toISOString(),
    };
    data.orders[order.id] = order;
    return order;
  });
}

export function attachCheckout(orderId: string, checkout: { checkout_id: string; checkout_url: string; expires_at: string }) {
  return update((data) => {
    const order = data.orders[orderId];
    if (!order) throw new Error("Order not found");
    // A webhook may already have marked it paid; never move it backwards.
    if (order.state === "creating" || order.state === "uncertain") order.state = "open";
    order.checkoutId = checkout.checkout_id;
    order.checkoutUrl = checkout.checkout_url;
    order.expiresAt = checkout.expires_at;
  });
}

// Bachs refused the request for certain: nothing was created.
export function discardOrder(orderId: string) {
  return update((data) => {
    if (data.orders[orderId]?.state === "creating") delete data.orders[orderId];
  });
}

// The request may or may not have created a checkout. Keep the order and its
// key; a webhook naming this order still fulfils it.
export function markOrderUncertain(orderId: string) {
  return update((data) => {
    if (data.orders[orderId]?.state === "creating") data.orders[orderId].state = "uncertain";
  });
}

type Outcome = "duplicate" | "paid" | "review" | "expired" | "ignored";

// Applies a webhook's effect on one order and records the event ID in the
// same write. Re-checks the order inside the write, so concurrent deliveries
// of the two fulfilment events deliver once.
export function applyEvent(
  eventId: string,
  orderId: string | undefined,
  effect: { kind: "paid"; buyerEmail?: string; amount: string; currency: string }
    | { kind: "review"; reason: string }
    | { kind: "expired" }
    | { kind: "none" },
): Promise<Outcome> {
  return update((data) => {
    if (data.processedEvents.includes(eventId)) return "duplicate";
    data.processedEvents = [...data.processedEvents, eventId].slice(-5000);
    const order = orderId ? data.orders[orderId] : undefined;
    if (!order || effect.kind === "none") return "ignored";
    if (order.state === "paid") return "duplicate";

    if (effect.kind === "paid") {
      order.state = "paid";
      order.buyerEmail = effect.buyerEmail;
      order.paidAmount = effect.amount;
      order.paidCurrency = effect.currency;
      order.paidAt = new Date().toISOString();
      delete order.reviewReason;
      return "paid";
    }
    if (effect.kind === "review") {
      order.state = "review";
      order.reviewReason = effect.reason;
      return "review";
    }
    // Expired is not final: a payment can still arrive and complete the order.
    if (order.state === "open" || order.state === "uncertain") order.state = "expired";
    return "expired";
  });
}
