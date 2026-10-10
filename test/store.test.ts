import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;
let store: typeof import("@/lib/store");

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "bachs-digital-"));
  process.env.BACHS_DATA_DIR = dir;
  store = await import("@/lib/store");
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

const paid = { kind: "paid" as const, buyerEmail: "buyer@example.com", amount: "19.00", currency: "USD" };

describe("orders", () => {
  it("delivers once, whichever fulfilment event arrives first", async () => {
    const order = await store.createOrder("guide", "prod_guide");
    await store.attachCheckout(order.id, { checkout_id: "chk_a", checkout_url: "https://x", expires_at: "2099-01-01T00:00:00Z" });
    expect(await store.applyEvent("evt_completed", order.id, paid)).toBe("paid");
    expect(await store.applyEvent("evt_succeeded", order.id, paid)).toBe("duplicate");
    expect(await store.applyEvent("evt_completed", order.id, paid)).toBe("duplicate");
    expect((await store.getOrder(order.id))?.state).toBe("paid");
  });

  it("delivers once when both events are applied at the same time", async () => {
    const order = await store.createOrder("guide", "prod_guide");
    const results = await Promise.all([
      store.applyEvent("evt_c1", order.id, paid),
      store.applyEvent("evt_s1", order.id, paid),
    ]);
    expect(results.filter((r) => r === "paid")).toHaveLength(1);
  });

  it("treats an expired checkout as not final", async () => {
    const order = await store.createOrder("pack", "prod_pack");
    await store.attachCheckout(order.id, { checkout_id: "chk_b", checkout_url: "https://x", expires_at: "2099-01-01T00:00:00Z" });
    expect(await store.applyEvent("evt_expired", order.id, { kind: "expired" })).toBe("expired");
    expect(await store.applyEvent("evt_late", order.id, paid)).toBe("paid");
  });

  it("never moves a paid order backwards", async () => {
    const order = await store.createOrder("guide", "prod_guide");
    await store.applyEvent("evt_p", order.id, paid);
    expect(await store.applyEvent("evt_x", order.id, { kind: "expired" })).toBe("duplicate");
    await store.attachCheckout(order.id, { checkout_id: "chk_c", checkout_url: "https://x", expires_at: "2099-01-01T00:00:00Z" });
    expect((await store.getOrder(order.id))?.state).toBe("paid");
  });

  it("finds an order by reference or by checkout", async () => {
    const order = await store.createOrder("guide", "prod_guide");
    await store.attachCheckout(order.id, { checkout_id: "chk_find", checkout_url: "https://x", expires_at: "2099-01-01T00:00:00Z" });
    expect((await store.findOrder({ orderId: order.id }))?.id).toBe(order.id);
    expect((await store.findOrder({ checkoutId: "chk_find" }))?.id).toBe(order.id);
    expect(await store.findOrder({ checkoutId: "chk_unknown" })).toBeUndefined();
  });

  it("keeps an uncertain order, and discards one Bachs refused", async () => {
    const kept = await store.createOrder("guide", "prod_guide");
    await store.markOrderUncertain(kept.id);
    expect((await store.getOrder(kept.id))?.state).toBe("uncertain");
    const refused = await store.createOrder("guide", "prod_guide");
    await store.discardOrder(refused.id);
    expect(await store.getOrder(refused.id)).toBeUndefined();
  });
});
