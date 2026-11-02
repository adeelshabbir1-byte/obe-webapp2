import { test } from "node:test";
import assert from "node:assert/strict";
import { gaFrom, totalPct } from "../lib/uniResultsCore";

test("total from shares; blank counts as absent", () => {
  const items = [{ id: "q", maxMarks: 10, gradePct: 40 }, { id: "f", maxMarks: 50, gradePct: 60 }];
  assert.equal(totalPct(items, { q: 5, f: 25 }), 50);
  assert.equal(totalPct(items, { q: 10, f: null }), 40);
});
test("graduate attributes from CLOs", () => {
  const g = gaFrom([{ code: "CLO-1", pct: 80, ga: "PLO-1" }, { code: "CLO-2", pct: 30, ga: "PLO-1" }, { code: "CLO-3", pct: 40, ga: "PLO-2" }, { code: "CLO-4", pct: null, ga: "PLO-3" }]);
  assert.deepEqual(g, [{ ga: "PLO-1", pct: 55, attained: true }, { ga: "PLO-2", pct: 40, attained: false }]);
});
