import Link from "next/link";
import { buyerOrders } from "@/lib/buyer";
import { CATALOG, type ProductKey } from "@/lib/catalog";
import { formatAmount } from "@/lib/money";
import { getOrder } from "@/lib/store";
import { BuyButton } from "./buy-button";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  creating: "Starting checkout",
  uncertain: "Checking payment",
  open: "Waiting for payment",
  paid: "Paid",
  review: "Needs review",
  expired: "Checkout expired",
};

export default async function Store() {
  const mine = (await Promise.all((await buyerOrders()).map(async ({ id, token }) => {
    const order = await getOrder(id);
    return order && order.token === token ? order : undefined;
  }))).filter((o) => o !== undefined).reverse();

  return (
    <section>
      <h1>Acme Downloads</h1>
      <div className="plans">
        {(Object.keys(CATALOG) as ProductKey[]).map((key) => {
          const item = CATALOG[key];
          return (
            <div className="plan" key={key}>
              <h2>{item.name}</h2>
              <p className="price">
                {item.pricing === "fixed" ? formatAmount(item.amount, item.currency) : `From ${formatAmount(item.minimum, item.currency)}`}
              </p>
              <p className="badge">{item.description}</p>
              <BuyButton product={key} label={item.pricing === "fixed" ? "Buy" : "Name your price"} />
            </div>
          );
        })}
      </div>

      {mine.length > 0 && (
        <>
          <h2>Your orders</h2>
          <ul className="orders">
            {mine.map((order) => (
              <li key={order.id}>
                <Link href={`/orders/${order.id}?token=${order.token}`}>{CATALOG[order.productKey as ProductKey]?.name ?? order.productKey}</Link>
                {" "}<span className="badge">{STATUS[order.state] ?? order.state}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
