import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/fade-in";
import { BarChart3, DollarSign, Package } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero with background image */}
      <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('/hero.jpg')",
          }}
        />
        {/* Dark overlay with brand gradient */}
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--poke-blue))/0.5] via-transparent to-[hsl(var(--background))]" />

        {/* Content */}
        <div className="relative z-10 container mx-auto px-4 text-center max-w-4xl">
          <div className="animate-fade-in-up">
            <span className="inline-block text-xs font-semibold bg-[hsl(var(--poke-yellow))] text-[hsl(var(--poke-blue))] rounded-full px-4 py-1.5 mb-6 shadow-md">
              Free · No login required
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1] animate-fade-in-up delay-100">
            <span className="text-white">Should you grade</span>
            <br />
            <span className="text-[hsl(var(--poke-yellow))] drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
              that card?
            </span>
          </h1>

          <p className="text-lg md:text-xl text-white/80 mb-10 max-w-2xl mx-auto leading-relaxed animate-fade-in-up delay-200">
            Stop guessing. Calculate the expected value of grading, flipping, or
            holding any Pokémon card — with real market prices, real fees, and
            no hand-waving.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up delay-300">
            <Link href="/calculator">
              <Button size="lg" className="text-base px-10 py-3 bg-[hsl(var(--poke-red))] text-white hover:opacity-90 shadow-lg hover-scale">
                Open Calculator
              </Button>
            </Link>
            <a href="#features">
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

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[hsl(var(--background))] to-transparent" />
      </section>

      {/* Features */}
      <section id="features" className="py-20 bg-[hsl(var(--background))]">
        <div className="container mx-auto px-4 max-w-5xl">
          <FadeIn>
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold mb-3">
                <span className="text-[hsl(var(--poke-red))]">Three tools.</span>{" "}
                One mission.
              </h2>
              <p className="text-[hsl(var(--muted-foreground))] max-w-xl mx-auto">
                Every decision backed by math, not hype.
              </p>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FadeIn delay={0}>
              <div className="hover-lift rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 h-full">
                <div className="w-12 h-12 rounded-lg bg-[hsl(var(--poke-red))/0.1] flex items-center justify-center mb-4">
                  <BarChart3 className="w-6 h-6 text-[var(--poke-red)]" />
                </div>
                <h3 className="text-lg font-bold mb-2 text-[hsl(var(--foreground))]">
                  Grading EV
                </h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                  Probability-weighted expected value across PSA 10, 9, and 8
                  outcomes. Know your break-even before you ship.
                </p>
              </div>
            </FadeIn>

            <FadeIn delay={150}>
              <div className="hover-lift rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 h-full">
                <div className="w-12 h-12 rounded-lg bg-[hsl(var(--poke-yellow))/0.1] flex items-center justify-center mb-4">
                  <DollarSign className="w-6 h-6 text-[var(--poke-yellow)]" />
                </div>
                <h3 className="text-lg font-bold mb-2 text-[hsl(var(--foreground))]">
                  Flip ROI
                </h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                  Net profit after eBay fees, PayPal, shipping, and packing.
                  See your real margin, not the gross.
                </p>
              </div>
            </FadeIn>

            <FadeIn delay={300}>
              <div className="hover-lift rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 h-full">
                <div className="w-12 h-12 rounded-lg bg-[hsl(var(--poke-blue))/0.1] flex items-center justify-center mb-4">
                  <Package className="w-6 h-6 text-[var(--poke-blue)]" />
                </div>
                <h3 className="text-lg font-bold mb-2 text-[hsl(var(--foreground))]">
                  Sealed Returns
                </h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                  Project annualized returns for sealed product holds with
                  storage costs and exit fees factored in.
                </p>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-[hsl(var(--card))]">
        <div className="container mx-auto px-4 max-w-4xl">
          <FadeIn>
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold mb-3">
                How it works
              </h2>
              <p className="text-[hsl(var(--muted-foreground))]">
                From card search to decision in seconds.
              </p>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Search your card",
                desc: "Find any Pokémon card by name. Real-time prices pulled from TCGPlayer.",
              },
              {
                step: "2",
                title: "Run the numbers",
                desc: "Prices auto-fill into the calculator. Adjust probabilities, fees, and costs.",
              },
              {
                step: "3",
                title: "Get a clear answer",
                desc: "See expected profit, ROI, and a straight-up recommendation: grade it or skip it.",
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
              Ready to run the numbers?
            </h2>
            <p className="text-[hsl(var(--muted-foreground))] mb-8">
              No sign-up. No paywall. Just math.
            </p>
            <Link href="/calculator">
              <Button
                size="lg"
                className="text-base px-12 py-3 bg-[hsl(var(--poke-red))] text-white hover:opacity-90 shadow-lg hover-scale"
              >
                Open Calculator — It&apos;s Free
              </Button>
            </Link>
          </div>
        </FadeIn>
      </section>
    </div>
  );
}
