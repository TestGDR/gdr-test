// Test del motore delle regole (casi della sezione 9 del regolamento).
// Si lanciano con:  npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  capTraitModifiers,
  check,
  deriveStats,
  pxCostForNext,
  rollD10,
  seededRng,
  spendPX,
  validateCharacter,
  validateSkills,
  validateStats,
  validateTraits,
  type Rng,
  type Stats,
} from "./engine.ts";

const base: Stats = { int: 4, ref: 5, body: 5, emp: 5, pre: 5, will: 4 }; // somma 28
// Generatore che restituisce i d10 indicati
const dice = (...values: number[]): Rng => {
  let i = 0;
  return () => (values[i++] - 1) / 10 + 0.01;
};

test("Derivate: BODY 5, WILL 5 -> HP 50, Stamina 50, REC 5", () => {
  const d = deriveStats({ ...base, body: 5, will: 5 });
  assert.equal(d.hp, 50);
  assert.equal(d.stamina, 50);
  assert.equal(d.rec, 5);
});

test("Derivate: BODY 6, WILL 3 -> HP 50, REC 5", () => {
  const d = deriveStats({ ...base, body: 6, will: 3 });
  assert.equal(d.hp, 50);
  assert.equal(d.rec, 5);
});

test("Corsa: REF 5, BODY 5 -> 15 metri a round", () => {
  assert.equal(deriveStats({ ...base, ref: 5, body: 5 }).run, 15);
});

test("Mani nude: BODY 5 -> 1d6", () => {
  assert.equal(deriveStats({ ...base, body: 5 }).unarmed, "1d6");
});

test("Costo PX: da 4 a 5 -> 50 PX", () => {
  assert.equal(pxCostForNext(4), 50);
  assert.deepEqual(spendPX(60, 4), { ok: true, cost: 50, px: 10, level: 5 });
});

test("Costo PX: abilita' a 10 -> rifiutato", () => {
  assert.equal(spendPX(1000, 10).ok, false);
});

test("Costo PX: PX insufficienti -> rifiutato", () => {
  assert.equal(spendPX(20, 2).ok, false);
});

test("Creazione: statistica a 8 -> errore (massimo 7)", () => {
  const errors = validateStats({ ...base, int: 8, will: 0 });
  assert.ok(errors.some((e) => e.includes("massimo 7")));
});

test("Creazione: abilita' a 5 -> errore (massimo 4)", () => {
  const errors = validateSkills({ a: 5 });
  assert.ok(errors.some((e) => e.includes("massimo 4")));
});

test("Creazione valida: nessun errore", () => {
  const skills = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`s${i}`, 4]));
  assert.deepEqual(validateCharacter(base, skills, [{ kind: "vantaggio", cost: 3, name: "Talento di statistica" }]), []);
});

test("Tratti: tre vantaggi +1, +2, +2 sullo stesso tiro -> totale +3", () => {
  assert.equal(capTraitModifiers([1, 2, 2]), 3);
  assert.equal(capTraitModifiers([-2, -2]), -3);
});

test("Tratti: tre svantaggi -> errore (massimo 2)", () => {
  const flaw = (name: string) => ({ kind: "svantaggio" as const, cost: 1, name });
  assert.ok(validateTraits([flaw("a"), flaw("b"), flaw("c")]).some((e) => e.includes("massimo 2")));
});

test("Tratti: svantaggi di valore 2 e 3 -> errore (valore totale massimo 4)", () => {
  const errors = validateTraits([
    { kind: "svantaggio", cost: 2, name: "a" },
    { kind: "svantaggio", cost: 3, name: "b" },
  ]);
  assert.ok(errors.some((e) => e.includes("massimo 4")));
});

test("Tratti: un solo Talento di statistica", () => {
  const errors = validateTraits([
    { kind: "vantaggio", cost: 1, name: "x", uniqueGroup: "stat" },
    { kind: "vantaggio", cost: 1, name: "y", uniqueGroup: "stat" },
  ]);
  assert.ok(errors.some((e) => e.includes("un solo tratto")));
});

test("d10: 10 esplode e somma finche' esce 10", () => {
  assert.deepEqual(rollD10(dice(10, 10, 3)), { total: 23, rolls: [10, 10, 3], event: "esplosione" });
});

test("d10: 1 tira ancora e sottrae, una volta sola", () => {
  assert.deepEqual(rollD10(dice(1, 10)), { total: -9, rolls: [1, 10], event: "fallimento" });
});

test("Prova contro DV: 6 + 4 + d10 5 = 15 riesce contro DV 15", () => {
  const r = check({ stat: 6, skill: 4, target: { dv: 15 } }, dice(5));
  assert.equal(r.total, 15);
  assert.equal(r.success, true);
  assert.equal(r.margin, 0);
});

test("Prova opposta: a parita' vince chi difende", () => {
  const r = check({ stat: 6, skill: 4, target: { opposed: 15 } }, dice(5));
  assert.equal(r.success, false);
});

test("Generatore con seme: tiri ripetibili", () => {
  const a = Array.from({ length: 5 }, ((rng) => () => rollD10(rng).total)(seededRng(42)));
  const b = Array.from({ length: 5 }, ((rng) => () => rollD10(rng).total)(seededRng(42)));
  assert.deepEqual(a, b);
});
