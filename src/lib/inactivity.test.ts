import { test } from "node:test";
import assert from "node:assert/strict";
import { judge } from "./inactivity.ts";

const now = new Date("2026-10-25T12:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const base = { status: "attivo", created_at: ago(60), activated_at: ago(50), last_chat_action: null, absences: [] };

test("regolamento inattivita'", () => {
  assert.equal(judge({ ...base, status: "bozza", created_at: ago(3) }, now).level, "nuovo");
  assert.equal(judge({ ...base, status: "bozza", created_at: ago(8) }, now).level, "cancellare");
  assert.equal(judge({ ...base, activated_at: ago(8) }, now).level, "cancellare"); // mai giocato
  assert.equal(judge({ ...base, activated_at: ago(3) }, now).level, "nuovo");
  assert.equal(judge({ ...base, last_chat_action: ago(2) }, now).level, "ok");
  assert.equal(judge({ ...base, last_chat_action: ago(6) }, now).level, "attenzione");
  assert.equal(judge({ ...base, last_chat_action: ago(10) }, now).level, "desimbolo");
  assert.equal(judge({ ...base, last_chat_action: ago(40) }, now).level, "cancellare");
  // assenza in corso; assenza finita da 3 giorni: ancora nei 7 giorni di rientro
  assert.equal(judge({ ...base, last_chat_action: ago(40), absences: [{ from_date: "2026-10-01", to_date: "2026-10-30" }] }, now).level, "assente");
  assert.notEqual(judge({ ...base, last_chat_action: ago(40), absences: [{ from_date: "2026-10-01", to_date: "2026-10-22" }] }, now).level, "cancellare");
  assert.equal(judge({ ...base, last_chat_action: ago(40), absences: [{ from_date: "2026-10-01", to_date: "2026-10-10" }] }, now).level, "cancellare");
});
