import { readFile } from "node:fs/promises";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { catalogItem } from "@/lib/catalog";
import { getOrder } from "@/lib/store";

export const runtime = "nodejs";

function sameToken(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// GET /api/downloads/<orderId>?token=<order token>
// Serves the file only for a paid order, to whoever holds its token.
export async function GET(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const order = await getOrder(orderId);
  if (!order || !sameToken(token, order.token)) return new Response("Not found", { status: 404 });
  if (order.state !== "paid") return new Response("This order is not paid yet.", { status: 402 });

  const item = catalogItem(order.productKey);
  if (!item) return new Response("Not found", { status: 404 });
  const file = await readFile(path.join(process.cwd(), "private", item.file));
  return new Response(file, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${item.file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
