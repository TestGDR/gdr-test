import assert from "node:assert/strict";
import { test } from "node:test";
import { groupStrength, housePower, sumPowers, versus, type TroopType } from "./armies.ts";

const type = (id: string, attack: number, defense: number): TroopType => ({ id, name: id, description: "", attack, defense, sort_order: 0 });
const types = [type("fanti", 2, 3), type("arcieri", 3, 1), type("cavalieri", 5, 4)];
const troop = (house: string, t: string, quantity: number) => ({ house_id: house, troop_type_id: t, quantity });

test("potenza di una casata: truppe piu' strutture dei feudi", () => {
  const p = housePower([troop("a", "fanti", 100), troop("a", "cavalieri", 10)], types, { attack: 20, defense: 30 });
  assert.equal(p.units, 110);
  assert.equal(p.armyAttack, 250);
  assert.equal(p.armyDefense, 340);
  assert.equal(p.army, 590);
  assert.equal(p.fief, 50);
  assert.equal(p.total, 640);
});

test("casata senza truppe: conta solo i feudi", () => {
  const p = housePower([], types, { attack: 5, defense: 5 });
  assert.equal(p.lines.length, 0);
  assert.equal(p.total, 10);
});

test("potenza di un regno: somma delle casate", () => {
  const a = housePower([troop("a", "fanti", 10)], types);
  const b = housePower([troop("b", "arcieri", 10)], types, { attack: 1, defense: 2 });
  assert.equal(sumPowers([a, b]).total, 50 + 40 + 3);
});

test("confronto: forze e debolezze pesate sull'esercito nemico", () => {
  // carta-forbice-sasso: i fanti battono i cavalieri, i cavalieri gli arcieri
  const matchups = [
    { troop_type_id: "fanti", against_id: "cavalieri", modifier: 2 },
    { troop_type_id: "cavalieri", against_id: "fanti", modifier: -2 },
    { troop_type_id: "cavalieri", against_id: "arcieri", modifier: 4 },
  ];
  const fanti = housePower([troop("a", "fanti", 100)], types).lines;
  const misto = housePower([troop("b", "cavalieri", 50), troop("b", "arcieri", 50)], types).lines;
  // i fanti hanno +2 solo contro la meta' di cavalieri: +1 per unita'
  assert.deepEqual(versus(fanti, misto, matchups).bonus, 100);
  assert.equal(versus(fanti, misto, matchups).total, 600);
  // i cavalieri contro soli fanti: -2 per unita'; gli arcieri nessun modificatore
  const v = versus(misto, fanti, matchups);
  assert.equal(v.bonus, -100);
  assert.equal(v.total, 450 + 200 - 100);
  // contro nessuno: solo i punti di base
  assert.equal(versus(fanti, [], matchups).bonus, 0);
});

test("drappelli: 10 uomini x1, 50 x6, 100 x12; il resto si scompone", () => {
  assert.equal(groupStrength(10), 1);
  assert.equal(groupStrength(50), 6);
  assert.equal(groupStrength(100), 12);
  assert.equal(groupStrength(170), 20); // 100 + 50 + 2x10
  assert.equal(groupStrength(500), 60);
});

test("truppe a drappelli: ATT e DIF dal valore base del drappello; le navi una per una", () => {
  const types: TroopType[] = [
    { id: "arcieri", name: "Arcieri", description: "", attack: 5, defense: 2, sort_order: 0 },
    { id: "galee", name: "Galee", description: "", attack: 5, defense: 0, sort_order: 0 },
  ];
  const p = housePower([troop("a", "arcieri", 100), troop("a", "galee", 3)], types, undefined, (t) => t.id === "arcieri");
  const arcieri = p.lines.find((l) => l.type.id === "arcieri")!;
  const galee = p.lines.find((l) => l.type.id === "galee")!;
  assert.deepEqual([arcieri.attack, arcieri.defense], [60, 24]); // come nella tabella: 100 uomini = 60 / 24
  assert.deepEqual([galee.attack, galee.defense], [15, 0]);
});
