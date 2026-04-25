import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="mb-2 text-2xl font-bold">Product not found</h1>
      <p className="mb-6 text-[hsl(var(--muted-foreground))]">
        We couldn&apos;t find a sealed product with that slug.
      </p>
      <Link
        href="/sealed-forecast"
        className="text-[hsl(var(--poke-yellow))] underline"
      >
        ← Back to all forecasts
      </Link>
    </div>
  );
}
