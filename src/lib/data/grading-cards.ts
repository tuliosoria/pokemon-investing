/**
 * Curated list of modern cards with high grading potential.
 * Each card has a pre-resolved PokeData ID to avoid search API calls.
 * Focus: modern chase cards (2020+) where grading data is reliable.
 */

export interface GradingCandidate {
  pokedataId: string;
  name: string;
  set: string;
  number: string;
  rarity: string;
}

export const GRADING_CANDIDATES: GradingCandidate[] = [
  // === Evolving Skies Alt Arts (2021) — the gold standard ===
  {
    pokedataId: "8246",
    name: "Umbreon VMAX",
    set: "Evolving Skies",
    number: "215",
    rarity: "Alt Art Secret",
  },
  {
    pokedataId: "8249",
    name: "Rayquaza VMAX",
    set: "Evolving Skies",
    number: "218",
    rarity: "Alt Art Secret",
  },
  {
    pokedataId: "8243",
    name: "Sylveon VMAX",
    set: "Evolving Skies",
    number: "212",
    rarity: "Alt Art Secret",
  },
  {
    pokedataId: "8239",
    name: "Glaceon VMAX",
    set: "Evolving Skies",
    number: "208",
    rarity: "Alt Art Secret",
  },
  {
    pokedataId: "8236",
    name: "Leafeon VMAX",
    set: "Evolving Skies",
    number: "205",
    rarity: "Alt Art Secret",
  },
  {
    pokedataId: "8222",
    name: "Dragonite V",
    set: "Evolving Skies",
    number: "192",
    rarity: "Alt Art",
  },

  // === Fusion Strike Alt Arts (2021) ===
  {
    pokedataId: "27946",
    name: "Mew VMAX",
    set: "Fusion Strike",
    number: "268",
    rarity: "Alt Art Secret",
  },
  {
    pokedataId: "27943",
    name: "Gengar VMAX",
    set: "Fusion Strike",
    number: "271",
    rarity: "Alt Art Secret",
  },

  // === Brilliant Stars (2022) ===
  {
    pokedataId: "41237",
    name: "Charizard VSTAR",
    set: "Brilliant Stars",
    number: "174",
    rarity: "Rainbow Secret",
  },
  {
    pokedataId: "41227",
    name: "Arceus VSTAR",
    set: "Brilliant Stars",
    number: "176",
    rarity: "Rainbow Secret",
  },

  // === Lost Origin / Silver Tempest Alt Arts (2022) ===
  {
    pokedataId: "43951",
    name: "Giratina V",
    set: "Lost Origin",
    number: "186",
    rarity: "Alt Art",
  },
  {
    pokedataId: "57452",
    name: "Lugia V",
    set: "Silver Tempest",
    number: "186",
    rarity: "Alt Art",
  },

  // === Vivid Voltage (2020) ===
  {
    pokedataId: "154",
    name: "Pikachu VMAX",
    set: "Vivid Voltage",
    number: "044",
    rarity: "Rainbow Rare",
  },

  // === Scarlet & Violet Era SARs (2023+) ===
  {
    pokedataId: "61622",
    name: "Charizard ex",
    set: "Obsidian Flames",
    number: "228",
    rarity: "Special Art Rare",
  },
  {
    pokedataId: "62848",
    name: "Charizard ex",
    set: "Pokemon Card 151",
    number: "199",
    rarity: "Special Art Rare",
  },
  {
    pokedataId: "62998",
    name: "Mew ex",
    set: "Pokemon Card 151",
    number: "205",
    rarity: "Special Art Rare",
  },
  {
    pokedataId: "60000",
    name: "Iono",
    set: "Paldea Evolved",
    number: "269",
    rarity: "Special Art Rare",
  },
  {
    pokedataId: "59073",
    name: "Miraidon ex",
    set: "Scarlet & Violet",
    number: "253",
    rarity: "Special Art Rare",
  },
  {
    pokedataId: "3333",
    name: "Blaziken VMAX",
    set: "Chilling Reign",
    number: "201",
    rarity: "Alt Art Secret",
  },
  {
    pokedataId: "1110",
    name: "Tyranitar V",
    set: "Battle Styles",
    number: "155",
    rarity: "Alt Art",
  },
];
