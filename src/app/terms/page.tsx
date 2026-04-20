export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-3xl font-bold mb-8">
          <span className="text-[hsl(var(--poke-red))]">Terms</span> &amp; Conditions
        </h1>

        <div className="prose prose-invert max-w-none space-y-6 text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Last updated: April 2026
          </p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">1. Acceptance of Terms</h2>
            <p>
              By accessing and using PokeAlpha (&quot;the Service&quot;), you accept and agree to be bound
              by these Terms and Conditions. If you do not agree, you may not use the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">2. Description of Service</h2>
            <p>
              PokeAlpha provides a calculator tool for estimating the expected value of grading
              Pokémon trading cards. The Service is provided &quot;as is&quot; for
              informational and educational purposes only.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">3. Not Financial Advice</h2>
            <p>
              The calculations, estimates, and recommendations provided by PokeAlpha do not constitute
              financial, investment, or professional advice. All investment decisions are made at your
              own risk. Past performance of trading card values does not guarantee future results.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">4. Accuracy of Data</h2>
            <p>
              Market prices are sourced from third-party APIs (including PokémonTCG.io and TCGPlayer).
              We do not guarantee the accuracy, completeness, or timeliness of pricing data.
              Graded card value estimates are based on heuristic multipliers and should not be
              relied upon as accurate market valuations.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">5. Intellectual Property</h2>
            <p>
              Pokémon is a trademark of Nintendo / Creatures Inc. / GAME FREAK inc.
              PokeAlpha is not affiliated with, endorsed by, or sponsored by The Pokémon Company,
              Nintendo, or any related entities. Card images and data are provided by third-party APIs.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">6. Limitation of Liability</h2>
            <p>
              In no event shall PokeAlpha be liable for any indirect, incidental, special,
              consequential, or punitive damages arising out of your use of the Service, including
              but not limited to financial losses from investment decisions made using our calculators.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">7. Changes to Terms</h2>
            <p>
              We reserve the right to modify these terms at any time. Continued use of the Service
              after changes constitutes acceptance of the updated terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">8. Contact</h2>
            <p>
              For questions about these Terms, please open an issue on our GitHub repository.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
