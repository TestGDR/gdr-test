// Eserciti: tipi, potenza delle casate e dei regni, confronto tra due eserciti.
// Modulo puro (nessun accesso al database): lo usano Gestione -> Eserciti e
// il pannello Feudi dei giocatori.

export type TroopType = {
  id: string;
  name: string;
  description: string;
  attack: number; // per ogni unita'
  defense: number;
  sort_order: number;
  category_id?: string | null; // gruppo (terrestri, navali...): migrazione 0145
};

// Punti in piu' (o in meno) per ogni unita' di "troop_type_id" contro "against_id"
export type Matchup = { troop_type_id: string; against_id: string; modifier: number };
export type HouseTroop = { house_id: string; troop_type_id: string; quantity: number };
export type Kingdom = { id: string; name: string; description: string; sort_order: number };
export type FiefPoints = { attack: number; defense: number };

export type ArmyLine = { type: TroopType; quantity: number; attack: number; defense: number };
export type Power = {
  lines: ArmyLine[];
  units: number;
  armyAttack: number;
  armyDefense: number;
  fiefAttack: number;
  fiefDefense: number;
  army: number; // attacco + difesa delle truppe
  fief: number; // attacco + difesa delle strutture dei feudi
  total: number;
};

// Potenza di una casata: truppe + strutture dei feudi
export function housePower(troops: HouseTroop[], types: TroopType[], fief: FiefPoints = { attack: 0, defense: 0 }): Power {
  const lines: ArmyLine[] = [];
  for (const t of types) {
    const quantity = troops.filter((x) => x.troop_type_id === t.id).reduce((n, x) => n + x.quantity, 0);
    if (quantity > 0) lines.push({ type: t, quantity, attack: quantity * t.attack, defense: quantity * t.defense });
  }
  const armyAttack = lines.reduce((n, l) => n + l.attack, 0);
  const armyDefense = lines.reduce((n, l) => n + l.defense, 0);
  return {
    lines,
    units: lines.reduce((n, l) => n + l.quantity, 0),
    armyAttack,
    armyDefense,
    fiefAttack: fief.attack,
    fiefDefense: fief.defense,
    army: armyAttack + armyDefense,
    fief: fief.attack + fief.defense,
    total: armyAttack + armyDefense + fief.attack + fief.defense,
  };
}

// Somma di piu' potenze (le casate di un regno)
export function sumPowers(list: Power[]): Omit<Power, "lines"> {
  const add = (k: keyof Omit<Power, "lines">) => list.reduce((n, p) => n + p[k], 0);
  return {
    units: add("units"),
    armyAttack: add("armyAttack"),
    armyDefense: add("armyDefense"),
    fiefAttack: add("fiefAttack"),
    fiefDefense: add("fiefDefense"),
    army: add("army"),
    fief: add("fief"),
    total: add("total"),
  };
}

// Confronto tra due eserciti: ogni truppa di "mine" vale i suoi punti piu' i
// punti di forza/debolezza contro le truppe nemiche, pesati su quante sono
// (contro un esercito fatto per meta' di cavalieri, il bonus contro i
// cavalieri vale per meta').
export function versus(mine: ArmyLine[], enemy: ArmyLine[], matchups: Matchup[]) {
  const enemyUnits = enemy.reduce((n, l) => n + l.quantity, 0);
  let base = 0;
  let bonus = 0;
  const details: { name: string; quantity: number; base: number; bonus: number }[] = [];
  for (const l of mine) {
    const b = l.attack + l.defense;
    let perUnit = 0;
    if (enemyUnits > 0)
      for (const e of enemy) {
        const m = matchups.find((x) => x.troop_type_id === l.type.id && x.against_id === e.type.id)?.modifier ?? 0;
        perUnit += (m * e.quantity) / enemyUnits;
      }
    const extra = Math.round(perUnit * l.quantity);
    base += b;
    bonus += extra;
    details.push({ name: l.type.name, quantity: l.quantity, base: b, bonus: extra });
  }
  return { base, bonus, total: Math.max(0, base + bonus), details };
}
