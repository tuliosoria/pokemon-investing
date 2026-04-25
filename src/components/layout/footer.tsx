import Link from "next/link";
import { getLegalConfig } from "@/lib/legal-config";
import { ShowDisclaimerButton } from "@/components/layout/show-disclaimer-button";

export function Footer() {
  const year = new Date().getFullYear();
  const legal = getLegalConfig();

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
                <span className="text-[hsl(var(--poke-red))]">Poke</span>
                <span className="text-[hsl(var(--poke-yellow))]">Future</span>
              </span>
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
              Tools for collectors thinking about the future of the Pokémon
              market. Educational only — not financial, legal, or tax advice.
              Market data may be delayed, incomplete, estimated, or sourced
              from third parties.
            </p>
          </div>

          {/* Tool */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-[hsl(var(--foreground))]">Tool</h4>
            <nav className="flex flex-col gap-2">
              <Link href="/calculator" className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--poke-red))] transition-colors">
                Grading Calculator
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
              <Link href="/privacy-rights" className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--poke-red))] transition-colors">
                Privacy Rights / Do Not Sell
              </Link>
              <Link href="/contact" className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--poke-red))] transition-colors">
                Contact &amp; Legal Notices
              </Link>
              <ShowDisclaimerButton />
            </nav>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-[hsl(var(--border))] flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            © {year} PokeFuture. All rights reserved.
          </p>
          <div className="space-y-1 text-center sm:text-right">
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {legal.contactEmail ? (
                <>
                  Contact:{" "}
                  <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>
                </>
              ) : (
                <>No dedicated legal contact email configured yet.</>
              )}
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              We do not sell personal information based on the website&apos;s
              current behavior.
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Pokémon is a trademark of Nintendo / Creatures Inc. / GAME FREAK inc.
            This site is not affiliated with The Pokémon Company.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
