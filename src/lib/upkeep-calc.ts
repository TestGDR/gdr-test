// Mantenimento di soldati e draghi con gli sconti delle strutture militari
// (stessi conti del database: public.house_upkeep e house_discounts, migrazione 0164).
// Ordine: tariffa -> riserva/guerra -> sconto -> Affamato.

export type Caps = { soldiers: number; soldiersResource: number; dragons: number; training: number; mood: number };
export const DEFAULT_CAPS: Caps = { soldiers: 40, soldiersResource: 50, dragons: 40, training: 60, mood: 20 };

export type Effect = {
  kind: "sconto_soldati_tutte" | "sconto_soldati_risorsa" | "sconto_draghi" | "sconto_foraggio_guerra" | "sconto_addestramento" | "bonus_umore";
  resource?: string | null;
  value: number; // percentuale, o punti di umore
};

export type Discounts = {
  soldiers: number; // % su tutte le risorse
  resources: Record<string, number>; // % per risorsa (gia' con il generale)
  dragons: number;
  forage: number;
  training: number;
};

// Sconti di una casata: somma degli effetti delle strutture finite, con i tetti
export function discounts(effects: Effect[], caps: Caps = DEFAULT_CAPS): Discounts {
  const sum = (k: Effect["kind"]) => effects.filter((e) => e.kind === k).reduce((a, e) => a + e.value, 0);
  const all = sum("sconto_soldati_tutte");
  const resources: Record<string, number> = {};
  for (const e of effects)
    if (e.kind === "sconto_soldati_risorsa" && e.resource) resources[e.resource] = (resources[e.resource] ?? 0) + e.value;
  for (const r of Object.keys(resources)) resources[r] = Math.min(caps.soldiersResource, all + resources[r]);
  return {
    soldiers: Math.min(caps.soldiers, all),
    resources,
    dragons: Math.min(caps.dragons, sum("sconto_draghi")),
    forage: Math.min(100, sum("sconto_foraggio_guerra")),
    training: Math.min(caps.training, sum("sconto_addestramento")),
  };
}

// Soldati "a costo pieno": in armi + riserva a un quarto (in guerra: in campo x3, riserva piena)
export function soldierEquivalent(inArms: number, reserve: number, atWar = false, reserveFactor = 0.25, warFactor = 3) {
  return atWar ? inArms * warFactor + reserve : inArms + reserve * reserveFactor;
}

// Costo al mese di una risorsa per i soldati
export function soldierCost(equivalent: number, per1000: number, d: Discounts, resource: string) {
  const pct = d.resources[resource] ?? d.soldiers;
  return (equivalent / 1000) * per1000 * (1 - pct / 100);
}

// Bestiame al mese di un drago: fase -> sconto -> Affamato
export function dragonCost(stageUpkeep: number, d: Discounts, hungry = false, hungerFactor = 2) {
  return stageUpkeep * (1 - d.dragons / 100) * (hungry ? hungerFactor : 1);
}

// Manodopera per addestrare: 1 per soldato, meno lo sconto
export function trainingLabor(soldiers: number, perUnit: number, d: Discounts) {
  return Math.ceil(soldiers * perUnit * (1 - d.training / 100));
}

// Umore del feudo: base delle scorte + punti delle strutture (con il tetto), tra 0 e 100
export function fiefMood(base: number, bonusPoints: number, caps: Caps = DEFAULT_CAPS) {
  return Math.max(0, Math.min(100, base + Math.min(caps.mood, bonusPoints)));
}
