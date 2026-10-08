// Test dei tiri configurabili (npm test)
import assert from "node:assert/strict";
import { test } from "node:test";
import { formulaVars, parseFormula, REGOLAMENTO_RULES, rollFormula, type RollResult } from "./dice.ts";
import type { Rng } from "./engine.ts";

// Generatore che restituisce le facce indicate (per dadi a N facce)
const faces = (sides: number, ...values: number[]): Rng => {
  let i = 0;
  return () => (values[i++] - 1) / sides + 0.0001;
};
const ok = (r: RollResult | { error: string }) => {
  if ("error" in r) throw new Error(r.error);
  return r;
};

test("Formula: STAT + ABILITA + 1d10", () => {
  const p = parseFormula("STAT + ABILITA + 1d10");
  assert.ok("terms" in p && p.terms.length === 3);
  assert.deepEqual([...formulaVars("STAT + ABILITA + 1d10")], ["STAT", "ABILITA"]);
});

test("Formula non valida", () => {
  assert.ok("error" in parseFormula("2d5 ++ 3"));
  assert.ok("error" in parseFormula("PIPPO + 1d6"));
  assert.ok("error" in parseFormula("0d6"));
});

test("2d5+1: somma dei dadi e costante", () => {
  const r = ok(rollFormula("2d5+1", [], { vars: {} }, faces(5, 3, 4)));
  assert.equal(r.total, 8);
  assert.equal(r.natural, 7);
});

test("Prova: 10 esplode due volte e somma", () => {
  const r = ok(rollFormula("STAT + ABILITA + 1d10", REGOLAMENTO_RULES, { vars: { STAT: 5, ABILITA: 3 }, target: 15 }, faces(10, 10, 10, 4)));
  assert.equal(r.total, 5 + 3 + 10 + 10 + 4);
  assert.deepEqual(r.outcomes, ["Riuscito"]);
});

test("Prova: 1 toglie un d10, una volta sola", () => {
  const r = ok(rollFormula("STAT + 1d10", REGOLAMENTO_RULES, { vars: { STAT: 4 }, target: 12 }, faces(10, 1, 10)));
  assert.equal(r.total, 4 + 1 - 10);
  assert.deepEqual(r.outcomes, ["Fallito"]);
});

test("Danno dell'arma: ARMA tira la formula dell'oggetto", () => {
  const r = ok(rollFormula("ARMA + BODY", [], { vars: { ARMA: "2d5", BODY: 3 } }, faces(5, 2, 5)));
  assert.equal(r.total, 10);
});

test("Esiti sul margine (ferite)", () => {
  const rules = [
    { when: "margine" as const, op: ">=" as const, value: 7, action: "esito" as const, label: "Ferita lieve" },
    { when: "margine" as const, op: ">=" as const, value: 10, action: "esito" as const, label: "Ferita media" },
  ];
  const r = ok(rollFormula("1d10 + 10", rules, { vars: {}, target: 10 }, faces(10, 8)));
  assert.equal(r.margin, 8);
  assert.deepEqual(r.outcomes, ["Ferita lieve"]);
});
