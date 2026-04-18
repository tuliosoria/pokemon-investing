import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex flex-col">
      {/* Nav */}
      <header className="border-b border-[hsl(var(--border))]">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <span className="text-xl font-bold">PokéInvest</span>
          <nav className="flex items-center gap-4">
            <Link
              href="/calculator"
              className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
            >
              Calculator
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center">
        <div className="container mx-auto px-4 py-24 text-center max-w-3xl">
          <div className="mb-6">
            <span className="inline-block text-xs font-medium bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.3)] rounded-full px-3 py-1">
              Free &middot; No login required
            </span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
            Should you grade
            <br />
            <span className="text-[hsl(var(--primary))]">that card?</span>
          </h1>

          <p className="text-xl text-[hsl(var(--muted-foreground))] mb-10 max-w-2xl mx-auto leading-relaxed">
            Stop guessing. Calculate the expected value of grading, flipping, or
            holding any trading card — with real fees, real costs, and no
            hand-waving.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/calculator">
              <Button size="lg" className="text-base px-8">
                Open Calculator
              </Button>
            </Link>
          </div>

          {/* Feature bullets */}
          <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
            <div className="space-y-2">
              <div className="text-2xl">📊</div>
              <h3 className="font-semibold">Grading EV</h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Probability-weighted expected value across PSA 10, 9, and 8
                outcomes. Know your break-even before you ship.
              </p>
            </div>
            <div className="space-y-2">
              <div className="text-2xl">💰</div>
              <h3 className="font-semibold">Flip ROI</h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Net profit after eBay fees, PayPal, shipping, and packing.
                See your real margin, not the gross.
              </p>
            </div>
            <div className="space-y-2">
              <div className="text-2xl">📦</div>
              <h3 className="font-semibold">Sealed Returns</h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Project annualized returns for sealed product holds with
                storage costs and exit fees factored in.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[hsl(var(--border))] py-6">
        <div className="container mx-auto px-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
          PokéInvest is a calculation tool. Not financial advice. Market data is
          user-supplied.
        </div>
      </footer>
    </div>
  );
}
