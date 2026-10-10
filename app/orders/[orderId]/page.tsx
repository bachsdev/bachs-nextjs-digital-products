import Link from "next/link";
import { catalogItem } from "@/lib/catalog";
import { formatAmount } from "@/lib/money";
import { getOrder } from "@/lib/store";

export const dynamic = "force-dynamic";

// The order page. It only reads the order the webhook saved; visiting it never
// marks anything paid. Point CHECKOUT_SUCCESS_URL here once the app is public.
export default async function OrderPage({
  params, searchParams,
}: { params: Promise<{ orderId: string }>; searchParams: Promise<{ token?: string }> }) {
  const { orderId } = await params;
  const { token } = await searchParams;
  const order = await getOrder(orderId);
  if (!order || !token || token !== order.token) {
    return <section><h1>Order not found</h1><Link href="/">Back to the store</Link></section>;
  }
  const item = catalogItem(order.productKey);

  if (order.state === "paid") {
    return (
      <section>
        <h1>Thanks for your order</h1>
        <p>{item?.name}: paid {formatAmount(order.paidAmount!, order.paidCurrency!)}{order.buyerEmail ? `, ${order.buyerEmail}` : ""}.</p>
        <p><a href={`/api/downloads/${order.id}?token=${order.token}`}>Download {item?.file}</a></p>
        <Link href="/">Back to the store</Link>
      </section>
    );
  }

  if (order.state === "review") {
    return (
      <section>
        <h1>We are checking your payment</h1>
        <p>Your payment did not match this order, so the download is on hold. We will contact you.</p>
        <Link href="/">Back to the store</Link>
      </section>
    );
  }

  return (
    <section>
      {/* Refresh until the webhook has arrived. */}
      <meta httpEquiv="refresh" content="3" />
      <h1>{order.state === "expired" ? "Checkout expired" : "Waiting for your payment"}</h1>
      <p>
        {order.state === "expired"
          ? "If you paid, your download appears here as soon as the payment is confirmed."
          : "This page updates when your payment is confirmed, usually within seconds."}
      </p>
      {order.checkoutUrl && order.state === "open" && <p><a href={order.checkoutUrl}>Return to checkout</a></p>}
      <Link href="/">Back to the store</Link>
    </section>
  );
}
