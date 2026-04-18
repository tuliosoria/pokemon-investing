export type ProductType =
  | "Booster Box"
  | "Elite Trainer Box"
  | "Booster Bundle"
  | "Collection Box"
  | "Tin"
  | "Ultra Premium Collection"
  | "Blister Pack";

export interface SealedProduct {
  id: string;
  name: string;
  set: string;
  type: ProductType;
  releaseYear: number;
  msrp: number;
  estimatedMarket: number;
  image?: string;
}

/**
 * Curated database of popular Pokémon sealed products.
 * Market estimates are approximate — users should verify and adjust.
 * Prices reflect US market as of early 2026.
 */
export const SEALED_PRODUCTS: SealedProduct[] = [
  // ─── 2024–2026 Modern Era ─────────────────────────
  {
    id: "sv08-bb",
    name: "Surging Sparks Booster Box",
    set: "Surging Sparks",
    type: "Booster Box",
    releaseYear: 2024,
    msrp: 143.64,
    estimatedMarket: 115,
  },
  {
    id: "sv08-etb",
    name: "Surging Sparks Elite Trainer Box",
    set: "Surging Sparks",
    type: "Elite Trainer Box",
    releaseYear: 2024,
    msrp: 49.99,
    estimatedMarket: 42,
  },
  {
    id: "sv07-bb",
    name: "Stellar Crown Booster Box",
    set: "Stellar Crown",
    type: "Booster Box",
    releaseYear: 2024,
    msrp: 143.64,
    estimatedMarket: 105,
  },
  {
    id: "sv06-bb",
    name: "Twilight Masquerade Booster Box",
    set: "Twilight Masquerade",
    type: "Booster Box",
    releaseYear: 2024,
    msrp: 143.64,
    estimatedMarket: 120,
  },
  {
    id: "sv05-bb",
    name: "Temporal Forces Booster Box",
    set: "Temporal Forces",
    type: "Booster Box",
    releaseYear: 2024,
    msrp: 143.64,
    estimatedMarket: 165,
  },
  {
    id: "sv04-bb",
    name: "Paradox Rift Booster Box",
    set: "Paradox Rift",
    type: "Booster Box",
    releaseYear: 2023,
    msrp: 143.64,
    estimatedMarket: 130,
  },
  {
    id: "sv03-bb",
    name: "Obsidian Flames Booster Box",
    set: "Obsidian Flames",
    type: "Booster Box",
    releaseYear: 2023,
    msrp: 143.64,
    estimatedMarket: 115,
  },
  {
    id: "sv02-bb",
    name: "Paldea Evolved Booster Box",
    set: "Paldea Evolved",
    type: "Booster Box",
    releaseYear: 2023,
    msrp: 143.64,
    estimatedMarket: 130,
  },
  {
    id: "sv01-bb",
    name: "Scarlet & Violet Base Booster Box",
    set: "Scarlet & Violet",
    type: "Booster Box",
    releaseYear: 2023,
    msrp: 143.64,
    estimatedMarket: 140,
  },
  {
    id: "sv-151-bb",
    name: "151 Booster Bundle (6 packs)",
    set: "151",
    type: "Booster Bundle",
    releaseYear: 2023,
    msrp: 23.99,
    estimatedMarket: 32,
  },
  {
    id: "sv-151-etb",
    name: "151 Elite Trainer Box",
    set: "151",
    type: "Elite Trainer Box",
    releaseYear: 2023,
    msrp: 49.99,
    estimatedMarket: 65,
  },
  {
    id: "sv-151-upc",
    name: "151 Ultra Premium Collection",
    set: "151",
    type: "Ultra Premium Collection",
    releaseYear: 2023,
    msrp: 99.99,
    estimatedMarket: 145,
  },

  // ─── Sword & Shield Era ────────────────────────────
  {
    id: "swsh12-bb",
    name: "Crown Zenith Booster Box (case of 10 tins)",
    set: "Crown Zenith",
    type: "Booster Box",
    releaseYear: 2023,
    msrp: 249.90,
    estimatedMarket: 280,
  },
  {
    id: "swsh12-etb",
    name: "Crown Zenith Elite Trainer Box",
    set: "Crown Zenith",
    type: "Elite Trainer Box",
    releaseYear: 2023,
    msrp: 49.99,
    estimatedMarket: 60,
  },
  {
    id: "swsh11-bb",
    name: "Lost Origin Booster Box",
    set: "Lost Origin",
    type: "Booster Box",
    releaseYear: 2022,
    msrp: 143.64,
    estimatedMarket: 155,
  },
  {
    id: "swsh10-bb",
    name: "Astral Radiance Booster Box",
    set: "Astral Radiance",
    type: "Booster Box",
    releaseYear: 2022,
    msrp: 143.64,
    estimatedMarket: 160,
  },
  {
    id: "swsh09-bb",
    name: "Brilliant Stars Booster Box",
    set: "Brilliant Stars",
    type: "Booster Box",
    releaseYear: 2022,
    msrp: 143.64,
    estimatedMarket: 190,
  },
  {
    id: "swsh08-bb",
    name: "Fusion Strike Booster Box",
    set: "Fusion Strike",
    type: "Booster Box",
    releaseYear: 2021,
    msrp: 143.64,
    estimatedMarket: 135,
  },
  {
    id: "swsh07-bb",
    name: "Evolving Skies Booster Box",
    set: "Evolving Skies",
    type: "Booster Box",
    releaseYear: 2021,
    msrp: 143.64,
    estimatedMarket: 380,
  },
  {
    id: "swsh07-etb",
    name: "Evolving Skies Elite Trainer Box",
    set: "Evolving Skies",
    type: "Elite Trainer Box",
    releaseYear: 2021,
    msrp: 49.99,
    estimatedMarket: 95,
  },
  {
    id: "swsh06-bb",
    name: "Chilling Reign Booster Box",
    set: "Chilling Reign",
    type: "Booster Box",
    releaseYear: 2021,
    msrp: 143.64,
    estimatedMarket: 175,
  },
  {
    id: "swsh05-bb",
    name: "Battle Styles Booster Box",
    set: "Battle Styles",
    type: "Booster Box",
    releaseYear: 2021,
    msrp: 143.64,
    estimatedMarket: 145,
  },
  {
    id: "swsh04-bb",
    name: "Vivid Voltage Booster Box",
    set: "Vivid Voltage",
    type: "Booster Box",
    releaseYear: 2020,
    msrp: 143.64,
    estimatedMarket: 240,
  },
  {
    id: "swsh03-bb",
    name: "Darkness Ablaze Booster Box",
    set: "Darkness Ablaze",
    type: "Booster Box",
    releaseYear: 2020,
    msrp: 143.64,
    estimatedMarket: 195,
  },
  {
    id: "swsh02-bb",
    name: "Rebel Clash Booster Box",
    set: "Rebel Clash",
    type: "Booster Box",
    releaseYear: 2020,
    msrp: 143.64,
    estimatedMarket: 180,
  },
  {
    id: "swsh01-bb",
    name: "Sword & Shield Base Booster Box",
    set: "Sword & Shield",
    type: "Booster Box",
    releaseYear: 2020,
    msrp: 143.64,
    estimatedMarket: 210,
  },
  {
    id: "cel25-etb",
    name: "Celebrations Elite Trainer Box",
    set: "Celebrations",
    type: "Elite Trainer Box",
    releaseYear: 2021,
    msrp: 49.99,
    estimatedMarket: 85,
  },
  {
    id: "cel25-upc",
    name: "Celebrations Ultra Premium Collection",
    set: "Celebrations",
    type: "Ultra Premium Collection",
    releaseYear: 2021,
    msrp: 119.99,
    estimatedMarket: 310,
  },

  // ─── Sun & Moon Era ────────────────────────────────
  {
    id: "sm12-bb",
    name: "Cosmic Eclipse Booster Box",
    set: "Cosmic Eclipse",
    type: "Booster Box",
    releaseYear: 2019,
    msrp: 143.64,
    estimatedMarket: 420,
  },
  {
    id: "sm11-bb",
    name: "Unified Minds Booster Box",
    set: "Unified Minds",
    type: "Booster Box",
    releaseYear: 2019,
    msrp: 143.64,
    estimatedMarket: 350,
  },
  {
    id: "sm10-bb",
    name: "Unbroken Bonds Booster Box",
    set: "Unbroken Bonds",
    type: "Booster Box",
    releaseYear: 2019,
    msrp: 143.64,
    estimatedMarket: 500,
  },
  {
    id: "sm09-bb",
    name: "Team Up Booster Box",
    set: "Team Up",
    type: "Booster Box",
    releaseYear: 2019,
    msrp: 143.64,
    estimatedMarket: 520,
  },
  {
    id: "sm08-bb",
    name: "Lost Thunder Booster Box",
    set: "Lost Thunder",
    type: "Booster Box",
    releaseYear: 2018,
    msrp: 143.64,
    estimatedMarket: 380,
  },
  {
    id: "sm06-bb",
    name: "Forbidden Light Booster Box",
    set: "Forbidden Light",
    type: "Booster Box",
    releaseYear: 2018,
    msrp: 143.64,
    estimatedMarket: 340,
  },
  {
    id: "sm05-bb",
    name: "Ultra Prism Booster Box",
    set: "Ultra Prism",
    type: "Booster Box",
    releaseYear: 2018,
    msrp: 143.64,
    estimatedMarket: 470,
  },
  {
    id: "sm35-bb",
    name: "Hidden Fates Elite Trainer Box",
    set: "Hidden Fates",
    type: "Elite Trainer Box",
    releaseYear: 2019,
    msrp: 49.99,
    estimatedMarket: 110,
  },
  {
    id: "sm115-bb",
    name: "Hidden Fates Tin (set of 3)",
    set: "Hidden Fates",
    type: "Tin",
    releaseYear: 2019,
    msrp: 62.97,
    estimatedMarket: 130,
  },

  // ─── XY Era ────────────────────────────────────────
  {
    id: "xy12-bb",
    name: "Evolutions Booster Box",
    set: "Evolutions",
    type: "Booster Box",
    releaseYear: 2016,
    msrp: 143.64,
    estimatedMarket: 900,
  },
  {
    id: "xy12-etb",
    name: "Evolutions Elite Trainer Box (Charizard)",
    set: "Evolutions",
    type: "Elite Trainer Box",
    releaseYear: 2016,
    msrp: 39.99,
    estimatedMarket: 250,
  },
  {
    id: "xy11-bb",
    name: "Steam Siege Booster Box",
    set: "Steam Siege",
    type: "Booster Box",
    releaseYear: 2016,
    msrp: 143.64,
    estimatedMarket: 380,
  },
  {
    id: "xy09-bb",
    name: "BREAKpoint Booster Box",
    set: "BREAKpoint",
    type: "Booster Box",
    releaseYear: 2016,
    msrp: 143.64,
    estimatedMarket: 450,
  },
  {
    id: "xy08-bb",
    name: "BREAKthrough Booster Box",
    set: "BREAKthrough",
    type: "Booster Box",
    releaseYear: 2015,
    msrp: 143.64,
    estimatedMarket: 420,
  },

  // ─── Ultra Premium / Special Collections ───────────
  {
    id: "sv-upc-char",
    name: "Charizard Ultra Premium Collection",
    set: "Scarlet & Violet",
    type: "Ultra Premium Collection",
    releaseYear: 2023,
    msrp: 99.99,
    estimatedMarket: 180,
  },
  {
    id: "swsh-upc-char",
    name: "Charizard UPC (Sword & Shield)",
    set: "Sword & Shield",
    type: "Ultra Premium Collection",
    releaseYear: 2022,
    msrp: 119.99,
    estimatedMarket: 350,
  },
];

/** All unique product types in the database */
export const PRODUCT_TYPES: ProductType[] = [
  "Booster Box",
  "Elite Trainer Box",
  "Ultra Premium Collection",
  "Booster Bundle",
  "Collection Box",
  "Tin",
  "Blister Pack",
];

/** Search sealed products by name/set with optional type filter */
export function searchSealedProducts(
  query: string,
  typeFilter?: ProductType
): SealedProduct[] {
  const q = query.toLowerCase().trim();
  return SEALED_PRODUCTS.filter((p) => {
    if (typeFilter && p.type !== typeFilter) return false;
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.set.toLowerCase().includes(q) ||
      p.type.toLowerCase().includes(q)
    );
  });
}
