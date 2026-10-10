// Runs the built Next.js app against a local Bachs API fixture.
// No real API key, external payment, or production deployment is used.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readdir, unlink, rmdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = path.join(root, ".test-data", "smoke-" + randomUUID());
await mkdir(dataDirectory, { recursive: true });

// The fixture's view of each checkout: what GET /v1/checkout-sessions/<id> returns.
const checkouts = new Map();
let created = 0;
let refuseCheckout = false;
let apiUrl;
const fixture = createServer(async (req, res) => {
  try {
    assert.equal(req.headers.authorization, "Bearer sk_sandbox_smoke");
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url === "/v1/checkout-sessions") {
      assert.ok(req.headers["idempotency-key"]);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      assert.match(body.reference, /^ord_/);
      assert.equal(body.metadata.order_id, body.reference);
      assert.equal(body.customer, undefined); // guest checkout
      assert.equal(body.amount, undefined);
      if (refuseCheckout) { res.writeHead(503); res.end("lost response"); return; }
      const id = "chk_smoke_" + ++created;
      checkouts.set(id, { checkout_id: id, status: "open", reference: body.reference, product_id: body.product_cart[0].product_id });
      res.end(JSON.stringify({
        checkout_id: id, checkout_url: apiUrl + "/checkout/" + id, status: "open", reference: body.reference,
        created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString(),
      }));
      return;
    }
    const match = /^\/v1\/checkout-sessions\/([\w]+)$/.exec(req.url);
    assert.ok(req.method === "GET" && match && checkouts.has(match[1]), "unexpected request " + req.method + " " + req.url);
    res.end(JSON.stringify(checkouts.get(match[1])));
  } catch (err) {
    console.error("Fixture assertion failed:", err.message);
    res.writeHead(500); res.end("fixture failure");
  }
});
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
apiUrl = "http://127.0.0.1:" + fixture.address().port;

const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const appPort = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const appUrl = "http://127.0.0.1:" + appPort;
const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", String(appPort)], {
  cwd: root, windowsHide: true,
  env: { ...process.env, BACHS_ENVIRONMENT: "sandbox", BACHS_API_URL: apiUrl, BACHS_API_KEY: "sk_sandbox_smoke",
    BACHS_WEBHOOK_SECRET: "whsec_smoke", BACHS_PRODUCT_GUIDE: "prod_guide", BACHS_PRODUCT_PACK: "prod_pack",
    BACHS_DATA_DIR: dataDirectory, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });
const exit = once(child, "exit");

let cookie = "";
async function buy(product) {
  const res = await fetch(appUrl + "/api/checkout", {
    method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify(product),
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return res;
}
async function deliver(id, type, checkoutId, reference, valid = true) {
  const body = JSON.stringify({
    id, type, organization_id: "acct_smoke", created_at: new Date().toISOString(),
    data: { checkout_id: checkoutId, reference, status: type === "checkout.completed" ? "completed" : "SUCCEEDED" },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", "whsec_smoke").update(timestamp + "." + body).digest("hex");
  return fetch(appUrl + "/api/webhooks/bachs", {
    method: "POST", body, headers: { "X-Bachs-Signature-V2": "t=" + timestamp + ",v1=" + (valid ? signature : "wrong") },
  });
}
const store = async () => (await fetch(appUrl, { headers: { cookie } })).text();
let step = 0;
const passed = (name) => { step++; console.log("PASS " + name); };

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(appUrl)).ok) { ready = true; break; } } catch {}
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(ready, "Next.js failed to start: " + output);

  assert.equal((await buy({ product: "__proto__" })).status, 400);
  const res = await buy({ product: "guide", amount: "0.01", product_id: "attacker" });
  assert.equal(res.status, 200);
  const { order_id: orderId, checkout_url: checkoutUrl } = await res.json();
  assert.match(checkoutUrl, /\/checkout\/chk_smoke_1$/);
  assert.equal(checkouts.get("chk_smoke_1").product_id, "prod_guide");
  const token = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1)).split(",").map((p) => p.split(".")).find(([id]) => id === orderId)[1];
  assert.match(await store(), /Waiting for payment/);
  passed("server product mapping; buyer sees the order as waiting");

  const orderPage = () => fetch(`${appUrl}/orders/${orderId}?token=${token}`).then((r) => r.text());
  const download = (t = token) => fetch(`${appUrl}/api/downloads/${orderId}?token=${t}`);
  assert.match(await orderPage(), /Waiting for your payment/);
  assert.equal((await download()).status, 402);
  passed("visiting the order page cannot mark it paid or release the download");

  assert.equal((await deliver("evt_bad", "checkout.completed", "chk_smoke_1", orderId, false)).status, 400);
  assert.equal((await download()).status, 402);
  passed("invalid webhook cannot release the download");

  assert.equal((await deliver("evt_early", "checkout.completed", "chk_smoke_1", orderId)).status, 503);
  assert.equal((await download()).status, 402);
  passed("an event for a checkout Bachs does not report as completed is retried, not trusted");

  checkouts.set("chk_smoke_1", { ...checkouts.get("chk_smoke_1"), status: "completed", amount: "19.00", currency: "USD",
    customer_details: { email: "buyer@example.com", name: "Buyer" } });
  assert.equal((await deliver("evt_early", "checkout.completed", "chk_smoke_1", orderId)).status, 200);
  assert.match(await orderPage(), /Thanks for your order/);
  const file = await download();
  assert.equal(file.status, 200);
  assert.match(await file.text(), /The Field Guide/);
  assert.equal((await download("wrong-token")).status, 404);
  passed("verified completed checkout releases the download to the token holder only");

  assert.equal((await deliver("evt_succeeded", "collection.succeeded", "chk_smoke_1", orderId)).status, 200);
  assert.equal((await deliver("evt_early", "checkout.completed", "chk_smoke_1", orderId)).status, 200);
  assert.match(await store(), /Paid/);
  passed("second fulfilment event and redelivery change nothing");

  const pack = await (await buy({ product: "pack" })).json();
  checkouts.set("chk_smoke_2", { ...checkouts.get("chk_smoke_2"), status: "completed", amount: "4.00", currency: "USD" });
  assert.equal((await deliver("evt_low", "checkout.completed", "chk_smoke_2", pack.order_id)).status, 200);
  assert.match(await store(), /Needs review/);
  passed("pay-what-you-want below the minimum is held for review");

  const late = await (await buy({ product: "guide" })).json();
  assert.equal((await deliver("evt_expired", "checkout.expired", "chk_smoke_3", late.order_id)).status, 200);
  assert.match(await store(), /Checkout expired/);
  checkouts.set("chk_smoke_3", { ...checkouts.get("chk_smoke_3"), status: "completed", amount: "19.00", currency: "USD" });
  assert.equal((await deliver("evt_late_paid", "checkout.completed", "chk_smoke_3", late.order_id)).status, 200);
  passed("a payment after checkout.expired still completes the order");

  refuseCheckout = true;
  const uncertain = await buy({ product: "guide" });
  assert.equal(uncertain.status, 502);
  assert.match(await store(), /Checking payment/);
  passed("uncertain checkout keeps the order and its key");
  console.log(step + " local HTTP smoke checks passed. Bachs API responses were fixtures.");
} finally {
  child.kill();
  await exit;
  await new Promise((resolve) => fixture.close(resolve));
  // Only this run's known files are removed; no recursive deletion.
  for (const name of await readdir(dataDirectory)) await unlink(path.join(dataDirectory, name));
  await rmdir(dataDirectory);
}
