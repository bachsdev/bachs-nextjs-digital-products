import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Acme Downloads",
  description: "A Next.js starter for selling digital products with Bachs.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
