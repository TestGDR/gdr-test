import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY_MS,
  currentHp,
  currentStamina,
  hpState,
  recoveredHp,
} from "./hp.ts";

const t0 = Date.parse("2026-10-01T10:00:00Z");
const at = (ms: number) => new Date(t0 + ms).toISOString();

test("PF: null = pieni, mai sotto 0", () => {
  assert.equal(currentHp({ hp_current: null }, 60, 6, t0), 60);
  assert.equal(
    currentHp(
      { hp_current: -5, hp_updated_at: at(0), dying_since: at(0) },
      60,
      6,
      t0,
    ),
    0,
  );
});

test("PF: recupero di REC al giorno intero, non prima, fino al massimo", () => {
  const c = { hp_current: 20, hp_updated_at: at(0) };
  assert.equal(currentHp(c, 60, 6, t0 + DAY_MS - 1), 20);
  assert.equal(currentHp(c, 60, 6, t0 + DAY_MS), 26);
  assert.equal(currentHp(c, 60, 6, t0 + 3 * DAY_MS + 5), 38);
  assert.equal(
    currentHp(
      { hp_current: 55, hp_updated_at: at(0) },
      60,
      6,
      t0 + 10 * DAY_MS,
    ),
    60,
  );
});

test("PF: il resto del giorno non si perde", () => {
  const r = recoveredHp(
    { hp_current: 10, hp_updated_at: at(0) },
    60,
    6,
    t0 + 2 * DAY_MS + 1000,
  );
  assert.equal(r.hp, 22);
  assert.equal(r.since, t0 + 2 * DAY_MS);
});

test("PF: morti e morenti non stabilizzati non recuperano; stabilizzati sì", () => {
  assert.equal(
    currentHp(
      { hp_current: 0, hp_updated_at: at(0), dead_at: at(0) },
      60,
      6,
      t0 + 9 * DAY_MS,
    ),
    0,
  );
  assert.equal(
    currentHp(
      { hp_current: 0, hp_updated_at: at(0), dying_since: at(0) },
      60,
      6,
      t0 + 9 * DAY_MS,
    ),
    0,
  );
  assert.equal(
    currentHp(
      {
        hp_current: 0,
        hp_updated_at: at(0),
        dying_since: at(0),
        stabilized_at: at(0),
      },
      60,
      6,
      t0 + 2 * DAY_MS,
    ),
    12,
  );
});

test("Stato: illeso, ferito, morente, stabilizzato, morto", () => {
  assert.equal(hpState({}, 60, 60), "illeso");
  assert.equal(hpState({}, 1, 60), "ferito");
  assert.equal(hpState({ dying_since: at(0) }, 0, 60), "morente");
  assert.equal(
    hpState({ dying_since: at(0), stabilized_at: at(0) }, 0, 60),
    "stabilizzato",
  );
  assert.equal(
    hpState({ dying_since: at(0), stabilized_at: at(0) }, 6, 60),
    "ferito",
  );
  assert.equal(hpState({ dead_at: at(0) }, 0, 60), "morto");
});

test("Stamina: piena dopo 10 minuti senza combattere", () => {
  const c = { stamina_current: 3, stamina_updated_at: at(0) };
  assert.equal(currentStamina(c, 60, t0 + 9 * 60_000), 3);
  assert.equal(currentStamina(c, 60, t0 + 10 * 60_000), 60);
  assert.equal(currentStamina({ stamina_current: null }, 60, t0), 60);
});
