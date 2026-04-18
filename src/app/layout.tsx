import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pokémon Card Investing — Should You Grade That Card?",
  description:
    "Calculate grading expected value, flip ROI, and sealed product returns. Make data-driven decisions for your Pokémon card investments.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
