import { test } from "node:test";
import assert from "node:assert/strict";
import { footers, type MRow } from "../lib/gaMatrixCore";

const row = (code: string, cell: MRow["cells"][number], status: MRow["status"] = "PASSED"): MRow => ({ code, title: code, semester: 1, status, ch: 3, cells: { 1: cell } });
test("average rule: slack says what is needed in the remaining courses", () => {
  const f = footers([row("A", { pct: 40 }), row("B", "planned", "PLANNED")], [1], { kind: "avg" })[0];
  assert.equal(f.slack, "needs ≥ 60% average in the 1 remaining");
  assert.equal(f.status, "AT_RISK");
});
test("average rule: can't attain when even 100% isn't enough", () => {
  const f = footers([row("A", { pct: 0 }), row("B", { pct: 0 }), row("C", "planned", "PLANNED")], [1], { kind: "avg" })[0];
  assert.equal(f.status, "CANNOT");
});
test("count rule: can still miss N", () => {
  const f = footers([row("A", { pct: 70 }), row("B", "planned", "PLANNED"), row("C", "planned", "PLANNED")], [1], { kind: "count", n: 2 })[0];
  assert.deepEqual([f.slack, f.status], ["can still miss 1", "ON_TRACK"]);
});
