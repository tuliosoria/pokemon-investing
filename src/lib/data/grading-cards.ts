/**
 * Curated list of modern cards with high grading potential.
 * Each card has a pre-resolved PokeData ID to avoid search API calls.
 * Focus: modern chase cards (2020+) where grading data is reliable.
 */

export interface GradingCandidate {
  pokedataId: string;
  tcgplayerId: string;
  name: string;
  set: string;
  number: string;
  rarity: string;
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
  },
  {
    pokedataId: "8249",
    tcgplayerId: "246733",
    name: "Rayquaza VMAX",
    set: "Evolving Skies",
    number: "218",
    rarity: "Alt Art Secret",
  },
  {
    pokedataId: "8243",
    tcgplayerId: "246704",
    name: "Sylveon VMAX",
    set: "Evolving Skies",
    number: "212",
    rarity: "Alt Art Secret",
  },
  {
    pokedataId: "8239",
    tcgplayerId: "246755",
    name: "Glaceon VMAX",
    set: "Evolving Skies",
    number: "208",
    rarity: "Alt Art Secret",
  },
  {
    pokedataId: "8236",
    tcgplayerId: "246696",
    name: "Leafeon VMAX",
    set: "Evolving Skies",
    number: "205",
    rarity: "Alt Art Secret",
  },
  {
    pokedataId: "8222",
    tcgplayerId: "246758",
    name: "Dragonite V",
    set: "Evolving Skies",
    number: "192",
    rarity: "Alt Art",
  },

  // === Fusion Strike Alt Arts (2021) ===
  {
    pokedataId: "27946",
    tcgplayerId: "253176",
    name: "Mew VMAX",
    set: "Fusion Strike",
    number: "268",
    rarity: "Alt Art Secret",
  },
  {
    pokedataId: "27943",
    tcgplayerId: "253266",
    name: "Gengar VMAX",
    set: "Fusion Strike",
    number: "271",
    rarity: "Alt Art Secret",
  },

  // === Brilliant Stars (2022) ===
  {
    pokedataId: "41237",
    tcgplayerId: "263893",
    name: "Charizard VSTAR",
    set: "Brilliant Stars",
    number: "174",
    rarity: "Rainbow Secret",
  },
  {
    pokedataId: "41227",
    tcgplayerId: "263896",
    name: "Arceus VSTAR",
    set: "Brilliant Stars",
    number: "176",
    rarity: "Rainbow Secret",
  },

  // === Lost Origin / Silver Tempest Alt Arts (2022) ===
  {
    pokedataId: "43951",
    tcgplayerId: "284137",
    name: "Giratina V",
    set: "Lost Origin",
    number: "186",
    rarity: "Alt Art",
  },
  {
    pokedataId: "57452",
    tcgplayerId: "451834",
    name: "Lugia V",
    set: "Silver Tempest",
    number: "186",
    rarity: "Alt Art",
  },

  // === Vivid Voltage (2020) ===
  {
    pokedataId: "154",
    tcgplayerId: "226432",
    name: "Pikachu VMAX",
    set: "Vivid Voltage",
    number: "044",
    rarity: "Rainbow Rare",
  },

  // === Scarlet & Violet Era SARs (2023+) ===
  {
    pokedataId: "61622",
    tcgplayerId: "509989",
    name: "Charizard ex",
    set: "Obsidian Flames",
    number: "228",
    rarity: "Special Art Rare",
  },
  {
    pokedataId: "62848",
    tcgplayerId: "517045",
    name: "Charizard ex",
    set: "Pokemon Card 151",
    number: "199",
    rarity: "Special Art Rare",
  },
  {
    pokedataId: "62998",
    tcgplayerId: "517051",
    name: "Mew ex",
    set: "Pokemon Card 151",
    number: "205",
    rarity: "Special Art Rare",
  },
  {
    pokedataId: "60000",
    tcgplayerId: "497689",
    name: "Iono",
    set: "Paldea Evolved",
    number: "269",
    rarity: "Special Art Rare",
  },
  {
    pokedataId: "59073",
    tcgplayerId: "490043",
    name: "Miraidon ex",
    set: "Scarlet & Violet",
    number: "253",
    rarity: "Special Art Rare",
  },
  {
    pokedataId: "3333",
    tcgplayerId: "241673",
    name: "Blaziken VMAX",
    set: "Chilling Reign",
    number: "201",
    rarity: "Alt Art Secret",
  },
  {
    pokedataId: "1110",
    tcgplayerId: "234060",
    name: "Tyranitar V",
    set: "Battle Styles",
    number: "155",
    rarity: "Alt Art",
  },
];
