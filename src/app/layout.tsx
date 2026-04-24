import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { FirstVisitDisclaimer } from "@/components/layout/first-visit-disclaimer";

const SITE_NAME = "PokeAlpha";
const SITE_DESCRIPTION =
  "Data-driven Pokémon TCG investing toolkit. Forecast sealed-product ROI with ML-backed Buy / Hold / Sell signals, stress-test under Pessimist · Moderate · Optimist scenarios, and run grade-or-don't-grade EV math on individual cards.";

export const metadata: Metadata = {
  applicationName: SITE_NAME,
  title: {
    default: `${SITE_NAME} — Sealed Forecasts & Grading EV for Pokémon TCG`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Sealed Forecasts & Grading EV for Pokémon TCG`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Sealed Forecasts & Grading EV for Pokémon TCG`,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased flex flex-col">
        <FirstVisitDisclaimer />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
