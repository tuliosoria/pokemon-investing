import Link from "next/link";
import { getLegalConfig } from "@/lib/legal-config";

export default function TermsPage() {
  const legal = getLegalConfig();

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
              By accessing and using PokeFuture (&quot;the Service&quot;), you accept and agree to be bound
              by these Terms and Conditions. If you do not agree, you may not use the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">2. Description of Service</h2>
            <p>
              {legal.operatorName} provides informational tools related to
              Pokémon trading cards and sealed products, including calculators,
              forecasts, market data views, and model-based research outputs. The
              Service is provided for informational and educational use only.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">3. No financial or professional advice</h2>
            <p>
              The calculations, estimates, forecasts, signals, benchmarks, and
              other outputs on the Service are not financial, investment, tax,
              legal, or professional advice. They are generalized model outputs
              and research tools, not personalized recommendations.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">4. Accuracy, availability, and third-party data</h2>
            <p>
              Market data, card catalog data, trend inputs, population data, and
              related information may come from owned snapshots, generated model
              artifacts, or third-party services. We do not guarantee accuracy,
              completeness, timeliness, availability, or uninterrupted access.
              Historical performance or model outputs do not guarantee future
              results.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">5. Acceptable use</h2>
            <p>
              You agree not to misuse the Service, interfere with availability,
              attempt unauthorized access, scrape the site in a way that harms
              operations, or use the Service in violation of applicable law.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">6. Intellectual property</h2>
            <p>
              Pokémon is a trademark of Nintendo / Creatures Inc. / GAME FREAK inc.
              PokeFuture is not affiliated with, endorsed by, or sponsored by The Pokémon Company,
              Nintendo, or any related entities. Third-party marks, images, and
              data remain the property of their respective owners.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">7. No warranty and limitation of liability</h2>
            <p>
              The Service is provided &quot;as is&quot; and &quot;as available&quot;
              without warranties of any kind. To the maximum extent permitted by
              law, {legal.operatorName} will not be liable for indirect,
              incidental, consequential, special, exemplary, or punitive damages,
              including losses related to market decisions, valuation assumptions,
              missed opportunities, or service interruptions.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">8. Changes to the service or terms</h2>
            <p>
              We may modify, suspend, or discontinue parts of the Service and may
              update these Terms from time to time. Continued use of the Service
              after an update means you accept the revised Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">9. Contact</h2>
            {legal.contactEmail ? (
              <p>
                For questions about these Terms, contact{" "}
                <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>.
              </p>
            ) : (
              <p>
                For questions about these Terms, use the contact route published
                on our <Link href="/contact">Contact</Link> page.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
