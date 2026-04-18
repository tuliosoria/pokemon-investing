import Link from "next/link";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="pokeball-divider" />
      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[hsl(var(--poke-red))] flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-white border border-[hsl(var(--poke-blue))]" />
              </div>
              <span className="font-bold">
                <span className="text-[hsl(var(--poke-red))]">Poké</span>
                <span className="text-[hsl(var(--poke-yellow))]">Invest</span>
              </span>
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
              A calculation tool for Pokémon card investors. Not financial advice.
              All market data is sourced from public APIs.
            </p>
          </div>

          {/* Calculators */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-[hsl(var(--foreground))]">Tools</h4>
            <nav className="flex flex-col gap-2">
              <Link href="/calculator" className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--poke-red))] transition-colors">
                Grading EV Calculator
              </Link>
              <Link href="/calculator" className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--poke-red))] transition-colors">
                Flip ROI Calculator
              </Link>
              <Link href="/calculator" className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--poke-red))] transition-colors">
                Sealed ROI Calculator
              </Link>
            </nav>
          </div>

          {/* Legal */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-[hsl(var(--foreground))]">Legal</h4>
            <nav className="flex flex-col gap-2">
              <Link href="/terms" className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--poke-red))] transition-colors">
                Terms &amp; Conditions
              </Link>
              <Link href="/privacy" className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--poke-red))] transition-colors">
                Privacy Policy
              </Link>
            </nav>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-[hsl(var(--border))] flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            © {year} PokéInvest. All rights reserved.
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Pokémon is a trademark of Nintendo / Creatures Inc. / GAME FREAK inc.
            This site is not affiliated with The Pokémon Company.
          </p>
        </div>
      </div>
    </footer>
  );
}
