import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Endpoint Extractor",
  description: "Extract network and inferred endpoints from webpages."
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
