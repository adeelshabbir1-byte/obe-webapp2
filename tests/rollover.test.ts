import { test } from "node:test";
import assert from "node:assert/strict";
import { pairs } from "../lib/rolloverCore";
const c = (id: string, code: string, program: string, term: number, hasPlan: boolean, hasWork = false) => ({ id, code, program, batch: id, semester: 1, term, hasPlan, hasWork, offered: hasPlan, teacher: "" });
test("each empty course takes the newest same-program offering", () => {
  const r = pairs([c("old", "CS101", "BSCS", 50, true), c("new", "CS101", "BSCS", 52, true), c("ai", "CS101", "BSAI", 53, true), c("next", "CS101", "BSCS", 54, false), c("busy", "CS101", "BSCS", 54, false, true), c("lone", "MT999", "BSCS", 54, false)]);
  assert.deepEqual(r.pairs.map((p) => [p.target.id, p.source.id]), [["next", "new"]]);
  assert.deepEqual(r.skipped.map((s) => s.target.id), ["busy", "lone"]);
});
