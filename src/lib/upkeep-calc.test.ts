// Esempi della sezione 5b del documento "Economia dei feudi" (v3)
import { test } from "node:test";
import assert from "node:assert/strict";
import { discounts, dragonCost, fiefMood, soldierCost, soldierEquivalent, trainingLabor, type Effect } from "./upkeep-calc.ts";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.01, `${a} non è ${b}`);

// Blackfyre: Intendenza 15% + Caserma 8% + Fucina d'armi (Ferro 25%)
const blackfyre: Effect[] = [
  { kind: "sconto_soldati_tutte", value: 15 },
  { kind: "sconto_soldati_tutte", value: 8 },
  { kind: "sconto_soldati_risorsa", resource: "ferro", value: 25 },
];

test("soldati equivalenti con il 40% in riserva", () => {
  close(soldierEquivalent(3303, 2202), 3853.5);
});

test("mantenimento dei soldati con gli sconti", () => {
  const d = discounts(blackfyre);
  assert.equal(d.soldiers, 23);
  assert.equal(d.resources.ferro, 48);
  const eq = soldierEquivalent(3303, 2202);
  close(soldierCost(eq, 8, d, "alimenti"), 23.74);
  close(soldierCost(eq, 10, d, "oro"), 29.67);
  close(soldierCost(eq, 1, d, "cavalli"), 2.97);
  close(soldierCost(eq, 2, d, "ferro"), 4.01);
});

test("tetti degli sconti", () => {
  const d = discounts([
    { kind: "sconto_soldati_tutte", value: 30 },
    { kind: "sconto_soldati_tutte", value: 30 },
    { kind: "sconto_soldati_risorsa", resource: "ferro", value: 25 },
    { kind: "sconto_draghi", value: 50 },
    { kind: "sconto_addestramento", value: 50 },
    { kind: "sconto_addestramento", value: 25 },
  ]);
  assert.equal(d.soldiers, 40);
  assert.equal(d.resources.ferro, 50);
  assert.equal(d.dragons, 40);
  assert.equal(d.training, 60);
});

test("umore: base 62 + Torre, Fortezza, Mura, Caserma, Fossa = 81", () => {
  assert.equal(fiefMood(62, 3 + 5 + 6 + 2 + 3), 81);
  assert.equal(fiefMood(90, 30), 100); // tetto +20 e massimo 100
});

test("drago adulto Affamato con la Fossa dei draghi", () => {
  const d = discounts([{ kind: "sconto_draghi", value: 25 }]);
  close(dragonCost(10, d), 7.5);
  close(dragonCost(10, d, true), 15);
});

test("Manodopera per addestrare con Arsenale e Accampamento", () => {
  const d = discounts([
    { kind: "sconto_addestramento", value: 25 },
    { kind: "sconto_addestramento", value: 50 },
  ]);
  assert.equal(trainingLabor(100, 1, d), 40); // tetto 60%
});
