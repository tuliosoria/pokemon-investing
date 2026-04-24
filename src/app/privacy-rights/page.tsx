import Link from "next/link";
import { getLegalConfig } from "@/lib/legal-config";

export default function PrivacyRightsPage() {
  const legal = getLegalConfig();

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <div className="container mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-8 text-3xl font-bold">
          <span className="text-[hsl(var(--poke-red))]">Privacy</span> Rights
        </h1>

        <div className="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Last updated: April 2026
          </p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
              1. No sale or sharing of personal information
            </h2>
            <p>
              Based on the website&apos;s current behavior, {legal.operatorName} does
              not sell personal information and does not share personal
              information for cross-context behavioral advertising. The site does
              not run ad-tech, data-broker integrations, or targeted advertising
              workflows.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
              2. US state privacy rights
            </h2>
            <p>
              Depending on where you live, you may have rights to request access
              to, deletion of, or correction of personal information that a
              business maintains about you, subject to legal exceptions. Because
              this site currently operates without accounts and stores very
              limited user-linked information, many requests may result in a
              response explaining that no directly identifying account record is
              maintained.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
              3. How to contact us about a privacy request
            </h2>
            {legal.privacyEmail ? (
              <p>
                Send privacy requests to{" "}
                <a href={`mailto:${legal.privacyEmail}`}>{legal.privacyEmail}</a>.
              </p>
            ) : (
              <p>
                Privacy requests can currently be sent through our{" "}
                <a
                  href={legal.contactUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  published support channel
                </a>
                . Before a broader public launch, you should configure a
                dedicated privacy contact email.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
              4. Changes if the product evolves
            </h2>
            <p>
              If the site later adds accounts, payments, email capture,
              analytics, cookies, or advertising technology, this page and the{" "}
              <Link href="/privacy">Privacy Policy</Link> should be updated
              before those features go live.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
