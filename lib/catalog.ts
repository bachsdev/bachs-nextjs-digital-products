// The products you sell. The browser only ever sends a product key; the
// server maps it to a Bachs product ID, so nobody can change the price from
// the browser. Prices here must match the products in Bachs: they are used to
// check what was paid before an order is fulfilled.
export type CatalogItem = {
  name: string;
  description: string;
  env: string; // environment variable holding the Bachs product ID
  currency: "USD";
  file: string; // file in private/ that a paid order can download
} & ({ pricing: "fixed"; amount: string } | { pricing: "custom"; minimum: string; preset: string });

export const CATALOG = {
  guide: {
    name: "The Field Guide",
    description: "A practical guide, delivered as a download.",
    env: "BACHS_PRODUCT_GUIDE",
    currency: "USD",
    file: "field-guide.txt",
    pricing: "fixed",
    amount: "19.00",
  },
  pack: {
    name: "The Template Pack",
    description: "Pay what you want, from $5.00.",
    env: "BACHS_PRODUCT_PACK",
    currency: "USD",
    file: "template-pack.txt",
    pricing: "custom",
    minimum: "5.00",
    preset: "10.00",
  },
} satisfies Record<string, CatalogItem>;

export type ProductKey = keyof typeof CATALOG;

export function catalogItem(key: string): CatalogItem | undefined {
  return Object.hasOwn(CATALOG, key) ? CATALOG[key as ProductKey] : undefined;
}

export function productIdFor(key: string): string | undefined {
  const item = catalogItem(key);
  return item ? process.env[item.env] || undefined : undefined;
}
