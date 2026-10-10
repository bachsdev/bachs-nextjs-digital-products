// Bachs amounts are decimal strings ("19.00"). Compare them as whole minor
// units, never as floating-point numbers.
export function toMinor(amount: string): bigint | undefined {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) return undefined;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

export function formatAmount(amount: string, currency: string) {
  return `${currency === "USD" ? "$" : currency + " "}${amount}`;
}
