// Introiti dei tipi di feudo per grandezza e secondo tipo (migrazione 0155)
import { test } from "node:test";
import assert from "node:assert/strict";
import { fiefTypeRows, sumAmounts } from "./fief-income.ts";

const types = [
  { id: "militare", incomes: [{ resource_id: "oro", amount: 4 }], upkeep: [{ resource_id: "oro", amount: 10 }] },
  { id: "costiero", incomes: [{ resource_id: "oro", amount: 16 }], upkeep: [] },
];

test("medio x1,5 e grande x2, come nel documento", () => {
  assert.deepEqual(fiefTypeRows({ size: "medio", fief_type_id: "militare" }, types).incomes, [{ resource_id: "oro", amount: 6 }]);
  assert.deepEqual(fiefTypeRows({ size: "grande", fief_type_id: "militare" }, types).upkeep, [{ resource_id: "oro", amount: 20 }]);
});

test("il secondo tipo conta a metà", () => {
  // grande: Militare 4x2 = 8, Costiero 16x2x0,5 = 16 -> 24 Oro
  const r = fiefTypeRows({ size: "grande", fief_type_id: "militare", fief_type2_id: "costiero" }, types);
  assert.deepEqual(sumAmounts(r.incomes), [{ resource_id: "oro", amount: 24 }]);
});
