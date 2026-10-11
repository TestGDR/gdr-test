import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { criticalWound } from "./combat.ts";
import { loadState, woundPenaltyNow } from "./condition.ts";
import { currentStamina } from "./hp.ts";
import { DEFAULT_SETTINGS, normalizeSettings, setSettings } from "./settings.ts";

afterEach(() => setSettings(DEFAULT_SETTINGS));
const t0 = Date.parse("2026-01-10T12:00:00Z");

test("regole vuote o rotte: valgono quelle del regolamento", () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({ staminaRestMinutes: "abc", criticals: "no", load: 5 }), DEFAULT_SETTINGS);
  const s = normalizeSettings({ staminaRestMinutes: -5, woundHealDays: 9999, criticals: [{ id: "light", penalty: 3, bleed: 99 }] });
  assert.equal(s.staminaRestMinutes, 1);
  assert.equal(s.woundHealDays, 365);
  assert.equal(s.criticals[0].penalty, 0);
  assert.equal(s.criticals[0].bleed, 20);
});

test("le regole cambiate dal pannello entrano nei calcoli", () => {
  setSettings(
    normalizeSettings({
      staminaRestMinutes: 60,
      woundHealDays: 1,
      criticals: [{ id: "light", min: 5, penalty: -2, bonus: 4, bleed: 1, label: "Graffio" }],
      load: [{ over: 0.5, penalty: -1, label: "Carico" }],
    }),
  );
  const c = { stamina_current: 0, stamina_updated_at: new Date(t0).toISOString() };
  assert.equal(currentStamina(c, 60, 5, t0 + 59 * 60_000), 0);
  assert.equal(currentStamina(c, 60, 5, t0 + 60 * 60_000), 5);
  const w = { location: "leg_r", severity: "grave", bleed: 0, penalty: -4, created_at: new Date(t0).toISOString() };
  assert.equal(woundPenaltyNow(w, t0 + 2 * 24 * 3600_000), -2);
  assert.equal(criticalWound(4), null);
  assert.deepEqual(
    (({ id, label, bonus, penalty, bleed }) => ({ id, label, bonus, penalty, bleed }))(criticalWound(6)!),
    { id: "light", label: "Graffio", bonus: 4, penalty: -2, bleed: 1 },
  );
  assert.equal(criticalWound(10)!.id, "medium");
  assert.deepEqual(loadState(30, 50), { weight: 30, carry: 50, penalty: -1, label: "Carico" });
});

test("con i valori di base le ferite critiche sono quelle del regolamento", () => {
  assert.equal(criticalWound(6), null);
  assert.equal(criticalWound(7)!.id, "light");
  assert.equal(criticalWound(12)!.id, "medium");
  assert.equal(criticalWound(14)!.id, "grave");
  assert.equal(criticalWound(40)!.id, "mortal");
  assert.ok("deathIfCore" in criticalWound(15)!);
});
