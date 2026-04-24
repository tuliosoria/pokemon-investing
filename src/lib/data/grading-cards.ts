/**
 * Curated list of modern cards with high grading potential.
 * Each card has a pre-resolved PokeData ID to avoid search API calls.
 * Focus: modern chase cards (2020+) where grading data is reliable.
 */

export interface GradingCandidatePricing {
  rawPrice: number | null;
  gradedPrices: Partial<Record<"PSA 10.0" | "PSA 9.0" | "PSA 8.0" | "PSA 7.0" | "BGS 10.0", number>>;
  salesVolume: number | null;
  /** ISO timestamp of when this baseline snapshot was taken from the PriceCharting CSV. */
  capturedAt: string;
}

export interface GradingCandidate {
  pokedataId: string;
  tcgplayerId: string;
  name: string;
  set: string;
  number: string;
  rarity: string;
  /** Static baseline pricing snapshot from PriceCharting so the UI works
   *  even when the live PriceCharting/PokeData APIs are unavailable. */
  baselinePricing?: GradingCandidatePricing;
}

export const GRADING_CANDIDATES: GradingCandidate[] = [
  // === Evolving Skies Alt Arts (2021) — the gold standard ===
  {
    pokedataId: "8246",
    tcgplayerId: "246723",
    name: "Umbreon VMAX",
    set: "Evolving Skies",
    number: "215",
    rarity: "Alt Art Secret",
    baselinePricing: {
      rawPrice: 1579.84,
      gradedPrices: {
        "PSA 10.0": 4153.97,
        "PSA 9.0": 2092.0,
        "PSA 8.0": 1700.0,
        "PSA 7.0": 1485.16,
        "BGS 10.0": 4927.27,
      },
      salesVolume: 2292,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },
  {
    pokedataId: "8249",
    tcgplayerId: "246733",
    name: "Rayquaza VMAX",
    set: "Evolving Skies",
    number: "218",
    rarity: "Alt Art Secret",
    baselinePricing: {
      rawPrice: 830.0,
      gradedPrices: {
        "PSA 10.0": 2435.14,
        "PSA 9.0": 950.65,
        "PSA 8.0": 667.9,
        "PSA 7.0": 520.0,
        "BGS 10.0": 2116.58,
      },
      salesVolume: 1134,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },
  {
    pokedataId: "8243",
    tcgplayerId: "246704",
    name: "Sylveon VMAX",
    set: "Evolving Skies",
    number: "212",
    rarity: "Alt Art Secret",
    baselinePricing: {
      rawPrice: 334.0,
      gradedPrices: {
        "PSA 10.0": 659.28,
        "PSA 9.0": 353.0,
        "PSA 8.0": 293.87,
        "PSA 7.0": 290.0,
        "BGS 10.0": 850.0,
      },
      salesVolume: 1609,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },
  {
    pokedataId: "8239",
    tcgplayerId: "246755",
    name: "Glaceon VMAX",
    set: "Evolving Skies",
    number: "208",
    rarity: "Alt Art Secret",
    baselinePricing: {
      rawPrice: 31.82,
      gradedPrices: {
        "PSA 10.0": 84.99,
        "PSA 9.0": 39.0,
        "PSA 8.0": 24.48,
        "BGS 10.0": 101.74,
      },
      salesVolume: 540,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },
  {
    pokedataId: "8236",
    tcgplayerId: "246696",
    name: "Leafeon VMAX",
    set: "Evolving Skies",
    number: "205",
    rarity: "Alt Art Secret",
    baselinePricing: {
      rawPrice: 325.16,
      gradedPrices: {
        "PSA 10.0": 587.5,
        "PSA 9.0": 328.75,
        "PSA 8.0": 267.19,
        "PSA 7.0": 254.99,
        "BGS 10.0": 720.0,
      },
      salesVolume: 1142,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },
  {
    pokedataId: "8222",
    tcgplayerId: "246758",
    name: "Dragonite V",
    set: "Evolving Skies",
    number: "192",
    rarity: "Alt Art",
    baselinePricing: {
      rawPrice: 365.85,
      gradedPrices: {
        "PSA 10.0": 1079.61,
        "PSA 9.0": 404.01,
        "PSA 8.0": 342.7,
        "PSA 7.0": 81.69,
        "BGS 10.0": 2350.0,
      },
      salesVolume: 1569,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },

  // === Fusion Strike Alt Arts (2021) ===
  {
    pokedataId: "27946",
    tcgplayerId: "253176",
    name: "Mew VMAX",
    set: "Fusion Strike",
    number: "268",
    rarity: "Alt Art Secret",
    baselinePricing: {
      rawPrice: 72.69,
      gradedPrices: {
        "PSA 10.0": 209.75,
        "PSA 9.0": 71.87,
        "PSA 8.0": 46.0,
        "PSA 7.0": 21.84,
        "BGS 10.0": 250.0,
      },
      salesVolume: 970,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },
  {
    pokedataId: "27943",
    tcgplayerId: "253266",
    name: "Gengar VMAX",
    set: "Fusion Strike",
    number: "271",
    rarity: "Alt Art Secret",
    baselinePricing: {
      rawPrice: 713.18,
      gradedPrices: {
        "PSA 10.0": 2401.0,
        "PSA 9.0": 907.23,
        "PSA 8.0": 719.28,
        "PSA 7.0": 586.6,
        "BGS 10.0": 2216.49,
      },
      salesVolume: 2115,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },

  // === Brilliant Stars (2022) ===
  {
    pokedataId: "41237",
    tcgplayerId: "263893",
    name: "Charizard VSTAR",
    set: "Brilliant Stars",
    number: "174",
    rarity: "Rainbow Secret",
    baselinePricing: {
      rawPrice: 62.3,
      gradedPrices: {
        "PSA 10.0": 242.5,
        "PSA 9.0": 83.5,
        "PSA 8.0": 54.11,
        "PSA 7.0": 45.51,
        "BGS 10.0": 243.75,
      },
      salesVolume: 1246,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },
  {
    pokedataId: "41227",
    tcgplayerId: "263896",
    name: "Arceus VSTAR",
    set: "Brilliant Stars",
    number: "176",
    rarity: "Rainbow Secret",
    baselinePricing: {
      rawPrice: 12.5,
      gradedPrices: {
        "PSA 10.0": 62.0,
        "PSA 9.0": 25.82,
        "PSA 8.0": 21.25,
        "PSA 7.0": 10.79,
        "BGS 10.0": 66.93,
      },
      salesVolume: 479,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },

  // === Lost Origin / Silver Tempest Alt Arts (2022) ===
  {
    pokedataId: "43951",
    tcgplayerId: "284137",
    name: "Giratina V",
    set: "Lost Origin",
    number: "186",
    rarity: "Alt Art",
    baselinePricing: {
      rawPrice: 629.99,
      gradedPrices: {
        "PSA 10.0": 2875.0,
        "PSA 9.0": 790.0,
        "PSA 8.0": 631.0,
        "PSA 7.0": 505.54,
        "BGS 10.0": 2875.0,
      },
      salesVolume: 918,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },
  {
    pokedataId: "57452",
    tcgplayerId: "451834",
    name: "Lugia V",
    set: "Silver Tempest",
    number: "186",
    rarity: "Alt Art",
    baselinePricing: {
      rawPrice: 428.5,
      gradedPrices: {
        "PSA 10.0": 1232.0,
        "PSA 9.0": 475.28,
        "PSA 8.0": 363.31,
        "PSA 7.0": 279.99,
        "BGS 10.0": 2050.0,
      },
      salesVolume: 2801,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },

  // === Vivid Voltage (2020) ===
  {
    pokedataId: "154",
    tcgplayerId: "226432",
    name: "Pikachu VMAX",
    set: "Vivid Voltage",
    number: "044",
    rarity: "Rainbow Rare",
    baselinePricing: {
      rawPrice: 8.97,
      gradedPrices: {
        "PSA 10.0": 85.88,
        "PSA 9.0": 23.45,
        "PSA 8.0": 19.84,
        "PSA 7.0": 9.99,
        "BGS 10.0": 109.65,
      },
      salesVolume: 1013,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },

  // === Scarlet & Violet Era SARs (2023+) ===
  {
    pokedataId: "61622",
    tcgplayerId: "509989",
    name: "Charizard ex",
    set: "Obsidian Flames",
    number: "228",
    rarity: "Special Art Rare",
    baselinePricing: {
      rawPrice: 37.65,
      gradedPrices: {
        "PSA 10.0": 270.22,
        "PSA 9.0": 56.03,
        "PSA 8.0": 39.08,
        "PSA 7.0": 31.19,
        "BGS 10.0": 351.0,
      },
      salesVolume: 2190,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },
  {
    pokedataId: "62848",
    tcgplayerId: "517045",
    name: "Charizard ex",
    set: "Pokemon Card 151",
    number: "199",
    rarity: "Special Art Rare",
    baselinePricing: {
      rawPrice: 393.83,
      gradedPrices: {
        "PSA 10.0": 1794.0,
        "PSA 9.0": 427.5,
        "PSA 8.0": 354.27,
        "PSA 7.0": 225.0,
        "BGS 10.0": 4550.0,
      },
      salesVolume: 2835,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },
  {
    pokedataId: "62998",
    tcgplayerId: "517051",
    name: "Mew ex",
    set: "Pokemon Card 151",
    number: "205",
    rarity: "Special Art Rare",
    baselinePricing: {
      rawPrice: 26.69,
      gradedPrices: {
        "PSA 10.0": 239.5,
        "PSA 9.0": 42.85,
        "PSA 8.0": 26.27,
        "PSA 7.0": 13.25,
        "BGS 10.0": 311.0,
      },
      salesVolume: 1101,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },
  {
    pokedataId: "60000",
    tcgplayerId: "497689",
    name: "Iono",
    set: "Paldea Evolved",
    number: "269",
    rarity: "Special Art Rare",
    baselinePricing: {
      rawPrice: 51.64,
      gradedPrices: {
        "PSA 10.0": 165.0,
        "PSA 9.0": 57.29,
        "PSA 8.0": 49.64,
        "BGS 10.0": 1000.0,
      },
      salesVolume: 1071,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },
  {
    pokedataId: "59073",
    tcgplayerId: "490043",
    name: "Miraidon ex",
    set: "Scarlet & Violet",
    number: "253",
    rarity: "Special Art Rare",
    baselinePricing: {
      rawPrice: 6.88,
      gradedPrices: {
        "PSA 10.0": 64.19,
        "PSA 9.0": 16.0,
        "PSA 8.0": 10.88,
        "PSA 7.0": 9.0,
        "BGS 10.0": 83.0,
      },
      salesVolume: 387,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },
  {
    pokedataId: "3333",
    tcgplayerId: "241673",
    name: "Blaziken VMAX",
    set: "Chilling Reign",
    number: "201",
    rarity: "Alt Art Secret",
    baselinePricing: {
      rawPrice: 335.75,
      gradedPrices: {
        "PSA 10.0": 735.5,
        "PSA 9.0": 356.8,
        "PSA 8.0": 295.0,
        "PSA 7.0": 115.5,
        "BGS 10.0": 1377.5,
      },
      salesVolume: 1045,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },
  {
    pokedataId: "1110",
    tcgplayerId: "234060",
    name: "Tyranitar V",
    set: "Battle Styles",
    number: "155",
    rarity: "Alt Art",
    baselinePricing: {
      rawPrice: 219.23,
      gradedPrices: {
        "PSA 10.0": 787.5,
        "PSA 9.0": 237.52,
        "PSA 8.0": 184.2,
        "PSA 7.0": 87.5,
        "BGS 10.0": 885.58,
      },
      salesVolume: 1258,
      capturedAt: "2026-04-24T00:00:00Z",
    },
  },
];
