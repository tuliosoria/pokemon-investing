"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GradingCalculator } from "@/components/calculator/grading-calculator";
import { FlipCalculator } from "@/components/calculator/flip-calculator";
import { SealedCalculator } from "@/components/calculator/sealed-calculator";

export default function CalculatorPage() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="border-b border-[hsl(var(--border))]">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/" className="text-xl font-bold text-[hsl(var(--foreground))]">
            PokéInvest
          </a>
          <span className="text-xs text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] px-2 py-1 rounded">
            Beta
          </span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Card Calculator</h1>
          <p className="text-[hsl(var(--muted-foreground))]">
            Run the numbers before you decide. No guessing.
          </p>
        </div>

        <Tabs defaultValue="grading">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="grading">Grading EV</TabsTrigger>
            <TabsTrigger value="flip">Flip ROI</TabsTrigger>
            <TabsTrigger value="sealed">Sealed ROI</TabsTrigger>
          </TabsList>

          <TabsContent value="grading">
            <Card>
              <CardHeader>
                <CardTitle>Should I grade this card?</CardTitle>
                <CardDescription>
                  Calculate expected value across possible grades. Enter the
                  card&apos;s raw value, graded values, and your probability
                  estimates.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GradingCalculator />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="flip">
            <Card>
              <CardHeader>
                <CardTitle>Is this flip worth it?</CardTitle>
                <CardDescription>
                  Calculate net profit and ROI after all marketplace fees,
                  shipping, and costs.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FlipCalculator />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sealed">
            <Card>
              <CardHeader>
                <CardTitle>Should I hold this sealed product?</CardTitle>
                <CardDescription>
                  Project returns over time with growth assumptions and exit
                  costs factored in.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SealedCalculator />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
