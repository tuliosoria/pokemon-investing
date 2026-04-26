import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/fade-in";
import { BarChart3, Target, Zap, TrendingUp, Package, ShieldCheck } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero with background image */}
      <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/hero.jpg')" }}
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--poke-blue))/0.5] via-transparent to-[hsl(var(--background))]" />

        <div className="relative z-10 container mx-auto px-4 text-center max-w-3xl">
          <div className="animate-fade-in-up">
            <span className="inline-block text-xs font-semibold bg-[hsl(var(--poke-yellow))] text-[hsl(var(--poke-blue))] rounded-full px-4 py-1.5 mb-6 shadow-md">
              Free &middot; No login required &middot; No sale of personal data
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1] animate-fade-in-up delay-100">
            <span className="text-white">Invest in the future of</span>
            <br />
            <span className="text-[hsl(var(--poke-yellow))] drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
              the Pok&eacute;mon market
            </span>
          </h1>

          <p className="text-lg md:text-xl text-white/80 mb-10 max-w-2xl mx-auto leading-relaxed animate-fade-in-up delay-200">
            ML-backed forecasts for sealed product, scenario stress-tests, and
            grade-or-don&rsquo;t-grade EV math &mdash; built to help you see
            where the next decade of demand is heading. Educational tools, not
            personalized investment advice.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up delay-300">
            <Link href="/sealed-forecast">
              <Button
                size="lg"
                className="text-base px-10 py-3 bg-[hsl(var(--poke-blue))] text-white hover:opacity-90 shadow-lg hover-scale"
              >
                Sealed Forecast
              </Button>
            </Link>
            <Link href="/calculator">
              <Button
                size="lg"
                className="text-base px-10 py-3 bg-[hsl(var(--poke-red))] text-white hover:opacity-90 shadow-lg hover-scale"
              >
                Grading Calculator
              </Button>
            </Link>
            <a href="#tools">
              <Button
                variant="outline"
                size="lg"
                className="text-base px-10 py-3 border-white/30 text-white hover:bg-white/10 hover-scale"
              >
                Learn More
              </Button>
            </a>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[hsl(var(--background))] to-transparent" />
      </section>

      {/* Two pillars */}
      <section id="tools" className="py-20 bg-[hsl(var(--background))]">
        <div className="container mx-auto px-4 max-w-5xl">
          <FadeIn>
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold mb-3">
                <span className="text-[hsl(var(--poke-red))]">Two ways</span>{" "}
                to invest smarter
              </h2>
              <p className="text-[hsl(var(--muted-foreground))] max-w-xl mx-auto">
                Whether you&rsquo;re grading singles or stacking sealed product,
                we give you model outputs and market context to review for
                yourself.
              </p>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
            {/* Sealed pillar */}
            <FadeIn delay={0}>
              <div className="hover-lift rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 h-full">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 rounded-lg bg-[hsl(var(--poke-blue))/0.1] flex items-center justify-center">
                    <Package className="w-6 h-6 text-[var(--poke-blue)]" />
                  </div>
                  <h3 className="text-xl font-bold">Sealed Product Forecast</h3>
                </div>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed mb-5">
                  Track and forecast sealed product prices &mdash; booster boxes,
                  ETBs, tins, bundles, and more. Review historical trends,
                  compare product types, and inspect model-based forecasts using
                  owned and third-party market data.
                </p>
                <ul className="space-y-2 text-sm text-[hsl(var(--muted-foreground))] mb-6">
                  <li className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-[var(--poke-blue)] shrink-0" />
                    Price history &amp; forecasting models
                  </li>
                  <li className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-[var(--poke-yellow)] shrink-0" />
                    Compare booster boxes, ETBs, tins &amp; more
                  </li>
                  <li className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-[var(--poke-red)] shrink-0" />
                    eBay sales data &amp; market pricing
                  </li>
                </ul>
                <Link href="/sealed-forecast">
                  <Button className="w-full bg-[hsl(var(--poke-blue))] text-white hover:opacity-90">
                    Open Sealed Forecast &rarr;
                  </Button>
                </Link>
              </div>
            </FadeIn>

            {/* Grading pillar */}
            <FadeIn delay={150}>
              <div className="hover-lift rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 h-full">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 rounded-lg bg-[hsl(var(--poke-red))/0.1] flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6 text-[var(--poke-red)]" />
                  </div>
                  <h3 className="text-xl font-bold">Grading Calculator</h3>
                </div>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed mb-5">
                  Review grading economics using expected value math, estimated
                  grade distributions, fees, and current market references. The
                  tool is informational and should be used alongside your own
                  judgment.
                </p>
                <ul className="space-y-2 text-sm text-[hsl(var(--muted-foreground))] mb-6">
                  <li className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-[var(--poke-red)] shrink-0" />
                    Expected profit &amp; ROI across grade outcomes
                  </li>
                  <li className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-[var(--poke-yellow)] shrink-0" />
                    Break-even PSA 10 probability analysis
                  </li>
                  <li className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-[var(--poke-blue)] shrink-0" />
                    Instant decision in under 10 seconds
                  </li>
                </ul>
                <Link href="/calculator">
                  <Button className="w-full bg-[hsl(var(--poke-red))] text-white hover:opacity-90">
                    Open Grading Calculator &rarr;
                  </Button>
                </Link>
              </div>
            </FadeIn>
          </div>

          {/* Sealed product showcase */}
          <FadeIn delay={300}>
            <div className="relative overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8">
              <div className="text-center mb-8">
                <h3 className="text-xl font-bold mb-2">
                  Track every sealed product type
                </h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-lg mx-auto">
                  Booster boxes, Elite Trainer Boxes, tins, bundles, binder collections,
                  mini tins &mdash; all in one place with stored and provider
                  market references.
                </p>
              </div>
              <div className="flex gap-6 justify-center items-end flex-wrap">
                {[
                  { src: "/sealed/prismatic-etb.webp", label: "Elite Trainer Box", h: "h-40 md:h-52" },
                  { src: "/sealed/surging-sparks-bb.webp", label: "Booster Box", h: "h-36 md:h-48" },
                  { src: "/sealed/prismatic-booster-bundle.webp", label: "Booster Bundle", h: "h-32 md:h-44" },
                  { src: "/sealed/crown-zenith-etb.webp", label: "ETB", h: "h-40 md:h-52" },
                  { src: "/sealed/prismatic-mini-tin.webp", label: "Mini Tin", h: "h-28 md:h-36" },
                  { src: "/sealed/obsidian-flames-bb.webp", label: "Booster Box", h: "h-36 md:h-48" },
                  { src: "/sealed/151-etb.webp", label: "ETB", h: "h-40 md:h-52" },
                ].map((item) => (
                  <div key={item.src} className="group flex flex-col items-center gap-2">
                    <div className={`${item.h} transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-1`}>
                      <img
                        src={item.src}
                        alt={item.label}
                        className="h-full w-auto object-contain drop-shadow-lg"
                      />
                    </div>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))] opacity-0 group-hover:opacity-100 transition-opacity">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-20 bg-[hsl(var(--card))]">
        <div className="container mx-auto px-4 max-w-4xl">
          <FadeIn>
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold mb-3">
                How it works
              </h2>
              <p className="text-[hsl(var(--muted-foreground))]">
                From search to decision in seconds.
              </p>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Search any card or product",
                desc: "Find Pok\u00e9mon cards or sealed products by name using owned data first, with provider fallback where needed.",
              },
              {
                step: "2",
                title: "Review the data",
                desc: "Review market references, stored history, model outputs, and comparable context where available.",
              },
              {
                step: "3",
                title: "Make your own decision",
                desc: "Use the analysis as an informational input, not as personalized financial, tax, or legal advice.",
              },
            ].map((item, i) => (
              <FadeIn key={item.step} delay={i * 150}>
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-[hsl(var(--poke-red))] text-white text-lg font-bold flex items-center justify-center mx-auto mb-4 shadow-md">
                    {item.step}
                  </div>
                  <h3 className="font-bold mb-2">{item.title}</h3>
                  <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[hsl(var(--background))]">
        <FadeIn>
          <div className="container mx-auto px-4 text-center max-w-2xl">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to invest smarter?
            </h2>
            <p className="text-[hsl(var(--muted-foreground))] mb-8">
              No sign-up. No paywall. Informational tools only.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/sealed-forecast">
                <Button
                  size="lg"
                  className="text-base px-10 py-3 bg-[hsl(var(--poke-blue))] text-white hover:opacity-90 shadow-lg hover-scale"
                >
                  Sealed Forecast
                </Button>
              </Link>
              <Link href="/calculator">
                <Button
                  size="lg"
                  className="text-base px-10 py-3 bg-[hsl(var(--poke-red))] text-white hover:opacity-90 shadow-lg hover-scale"
                >
                  Grading Calculator
                </Button>
              </Link>
            </div>
            <div className="mt-8 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-4 text-left text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
              PokeFuture provides educational market-analysis tools. It does not
              provide personalized financial, investment, tax, or legal advice.
              Review our{" "}
              <Link href="/terms" className="text-[hsl(var(--poke-red))] hover:underline">
                Terms of Use
              </Link>
              ,{" "}
              <Link href="/privacy" className="text-[hsl(var(--poke-red))] hover:underline">
                Privacy Policy
              </Link>
              , and{" "}
              <Link href="/privacy-rights" className="text-[hsl(var(--poke-red))] hover:underline">
                Privacy Rights
              </Link>
              {" "}before relying on the site.
            </div>
          </div>
        </FadeIn>
      </section>
    </div>
  );
}
