import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/fade-in";
import { BarChart3, Target, Zap } from "lucide-react";

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
              Free &middot; No login required
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
            Find out in seconds. Search any Pok&eacute;mon card, get a clear
            Grade / Don&rsquo;t Grade decision backed by expected value math.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up delay-300">
            <Link href="/calculator">
              <Button
                size="lg"
                className="text-base px-10 py-3 bg-[hsl(var(--poke-red))] text-white hover:opacity-90 shadow-lg hover-scale"
              >
                Check Your Card
              </Button>
            </Link>
            <a href="#how">
              <Button
                variant="outline"
                size="lg"
                className="text-base px-10 py-3 border-white/30 text-white hover:bg-white/10 hover-scale"
              >
                How It Works
              </Button>
            </a>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[hsl(var(--background))] to-transparent" />
      </section>

      {/* Value props */}
      <section className="py-20 bg-[hsl(var(--background))]">
        <div className="container mx-auto px-4 max-w-4xl">
          <FadeIn>
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold mb-3">
                <span className="text-[hsl(var(--poke-red))]">One question.</span>{" "}
                One answer.
              </h2>
              <p className="text-[hsl(var(--muted-foreground))] max-w-xl mx-auto">
                Stop guessing whether a card is worth grading. Let the math
                decide.
              </p>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FadeIn delay={0}>
              <div className="hover-lift rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 h-full">
                <div className="w-12 h-12 rounded-lg bg-[hsl(var(--poke-red))/0.1] flex items-center justify-center mb-4">
                  <BarChart3 className="w-6 h-6 text-[var(--poke-red)]" />
                </div>
                <h3 className="text-lg font-bold mb-2">Expected value</h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                  Probability-weighted profit across PSA 10, 9, and 8 outcomes
                  with real fees factored in.
                </p>
              </div>
            </FadeIn>

            <FadeIn delay={150}>
              <div className="hover-lift rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 h-full">
                <div className="w-12 h-12 rounded-lg bg-[hsl(var(--poke-yellow))/0.1] flex items-center justify-center mb-4">
                  <Target className="w-6 h-6 text-[var(--poke-yellow)]" />
                </div>
                <h3 className="text-lg font-bold mb-2">Break-even analysis</h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                  Know exactly what PSA 10 probability you need to break even
                  before you ship.
                </p>
              </div>
            </FadeIn>

            <FadeIn delay={300}>
              <div className="hover-lift rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 h-full">
                <div className="w-12 h-12 rounded-lg bg-[hsl(var(--poke-blue))/0.1] flex items-center justify-center mb-4">
                  <Zap className="w-6 h-6 text-[var(--poke-blue)]" />
                </div>
                <h3 className="text-lg font-bold mb-2">Instant decision</h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                  Grade / Maybe / Don&rsquo;t Grade — a clear verdict in under
                  10 seconds.
                </p>
              </div>
            </FadeIn>
          </div>
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
                From card search to decision in seconds.
              </p>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Search your card",
                desc: "Find any Pok\u00e9mon card by name. Market prices are pulled automatically.",
              },
              {
                step: "2",
                title: "Set your numbers",
                desc: "Adjust grading cost, grade probabilities, and fees to match your situation.",
              },
              {
                step: "3",
                title: "Get the verdict",
                desc: "See expected profit, ROI, and a clear Grade / Don\u2019t Grade recommendation.",
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
              Ready to check a card?
            </h2>
            <p className="text-[hsl(var(--muted-foreground))] mb-8">
              No sign-up. No paywall. Just math.
            </p>
            <Link href="/calculator">
              <Button
                size="lg"
                className="text-base px-12 py-3 bg-[hsl(var(--poke-red))] text-white hover:opacity-90 shadow-lg hover-scale"
              >
                Check Your Card
              </Button>
            </Link>
          </div>
        </FadeIn>
      </section>
    </div>
  );
}
