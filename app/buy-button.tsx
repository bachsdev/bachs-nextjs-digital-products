"use client";
import { useState } from "react";

// Asks the server for a checkout and sends the buyer to it. To keep buyers on
// your page, open the same URL with the Bachs overlay instead:
// https://docs.bachs.io/guides/checkout/overlay-checkout
export function BuyButton({ product, label }: { product: string; label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function buy() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.checkout_url) window.location.href = body.checkout_url;
      else setError(body.error || "Could not start checkout. Try again.");
    } catch {
      setError("Could not confirm checkout. Refresh the page to check your orders.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button onClick={buy} disabled={loading}>{loading ? "Opening checkout..." : label}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
