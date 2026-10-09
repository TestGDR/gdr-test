// Catalogo del regolamento (documento "Combattimento, armi e danni", sezioni 7-9).
// Si importa da Gestione -> Oggetti: i costi in Risorse diventano monete con il
// cambio impostato li'.
import { armorPieceCost } from "./combat.ts";
import type { ArmorPart } from "./combat-config.ts";

export type CatalogItem = {
  name: string;
  description: string;
  kind: "arma" | "scudo" | "armatura" | "munizione" | "altro";
  category: "Armi" | "Armature" | "Consumabili" | "Varie";
  costR: number;
  weight_kg: number | null;
  // arma
  weapon_category?: "mischia" | "distanza";
  skill?: string;
  damage?: string;
  damage_type?: "taglio" | "perforante" | "contundente";
  hands?: "1" | "2" | "1-2";
  aff_max?: number;
  body_min?: number;
  reach_m?: number;
  range_m?: number;
  reload_actions?: number;
  pierce?: number;
  effects?: string[];
  ammo_type?: "frecce" | "quadrelli";
  // scudo
  parry_bonus?: number;
  bash_dice?: string;
  attack_penalty?: number;
  // armatura
  armor_part?: ArmorPart;
  material?: string;
  sp_max?: number;
  encumbrance?: number;
  // munizione
  ammo_capacity?: number;
};

const ATL = "Armi da taglio leggere";
const ATP = "Armi da taglio pesanti";
const AI = "Armi da impatto";
const AA = "Armi in asta";
const AT = "Armi da tiro";

type M = [
  name: string,
  skill: string,
  damage: string,
  type: "taglio" | "perforante" | "contundente",
  hands: "1" | "2" | "1-2",
  aff: number,
  weight: number,
  bodyMin: number,
  reach: number,
  pierce: number,
  effects: string[],
  cost: number,
];
const MELEE: M[] = [
  [
    "Pugnale",
    ATL,
    "2d6",
    "perforante",
    "1",
    10,
    0.5,
    2,
    0.5,
    0,
    ["occultabile", "estrazione_rapida"],
    0,
  ],
  [
    "Daga da misericordia",
    ATL,
    "2d6",
    "perforante",
    "1",
    8,
    0.5,
    2,
    0.5,
    3,
    ["occultabile"],
    1,
  ],
  [
    "Spada corta",
    ATL,
    "3d6",
    "taglio",
    "1",
    12,
    1,
    3,
    0.8,
    0,
    ["estrazione_rapida"],
    0,
  ],
  [
    "Stocco",
    ATL,
    "3d6",
    "perforante",
    "1",
    10,
    1,
    3,
    1.1,
    0,
    ["rapida", "bilanciata"],
    1,
  ],
  [
    "Spada lunga",
    ATP,
    "4d6",
    "taglio",
    "1-2",
    12,
    1.5,
    4,
    1.1,
    0,
    ["bilanciata"],
    1,
  ],
  ["Spadone", ATP, "5d6", "taglio", "2", 10, 3, 5, 1.4, 0, ["lunga"], 2],
  [
    "Arakh dothraki",
    ATP,
    "4d6",
    "taglio",
    "1",
    10,
    1.8,
    4,
    1,
    0,
    ["rapida", "sanguinante"],
    1,
  ],
  [
    "Ascia da guerra",
    ATP,
    "4d6",
    "taglio",
    "1",
    10,
    2,
    4,
    1,
    2,
    ["sanguinante"],
    1,
  ],
  ["Mazza", AI, "3d6", "contundente", "1", 15, 2, 3, 0.9, 2, ["stordente"], 0],
  [
    "Martello da guerra",
    AI,
    "4d6",
    "contundente",
    "2",
    12,
    3,
    5,
    1,
    3,
    ["stordente"],
    1,
  ],
  [
    "Lancia",
    AA,
    "3d6",
    "perforante",
    "1-2",
    8,
    2,
    3,
    2,
    0,
    ["lunga", "da_carica"],
    0,
  ],
  [
    "Lancia da giostra",
    AA,
    "4d6",
    "perforante",
    "1",
    1,
    4,
    5,
    3,
    0,
    ["da_carica", "si_spezza"],
    1,
  ],
  ["Alabarda", AA, "5d6", "taglio", "2", 8, 3, 5, 2.2, 1, ["lunga"], 2],
];

type R = [
  name: string,
  damage: string,
  hands: "1" | "2",
  aff: number,
  weight: number,
  bodyMin: number,
  range: number,
  reload: number,
  pierce: number,
  cost: number,
  ammo: "frecce" | "quadrelli" | null,
];
const RANGED: R[] = [
  ["Arco corto", "3d6", "2", 8, 1, 3, 50, 0, 0, 0, "frecce"],
  ["Arco lungo", "4d6", "2", 8, 1.5, 5, 100, 0, 1, 1, "frecce"],
  ["Balestra", "4d6", "2", 10, 3, 3, 80, 1, 1, 1, "quadrelli"],
  ["Balestra pesante", "5d6", "2", 10, 5, 4, 100, 2, 2, 2, "quadrelli"],
  ["Giavellotto", "3d6", "1", 8, 1, 3, 25, 0, 0, 0, null],
];

const SHIELDS: [string, number, string, number, number, number, number][] = [
  ["Targa", 1, "1d6", 15, 2, 0, 0],
  ["Scudo rotondo", 2, "1d6", 20, 3, 0, 0],
  ["Scudo a goccia", 2, "1d6", 20, 4, 0, 1],
  ["Pavese", 3, "1d6", 25, 6, -1, 1],
];

// materiale, SP, ingombro (elmo/corazza/bracciali/schinieri), peso (idem), costo del set
const MATERIALS: [string, string, number, number[], number[], number][] = [
  ["imbottito", "imbottito", 3, [0, 0, 0, 0], [0.4, 2, 0.8, 0.8], 0],
  ["cuoio-bollito", "cuoio bollito", 5, [0, 0, 0, 0], [0.8, 4, 1.6, 1.6], 0],
  ["brigantina", "brigantina", 7, [0, -1, 0, 0], [1.2, 6, 2.4, 2.4], 1],
  ["maglia", "maglia", 10, [0, -1, 0, 0], [1.8, 9, 3.6, 3.6], 2],
  ["piastre", "piastre", 14, [0, -1, -1, -1], [2.5, 12.5, 5, 5], 3],
];
const PIECES: [ArmorPart, string][] = [
  ["testa", "Elmo"],
  ["tronco", "Corazza"],
  ["braccia", "Bracciali"],
  ["gambe", "Schinieri"],
];

export const COMBAT_CATALOG: CatalogItem[] = [
  ...MELEE.map(
    ([
      name,
      skill,
      damage,
      damage_type,
      hands,
      aff,
      weight,
      bodyMin,
      reach,
      pierce,
      effects,
      cost,
    ]) => ({
      name,
      description: "",
      kind: "arma" as const,
      category: "Armi" as const,
      costR: cost,
      weight_kg: weight,
      weapon_category: "mischia" as const,
      skill,
      damage,
      damage_type,
      hands,
      aff_max: aff,
      body_min: bodyMin,
      reach_m: reach,
      pierce,
      effects,
    }),
  ),
  ...RANGED.map(
    ([
      name,
      damage,
      hands,
      aff,
      weight,
      bodyMin,
      range,
      reload,
      pierce,
      cost,
      ammo,
    ]) => ({
      name,
      description: ammo
        ? `Serve una scorta di ${ammo}.`
        : "Dopo il tiro va recuperato.",
      kind: "arma" as const,
      category: "Armi" as const,
      costR: cost,
      weight_kg: weight,
      weapon_category: "distanza" as const,
      skill: AT,
      damage,
      damage_type: "perforante" as const,
      hands,
      aff_max: aff,
      body_min: bodyMin,
      range_m: range,
      reload_actions: reload,
      pierce,
      effects: [],
      ammo_type: ammo ?? undefined,
    }),
  ),
  ...SHIELDS.map(([name, parry, bash, aff, weight, penalty, cost]) => ({
    name,
    description: "",
    kind: "scudo" as const,
    category: "Armi" as const,
    costR: cost,
    weight_kg: weight,
    parry_bonus: parry,
    bash_dice: bash,
    aff_max: aff,
    attack_penalty: penalty,
  })),
  ...MATERIALS.flatMap(([id, label, sp, enc, weights, setCost]) =>
    PIECES.map(([part, piece], i) => ({
      name: `${piece} (${label})`,
      description: "",
      kind: "armatura" as const,
      category: "Armature" as const,
      costR: armorPieceCost(setCost, part),
      weight_kg: weights[i],
      armor_part: part,
      material: id,
      sp_max: sp,
      encumbrance: enc[i],
    })),
  ),
  {
    name: "Faretra di frecce",
    description: "20 frecce per archi.",
    kind: "munizione",
    category: "Consumabili",
    costR: 0,
    weight_kg: 1,
    ammo_type: "frecce",
    ammo_capacity: 20,
  },
  {
    name: "Astuccio di quadrelli",
    description: "20 quadrelli per balestre.",
    kind: "munizione",
    category: "Consumabili",
    costR: 0,
    weight_kg: 1,
    ammo_type: "quadrelli",
    ammo_capacity: 20,
  },
  {
    name: "Bende",
    description: "Necessarie al Primo soccorso.",
    kind: "altro",
    category: "Consumabili",
    costR: 0,
    weight_kg: 0.2,
  },
  {
    name: "Kit del maestro",
    description: "+2 a Medicina.",
    kind: "altro",
    category: "Varie",
    costR: 1,
    weight_kg: 2,
  },
  {
    name: "Kit da campo",
    description: "Ripara armature in campo.",
    kind: "altro",
    category: "Varie",
    costR: 1,
    weight_kg: 3,
  },
  {
    name: "Veleno",
    description: "DV 15, danno 1d6 a round per 1d6 round.",
    kind: "altro",
    category: "Consumabili",
    costR: 1,
    weight_kg: 0.1,
  },
];
