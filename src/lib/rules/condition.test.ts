import assert from "node:assert/strict";
import { test } from "node:test";
import { isWoundHealed, loadAffects, loadState, woundDaysLeft, woundPenaltyFor, woundPenaltyNow } from "./condition.ts";

const t0 = Date.parse("2026-01-10T12:00:00Z");
const day = 24 * 60 * 60 * 1000;
const wound = (o: Partial<Parameters<typeof woundPenaltyNow>[0]> = {}) => ({
  location: "leg_r",
  severity: "grave",
  bleed: 0,
  penalty: -4,
  mutilated: false,
  created_at: new Date(t0).toISOString(),
  ...o,
});

test("ferita: la penalita' migliora di 1 ogni 3 giorni", () => {
  const w = wound();
  assert.equal(woundPenaltyNow(w, t0), -4);
  assert.equal(woundPenaltyNow(w, t0 + 2.9 * day), -4);
  assert.equal(woundPenaltyNow(w, t0 + 3 * day), -3);
  assert.equal(woundPenaltyNow(w, t0 + 7 * day), -2);
  assert.equal(woundPenaltyNow(w, t0 + 12 * day), 0);
  assert.equal(woundPenaltyNow(w, t0 + 99 * day), 0);
  assert.equal(woundDaysLeft(w, t0 + 7 * day), 5);
  assert.equal(isWoundHealed(w, t0 + 11 * day), false);
  assert.equal(isWoundHealed(w, t0 + 12 * day), true);
});

test("ferita: non guarisce se sanguina o se e' una mutilazione", () => {
  assert.equal(woundPenaltyNow(wound({ bleed: 3 }), t0 + 30 * day), -4);
  assert.equal(woundPenaltyNow(wound({ mutilated: true }), t0 + 30 * day), -4);
  assert.equal(woundDaysLeft(wound({ mutilated: true }), t0), null);
  assert.equal(isWoundHealed(wound({ mutilated: true }), t0 + 99 * day), false);
  // un semplice sanguinamento resta finche' non lo si ferma
  assert.equal(isWoundHealed(wound({ severity: "bleeding", penalty: 0, bleed: 1 }), t0 + 99 * day), false);
});

test("ferite sulle prove: conta la parte del corpo, e solo la peggiore", () => {
  const leg = wound();
  const arm = wound({ location: "arm_l", penalty: -2, severity: "medium" });
  assert.deepEqual(woundPenaltyFor([leg], "Schivare", "ref", t0), { value: -4, label: "ferita alla gamba" });
  assert.equal(woundPenaltyFor([leg], "Lotta", "ref", t0), null);
  assert.deepEqual(woundPenaltyFor([arm], "Lotta", "ref", t0), { value: -2, label: "ferita al braccio" });
  // Atletica usa braccia e gambe: vale la ferita peggiore, non la somma
  assert.deepEqual(woundPenaltyFor([arm, leg], "Atletica", "body", t0), { value: -4, label: "ferita alla gamba" });
  // la gamba non c'entra con Persuasione; la testa si'
  assert.equal(woundPenaltyFor([leg], "Persuasione", "pre", t0), null);
  assert.deepEqual(woundPenaltyFor([wound({ location: "head", penalty: -1 })], "Persuasione", "pre", t0), {
    value: -1,
    label: "ferita alla testa",
  });
  // una ferita guarita a meta' pesa meno
  assert.deepEqual(woundPenaltyFor([leg], "Schivare", "ref", t0 + 6 * day), { value: -2, label: "ferita alla gamba" });
  assert.equal(woundPenaltyFor([leg], "Schivare", "ref", t0 + 12 * day), null);
  // prova sulla sola statistica REF: braccia e gambe
  assert.deepEqual(woundPenaltyFor([arm], null, "ref", t0), { value: -2, label: "ferita al braccio" });
});

test("peso: malus oltre il carico, piu' pesante oltre le soglie", () => {
  assert.equal(loadState(50, 50).penalty, 0);
  assert.deepEqual(loadState(50.5, 50), { weight: 50.5, carry: 50, penalty: -2, label: "Appesantito" });
  assert.equal(loadState(75, 50).penalty, -2);
  assert.equal(loadState(76, 50).penalty, -4);
  assert.equal(loadState(101, 50).penalty, -6);
  assert.equal(loadState(0, 0).penalty, 0);
  assert.equal(loadAffects("ref"), true);
  assert.equal(loadAffects("body"), true);
  assert.equal(loadAffects("int"), false);
});
