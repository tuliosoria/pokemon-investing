import Link from "next/link";
import { getLegalConfig } from "@/lib/legal-config";

export default function PrivacyPage() {
  const legal = getLegalConfig();

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-3xl font-bold mb-8">
          <span className="text-[hsl(var(--poke-red))]">Privacy</span> Policy
        </h1>

        <div className="prose prose-invert max-w-none space-y-6 text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Last updated: April 2026
          </p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">1. Information We Collect</h2>
            <p>
              {legal.operatorName} currently operates this site without user
              accounts, subscriptions, or checkout flows. We do not ask visitors
              to create an account or intentionally submit profile information to
              use the core tools.
            </p>
            <p>
              Depending on the feature you use, our servers may temporarily
              receive search terms, product identifiers, and similar request
              inputs in order to return results. We also maintain owned cached
              datasets and market snapshots in our infrastructure for
              performance, reliability, and model-training purposes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">2. Automatically Collected Information</h2>
            <p>
              When you visit {legal.operatorName}, our hosting and infrastructure
              providers may automatically collect standard server/request logs,
              such as IP address, user agent, request path, referrer, timestamps,
              and error/latency information. This information is used for
              security, abuse prevention, operations, and aggregate traffic
              analysis.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">3. Third-Party Services</h2>
            <p>
              We use the following third-party services:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>AWS Amplify / AWS</strong> — for hosting, request handling, and owned stored data.</li>
              <li><strong>tcgapi.dev</strong> and <strong>PokémonTCG.io</strong> — for card catalog or pricing fallback data.</li>
              <li><strong>PriceCharting</strong> — for market pricing and related catalog mappings.</li>
              <li><strong>Google Trends / stored trend snapshots</strong> — for popularity/trend signals.</li>
              <li><strong>TCGPlayer</strong> — outbound link destination and price-reference source through upstream providers.</li>
            </ul>
            <p>
              We aim to serve results from owned snapshots and cached data first.
              However, some requests may still trigger third-party lookups when
              owned data is missing, stale, or incomplete.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">4. Cookies, ads, and sale of data</h2>
            <p>
              {legal.operatorName} does not currently run behavioral advertising
              or sell personal information. We also do not currently rely on a
              user-facing cookie consent banner because the site does not use the
              kind of ad-tech or account-tracking stack that would typically
              require one. If this changes, this policy and our privacy-rights
              disclosures should be updated before launch of those features.
            </p>
            <p>
              See our <Link href="/privacy-rights">Privacy Rights</Link> page for
              a short-form no-sale / no-sharing disclosure.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">5. Data retention and security</h2>
            <p>
              We use reasonable technical and organizational measures to protect
              the service, including HTTPS and managed cloud infrastructure. Some
              market/trend/search artifacts and caches may be retained in memory,
              DynamoDB, or owned storage so the app can serve results more
              reliably and train/update models over time.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">6. Children&apos;s Privacy</h2>
            <p>
              PokeFuture is not directed at children under 13 years of age. We do not knowingly
              collect personal information from children.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">7. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Any changes will be reflected
              on this page with an updated &quot;Last updated&quot; date.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">8. Contact</h2>
            {legal.privacyEmail ? (
              <p>
                For privacy questions or requests, contact{" "}
                <a href={`mailto:${legal.privacyEmail}`}>{legal.privacyEmail}</a>.
              </p>
            ) : (
              <p>
                For privacy questions, use the contact route published on our{" "}
                <Link href="/contact">Contact</Link> page.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
