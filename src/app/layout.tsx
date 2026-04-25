import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { FirstVisitDisclaimer } from "@/components/layout/first-visit-disclaimer";

const SITE_NAME = "PokeFuture";
const SITE_DESCRIPTION =
  "Invest in the future of the Pokémon market. PokeFuture pairs ML-backed sealed-product forecasts with scenario stress-tests and grade-or-don't-grade EV math so collectors can spot where the next decade of demand is heading.";

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
