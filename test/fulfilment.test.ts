import { describe, expect, it } from "vitest";
import { decide, eventCheckout, type Order } from "@/lib/fulfilment";
import { toMinor } from "@/lib/money";

const order = (productKey: string): Order => ({
  id: "ord_1", token: "t", productKey, productId: "prod_x", checkoutKey: "k",
  state: "open", checkoutId: "chk_1", createdAt: "2026-10-10T00:00:00Z",
});
const completed = (amount: string, extra = {}) => ({
  status: "completed", amount, currency: "USD", reference: "ord_1",
  customer_details: { email: "buyer@example.com" }, ...extra,
});

describe("toMinor", () => {
  it.each([["19.00", 1900n], ["19", 1900n], ["5.5", 550n], ["0.01", 1n]])("%s", (input, expected) => {
    expect(toMinor(input)).toBe(expected);
  });
  it("rejects anything that is not a decimal amount", () => {
    for (const bad of ["", "-1.00", "1.001", "1e3", "abc", "19.00 USD"]) expect(toMinor(bad)).toBeUndefined();
  });
});

describe("decide", () => {
  it("pays a fixed-price order for the exact amount", () => {
    expect(decide(order("guide"), completed("19.00"))).toEqual({
      action: "paid", buyerEmail: "buyer@example.com", amount: "19.00", currency: "USD",
    });
  });

  it("holds a fixed-price order paid at a different amount", () => {
    expect(decide(order("guide"), completed("9.00")).action).toBe("review");
    expect(decide(order("guide"), completed("29.00")).action).toBe("review");
  });

  it("pays a pay-what-you-want order at or above the minimum", () => {
    expect(decide(order("pack"), completed("5.00")).action).toBe("paid");
    expect(decide(order("pack"), completed("42.50")).action).toBe("paid");
  });

  it("holds a pay-what-you-want order below the minimum", () => {
    expect(decide(order("pack"), completed("4.99")).action).toBe("review");
  });

  it("waits while the checkout is not completed, so Bachs retries", () => {
    for (const status of ["open", "expired", "cancelled"]) {
      expect(decide(order("guide"), completed("19.00", { status })).action).toBe("wait");
    }
  });

  it("holds a payment in another currency or for another order", () => {
    expect(decide(order("guide"), completed("19.00", { currency: "NGN" })).action).toBe("review");
    expect(decide(order("guide"), completed("19.00", { reference: "ord_other" })).action).toBe("review");
    expect(decide(order("guide"), completed("19.00", { amount: undefined })).action).toBe("review");
  });
});

describe("eventCheckout", () => {
  const event = (data: Record<string, unknown>) => ({
    id: "evt_1", type: "checkout.completed", created_at: "2026-10-10T00:00:00Z", organization_id: "acct_1", data,
  });

  it("reads the checkout and the order from the reference", () => {
    expect(eventCheckout(event({ checkout_id: "chk_1", reference: "ord_1" }))).toEqual({ checkoutId: "chk_1", orderId: "ord_1" });
  });

  it("falls back to metadata.order_id", () => {
    expect(eventCheckout(event({ checkout_id: "chk_1", reference: null, metadata: { order_id: "ord_2" } })).orderId).toBe("ord_2");
  });
});
