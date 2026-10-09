// =====================================================================
// Configurazione del combattimento (documento "Combattimento, armi e danni").
// Tutti i numeri delle regole stanno qui, non nel codice del motore.
// =====================================================================

export type LocationId =
  "head" | "torso" | "arm_r" | "arm_l" | "leg_r" | "leg_l";
export type ArmorPart = "testa" | "tronco" | "braccia" | "gambe";
export type AttackKind = "normal" | "fast" | "strong" | "aimed" | "disarm";
export type DefenseKind = "parry" | "dodge" | "take";
export type WoundSeverity = "light" | "medium" | "grave" | "mortal";

export const COMBAT = {
  // Locazioni: d10 per sapere dove colpisce, pezzo d'armatura, penalita' se mirata, moltiplicatore
  locations: [
    {
      id: "head",
      label: "Testa",
      to: "alla testa",
      d10: [1],
      armor: "testa",
      aimPenalty: -6,
      multiplier: 3,
    },
    {
      id: "torso",
      label: "Tronco",
      to: "al tronco",
      d10: [2, 3, 4],
      armor: "tronco",
      aimPenalty: -1,
      multiplier: 1,
    },
    {
      id: "arm_r",
      label: "Braccio destro",
      to: "al braccio destro",
      d10: [5],
      armor: "braccia",
      aimPenalty: -3,
      multiplier: 0.5,
    },
    {
      id: "arm_l",
      label: "Braccio sinistro",
      to: "al braccio sinistro",
      d10: [6],
      armor: "braccia",
      aimPenalty: -3,
      multiplier: 0.5,
    },
    {
      id: "leg_r",
      label: "Gamba destra",
      to: "alla gamba destra",
      d10: [7, 8],
      armor: "gambe",
      aimPenalty: -2,
      multiplier: 0.5,
    },
    {
      id: "leg_l",
      label: "Gamba sinistra",
      to: "alla gamba sinistra",
      d10: [9, 10],
      armor: "gambe",
      aimPenalty: -2,
      multiplier: 0.5,
    },
  ] as const satisfies readonly {
    id: LocationId;
    label: string;
    to: string; // "alla testa", "al tronco"...
    d10: readonly number[];
    armor: ArmorPart;
    aimPenalty: number;
    multiplier: number;
  }[],

  armorParts: [
    { id: "testa", label: "Testa (elmo)" },
    { id: "tronco", label: "Tronco (corazza)" },
    { id: "braccia", label: "Braccia (bracciali)" },
    { id: "gambe", label: "Gambe (schinieri)" },
  ] as const satisfies readonly { id: ArmorPart; label: string }[],

  // Tipi di attacco: modificatore al colpire e Stamina
  attackKinds: {
    normal: { label: "Normale", hit: 0, stamina: 1 },
    fast: { label: "Veloce", hit: -3, hitRapida: -2, stamina: 1, hits: 2 },
    strong: { label: "Forte", hit: -3, stamina: 3, damageMultiplier: 1.5 },
    aimed: { label: "Mirato", hit: 0, stamina: 1 },
    disarm: { label: "Disarmare", hit: -3, stamina: 1, disarmMargin: 5 },
  } as const,

  defenses: {
    parry: { label: "Parare", stamina: 1 },
    dodge: { label: "Schivare", stamina: 1 },
    take: { label: "Incassare", stamina: 0 },
  } as const,

  // Margine quando si incassa: totale dell'attacco meno 10 (minimo 0)
  takeMarginBase: 10,

  // Ferite critiche dal margine
  criticals: [
    {
      id: "light",
      label: "Lieve",
      min: 7,
      max: 9,
      bonus: 3,
      penalty: -1,
      bleed: 0,
    },
    {
      id: "medium",
      label: "Media",
      min: 10,
      max: 12,
      bonus: 5,
      penalty: -2,
      bleed: 2,
    },
    {
      id: "grave",
      label: "Grave",
      min: 13,
      max: 14,
      bonus: 8,
      penalty: -4,
      bleed: 3,
      loseActionIfCore: true,
    },
    {
      id: "mortal",
      label: "Mortale",
      min: 15,
      max: 999,
      bonus: 10,
      penalty: -4,
      bleed: 5,
      deathIfCore: true,
    },
  ] as const satisfies readonly {
    id: WoundSeverity;
    label: string;
    min: number;
    max: number;
    bonus: number;
    penalty: number;
    bleed: number;
    loseActionIfCore?: boolean;
    deathIfCore?: boolean;
  }[],

  stun: { margin: 5, dv: 12 }, // Stordente: BODY + Robustezza + d10 contro DV 12
  staminaZeroPenalty: -3,
  dying: { dv: 12, perRound: 1 }, // BODY + TEM + d10 contro 12, +1 per round dopo il primo
  stabilizeDv: 15, // Medicina per stabilizzare un morente
  firstAidDv: {
    light: 10,
    medium: 12,
    grave: 15,
    mortal: 18,
    bleeding: 10,
  } as Record<string, number>,

  // Distanza: bande di gittata rispetto alla portata dell'arma
  rangeBands: [
    { id: "ravvicinata", label: "Ravvicinata", upTo: 0.25, dv: 10 },
    { id: "media", label: "Media", upTo: 0.5, dv: 13 },
    { id: "lunga", label: "Lunga", upTo: 1, dv: 16 },
    { id: "estrema", label: "Estrema", upTo: 2, dv: 20, halfDamage: true },
  ] as const,
  rangedMeleePenalty: -3, // tirare a un bersaglio a contatto
  coverPenalty: -3, // copertura parziale
  runningTargetDv: 2, // bersaglio che corre

  // Carica a cavallo (effetto da_carica)
  charge: { hit: 2, damage: "1d6" },

  // Skill usate dal combattimento (per nome, come nel catalogo delle abilita')
  skills: {
    unarmed: "Lotta",
    dodge: "Schivare",
    shieldFree: "Armi da impatto", // parata con scudo e altra mano libera
    riding: "Equitazione",
    dragonRiding: "Cavalcare un Drago",
    stun: "Robustezza",
    medicine: "Medicina",
  },
  quickReflexesTrait: "Riflessi pronti", // +2 all'iniziativa
  quickReflexesBonus: 2,
  longReachBonus: 2,

  // Recupero della Stamina: dopo 10 minuti senza azioni di combattimento torna piena
  staminaRestMinutes: 10,
} as const;

// Effetti delle armi
export const WEAPON_EFFECTS = [
  {
    id: "sanguinante",
    label: "Sanguinante",
    help: "Se il colpo penetra, il bersaglio sanguina 1 PF a round",
  },
  {
    id: "stordente",
    label: "Stordente",
    help: "Se penetra con margine 5+, tiro BODY + Robustezza contro DV 12 o perde l'azione",
  },
  {
    id: "rapida",
    label: "Rapida",
    help: "Gli attacchi veloci danno −2 invece di −3",
  },
  { id: "bilanciata", label: "Bilanciata", help: "+1 a Parare con quest'arma" },
  {
    id: "lunga",
    label: "Lunga",
    help: "+2 all'iniziativa nel primo round contro armi più corte",
  },
  {
    id: "da_carica",
    label: "Da carica",
    help: "In carica a cavallo: +2 al colpire e +1d6 al danno",
  },
  {
    id: "estrazione_rapida",
    label: "Estrazione rapida",
    help: "Si estrae senza spendere un'azione",
  },
  {
    id: "occultabile",
    label: "Occultabile",
    help: "Si nasconde sotto i vestiti (Osservazione DV 15)",
  },
  {
    id: "si_spezza",
    label: "Si spezza al primo colpo",
    help: "Perde 1 AFF a ogni colpo che va a segno",
  },
] as const;
export type WeaponEffect = (typeof WEAPON_EFFECTS)[number]["id"];

export const DAMAGE_TYPES = [
  { id: "taglio", label: "Taglio" },
  { id: "perforante", label: "Perforante" },
  { id: "contundente", label: "Contundente" },
] as const;

export const ARMOR_MATERIALS = [
  { id: "imbottito", label: "Imbottito" },
  { id: "cuoio-bollito", label: "Cuoio bollito" },
  { id: "brigantina", label: "Brigantina" },
  { id: "maglia", label: "Maglia" },
  { id: "piastre", label: "Piastre" },
] as const;
