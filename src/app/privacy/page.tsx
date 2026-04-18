export default function PrivacyPage() {
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
              PokéInvest currently does not require user accounts or collect personal information.
              The calculator tools operate entirely in your browser and on our server without
              storing your inputs or results.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">2. Automatically Collected Information</h2>
            <p>
              When you visit PokéInvest, our hosting provider (AWS Amplify) may automatically
              collect standard web server logs, including your IP address, browser type,
              referring page, and timestamps. This data is used solely for maintaining the
              service and analyzing aggregate traffic patterns.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">3. Third-Party Services</h2>
            <p>
              We use the following third-party services:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>PokémonTCG.io API</strong> — to retrieve card data and pricing information.</li>
              <li><strong>TCGPlayer</strong> — pricing data is sourced from TCGPlayer via the PokémonTCG.io API.</li>
              <li><strong>AWS Amplify</strong> — for hosting and serving the application.</li>
            </ul>
            <p>
              Card search queries are sent to our server, which forwards them to the PokémonTCG.io
              API. We do not log or store your search queries beyond temporary in-memory caching
              for performance.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">4. Cookies</h2>
            <p>
              PokéInvest does not currently use cookies or tracking technologies. If this changes
              in the future (e.g., for user accounts), this policy will be updated accordingly.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">5. Data Security</h2>
            <p>
              We take reasonable measures to protect the security of our service. The application
              is served over HTTPS. Since we do not collect or store personal data, the risk of
              data breach is minimal.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">6. Children&apos;s Privacy</h2>
            <p>
              PokéInvest is not directed at children under 13 years of age. We do not knowingly
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
            <p>
              For questions about this Privacy Policy, please open an issue on our GitHub repository.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
