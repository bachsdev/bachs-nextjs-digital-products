// Buyers don't sign in. Each order has a secret token; the browser keeps
// "orderId.token" pairs in a cookie so the store page can list its orders.
// A real store would also email the buyer a link to their order page.
import { cookies } from "next/headers";

const COOKIE = "orders";

export async function buyerOrders(): Promise<{ id: string; token: string }[]> {
  const raw = (await cookies()).get(COOKIE)?.value ?? "";
  return raw.split(",").map((pair) => pair.split(".")).filter(([id, token]) => id && token)
    .map(([id, token]) => ({ id, token }));
}

export async function rememberOrder(id: string, token: string) {
  const existing = (await buyerOrders()).filter((o) => o.id !== id).slice(-9);
  (await cookies()).set(COOKIE, [...existing, { id, token }].map((o) => `${o.id}.${o.token}`).join(","), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
