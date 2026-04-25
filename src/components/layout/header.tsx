"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/calculator", label: "Grade Check" },
  { href: "/sealed-forecast", label: "Sealed Forecast" },
];

export function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[hsl(var(--border))] bg-[hsl(var(--background))/0.95] backdrop-blur supports-[backdrop-filter]:bg-[hsl(var(--background))/0.8]">
      {/* Brand stripe */}
      <div className="pokeball-divider" />

      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-full bg-[hsl(var(--poke-red))] flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
              <div className="w-3 h-3 rounded-full bg-white border-2 border-[hsl(var(--poke-blue))]" />
            </div>
            <span className="text-lg font-bold tracking-tight">
              <span className="text-[hsl(var(--poke-red))]">Poke</span>
              <span className="text-[hsl(var(--poke-yellow))]">Future</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-[hsl(var(--poke-red))]",
                  pathname === link.href
                    ? "text-[hsl(var(--poke-red))]"
                    : "text-[hsl(var(--muted-foreground))]"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Mobile menu button */}
          <button
            type="button"
            className="md:hidden p-2 text-[hsl(var(--muted-foreground))]"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Nav */}
        {mobileOpen && (
          <nav className="md:hidden pb-4 border-t border-[hsl(var(--border))] pt-3 animate-fade-in">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "block py-2 text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "text-[hsl(var(--poke-red))]"
                    : "text-[hsl(var(--muted-foreground))]"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
