// Casi di test della sezione 11 del documento "Combattimento, armi e danni"
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armorPieceCost,
  attackKindModifier,
  criticalWound,
  dyingDv,
  rangeBand,
  resolveDamage,
  takeMargin,
  weaponValues,
} from "./combat.ts";
import { check, rollD10 } from "./engine.ts";

// generatore con valori fissi di d10 (1-10)
const d10s = (...v: number[]) => {
  let i = 0;
  return () => (v[i++] - 1) / 10 + 0.01;
};

test("d10: normale, esplode, esplode due volte, fallimento", () => {
  assert.equal(rollD10(d10s(6)).total, 6);
  const e = rollD10(d10s(10, 4));
  assert.equal(e.total, 14);
  assert.equal(e.event, "esplosione");
  assert.equal(rollD10(d10s(10, 10, 3)).total, 23);
  const f = rollD10(d10s(1, 4));
  assert.equal(f.total, -3);
  assert.equal(f.event, "fallimento");
});

test("Tiro con abilità 0: RIF 6, d10 5 = 11", () => {
  assert.equal(
    check({ stat: 6, skill: 0, target: { dv: 10 } }, d10s(5)).total,
    11,
  );
});

const dmg = (o: Partial<Parameters<typeof resolveDamage>[0]>) =>
  resolveDamage({
    diceTotal: 15,
    attackKind: "normal",
    location: "torso",
    armorSp: 0,
    margin: 0,
    ...o,
  });

test("Danni: tronco, testa, perforante", () => {
  const t = dmg({ armorSp: 10 });
  assert.equal(t.hpLost, 5);
  assert.equal(t.newArmorSp, 9);
  const h = dmg({ location: "head", armorSp: 8 });
  assert.equal(h.hpLost, 21);
  assert.equal(h.newArmorSp, 7);
  const p = dmg({ armorSp: 10, pierce: 3 });
  assert.equal(p.effectiveSp, 7);
  assert.equal(p.hpLost, 8);
  const p2 = dmg({ armorSp: 2, pierce: 5 });
  assert.equal(p2.effectiveSp, 0);
  assert.equal(p2.hpLost, 15);
});

test("Danni: forte, forte con bonus, non penetra, arti, estrema", () => {
  assert.equal(dmg({ diceTotal: 14, attackKind: "strong" }).hpLost, 21);
  assert.equal(
    dmg({ diceTotal: 14, damageBonus: 1, attackKind: "strong" }).hpLost,
    23,
  );
  const np = dmg({ diceTotal: 8, armorSp: 10, effects: ["sanguinante"] });
  assert.equal(np.hpLost, 0);
  assert.equal(np.newArmorSp, 10);
  assert.equal(np.bleed, 0);
  assert.equal(dmg({ location: "arm_r", armorSp: 5 }).hpLost, 5);
  assert.equal(dmg({ diceTotal: 12, location: "leg_l", armorSp: 5 }).hpLost, 4);
  assert.equal(dmg({ extremeRange: true }).hpLost, 8);
});

test("Danni: qualità con bonus (base 17, maglia 10, perforante 2) = 9", () => {
  const r = dmg({ damageBonus: 2, armorSp: 10, pierce: 2 });
  assert.equal(r.baseDamage, 17);
  assert.equal(r.effectiveSp, 8);
  assert.equal(r.hpLost, 9);
});

test("Critici: senza e con penetrazione", () => {
  const a = dmg({ diceTotal: 8, armorSp: 10, margin: 10 });
  assert.equal(a.hpLost, 5);
  assert.equal(a.newArmorSp, 10);
  const b = dmg({ armorSp: 10, margin: 10 });
  assert.equal(b.hpLost, 10);
  assert.equal(b.bleed, 2);
  assert.equal(criticalWound(6), null);
  assert.equal(criticalWound(7)?.bonus, 3);
  assert.equal(criticalWound(10)?.bonus, 5);
  assert.equal(criticalWound(13)?.bonus, 8);
  assert.equal(criticalWound(15)?.bonus, 10);
  assert.equal(dmg({ location: "head", margin: 15 }).instantDeath, true);
  assert.equal(dmg({ location: "leg_r", margin: 15 }).instantDeath, false);
});

test("Effetti: sanguinante, stordente da margine 5", () => {
  assert.equal(dmg({ effects: ["sanguinante"] }).bleed, 1);
  assert.equal(dmg({ effects: ["stordente"], margin: 4 }).stunCheck, false);
  assert.equal(dmg({ effects: ["stordente"], margin: 5 }).stunCheck, true);
});

test("Armi e qualità: AFF, bonus, BODY minimo", () => {
  const sword = { damage: "4d6", affMax: 12, bodyMin: 4, pierce: 0 };
  assert.equal(
    weaponValues(sword, { hit: 1, damage: 0, pierce: 0, aff: 2, sp: 1 }, 6)
      .affMax,
    14,
  );
  assert.equal(
    weaponValues(sword, { hit: 1, damage: 1, pierce: 0, aff: 4, sp: 2 }, 6)
      .affMax,
    16,
  );
  const spadone = { damage: "5d6", affMax: 10, bodyMin: 5, pierce: 0 };
  assert.equal(
    weaponValues(spadone, { hit: 0, damage: 0, pierce: 0, aff: 0, sp: 0 }, 3)
      .hitBonus,
    -2,
  );
});

test("Tipi di attacco", () => {
  assert.equal(attackKindModifier("fast", ["rapida"]), -2);
  assert.equal(attackKindModifier("fast", []), -3);
  assert.equal(attackKindModifier("strong", []), -3);
  assert.equal(attackKindModifier("aimed", [], "head"), -6);
});

test("Gittata arco lungo (100 m)", () => {
  assert.equal(rangeBand(20, 100)?.dv, 10);
  assert.equal(rangeBand(50, 100)?.dv, 13);
  assert.equal(rangeBand(100, 100)?.dv, 16);
  const e = rangeBand(150, 100);
  assert.equal(e?.dv, 20);
  assert.ok(e && "halfDamage" in e);
  assert.equal(rangeBand(250, 100), null);
});

test("Morente, incassare, costo dei pezzi", () => {
  assert.deepEqual([1, 2, 4].map(dyingDv), [12, 13, 15]);
  assert.equal(takeMargin(17), 7);
  assert.equal(takeMargin(6), 0);
  assert.equal(armorPieceCost(2, "testa"), 0.5);
  assert.equal(armorPieceCost(3, "tronco"), 1.5);
});
