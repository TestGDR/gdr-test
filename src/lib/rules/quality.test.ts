// Bonus della qualita' per tipo di oggetto e danno contro le armature (0154)
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDamage } from "./combat.ts";
import {
  damageTypesOf,
  materialFactor,
  qualityBonus,
  type QualityBonusRow,
} from "./quality.ts";

const row = (item_class: string, b: Partial<QualityBonusRow>): QualityBonusRow => ({
  quality_id: "q",
  item_class,
  hit: 0,
  damage: 0,
  pierce: 0,
  aff: 0,
  sp: 0,
  parry: 0,
  encumbrance: 0,
  ...b,
});

test("un'arma contundente non riceve perforazione, anche se scritta per errore", () => {
  const rows = [row("contundente", { hit: 1, damage: 2, pierce: 3, aff: 4 })];
  const b = qualityBonus({ kind: "arma", damage_type: "contundente" }, "q", rows);
  assert.equal(b.pierce, 0);
  assert.equal(b.damage, 2);
});

test("lo scudo migliora la parata, la spada in affondo usa i bonus perforanti", () => {
  const rows = [row("scudo", { parry: 1, aff: 3 }), row("perforante", { pierce: 1 })];
  assert.equal(qualityBonus({ kind: "scudo" }, "q", rows).parry, 1);
  const sword = { kind: "arma", damage_type: "taglio", damage_type_alt: "perforante" };
  assert.deepEqual(damageTypesOf(sword), ["taglio", "perforante"]);
  assert.equal(qualityBonus(sword, "q", rows, "perforante").pierce, 1);
  assert.equal(qualityBonus(sword, "q", rows).pierce, 0);
  // senza qualita' nessun bonus
  assert.equal(qualityBonus({ kind: "scudo" }, null, rows).parry, 0);
});

test("taglio contro piastre: danno dimezzato prima dell'SP", () => {
  const mods = [{ damage_type: "taglio", material: "piastre", factor: 0.5 }];
  const factor = materialFactor("taglio", "piastre", mods);
  assert.equal(factor, 0.5);
  assert.equal(materialFactor("perforante", "piastre", mods), 1);
  const r = resolveDamage({
    diceTotal: 20,
    attackKind: "normal",
    location: "torso",
    armorSp: 4,
    margin: 0,
    material: { label: "piastre", factor },
  });
  assert.equal(r.baseDamage, 10);
  assert.equal(r.afterArmor, 6);
});
