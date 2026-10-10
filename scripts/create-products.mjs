// Creates the starter's two products in your Bachs sandbox and prints the
// product IDs to put in .env. Run: npm run setup:products
import { Bachs, BachsApiError } from "@bachs/sdk";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

// Load .env without a dependency.
try {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // No .env file: use the shell environment.
}

const apiKey = process.env.BACHS_API_KEY;
if (!apiKey || !apiKey.startsWith("sk_sandbox_")) {
  console.error("Set BACHS_API_KEY in .env to your sandbox key (sk_sandbox_...). This script only runs in the sandbox.");
  process.exit(1);
}

// Must match lib/catalog.ts.
const products = [
  {
    env: "BACHS_PRODUCT_GUIDE",
    body: { name: "The Field Guide", price: { currency: "USD", amount: "19.00" } },
  },
  {
    env: "BACHS_PRODUCT_PACK",
    body: {
      name: "The Template Pack",
      price: { currency: "USD", price_type: "custom", preset_amount: "10.00", minimum_amount: "5.00" },
    },
  },
];

const bachs = new Bachs({ apiKey, environment: "sandbox", baseURL: process.env.BACHS_API_URL || undefined });

for (const product of products) {
  let created;
  try {
    created = await bachs.products.create(
      { ...product.body, metadata: { template: "bachs-nextjs-digital-products" } },
      { idempotencyKey: randomUUID() },
    );
  } catch (err) {
    console.error("Could not confirm product creation.",
      err instanceof BachsApiError ? { status: err.status, code: err.errorCode } : "Request did not complete");
    console.error("Check products in the dashboard before rerunning; a lost response may still have created one.");
    process.exit(1);
  }
  console.log(`${product.env}=${created.id}`);
}

console.log("\nCopy the lines above into .env.");
