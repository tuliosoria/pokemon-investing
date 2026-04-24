import { getLegalConfig } from "@/lib/legal-config";

export default function ContactPage() {
  const legal = getLegalConfig();

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <div className="container mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-8 text-3xl font-bold">
          <span className="text-[hsl(var(--poke-red))]">Contact</span> &amp;
          Legal Notices
        </h1>

        <div className="space-y-6 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
          <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
            <h2 className="mb-3 text-lg font-semibold text-[hsl(var(--foreground))]">
              Site operator
            </h2>
            <p>
              <strong className="text-[hsl(var(--foreground))]">
                {legal.operatorName}
              </strong>
            </p>
            {legal.businessAddress ? (
              <p className="mt-2 whitespace-pre-line">{legal.businessAddress}</p>
            ) : (
              <p className="mt-2">
                Business mailing address not yet published. Add one before a
                broader public launch if your jurisdiction or business setup
                requires it.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
            <h2 className="mb-3 text-lg font-semibold text-[hsl(var(--foreground))]">
              Contact methods
            </h2>
            <div className="space-y-2">
              {legal.contactEmail ? (
                <p>
                  General contact:{" "}
                  <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>
                </p>
              ) : (
                <p>
                  A dedicated public contact email is not configured yet. You
                  should set one before launch.
                </p>
              )}
              {legal.privacyEmail && legal.privacyEmail !== legal.contactEmail ? (
                <p>
                  Privacy requests:{" "}
                  <a href={`mailto:${legal.privacyEmail}`}>{legal.privacyEmail}</a>
                </p>
              ) : null}
              <p>
                Support channel:{" "}
                <a
                  href={legal.contactUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {legal.contactUrl}
                </a>
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
