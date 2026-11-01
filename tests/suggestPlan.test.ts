import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestPlan, type PCourse } from "../lib/suggestPlanCore";

const any = () => true, odd = (s: number) => s % 2 === 1;
const c = (id: string, ch: number, extra: Partial<PCourse> = {}): PCourse => ({ id, code: id, ch, scheme: 3, core: true, failed: false, prereq: null, allowed: any, ...extra });
test("never exceeds the max load, failed course first, prerequisite before its dependant, only when offered", () => {
  const out = suggestPlan({ courses: [c("E1", 3, { core: false }), c("F201", 3, { failed: true }), c("C301", 3, { prereq: "F201" }), c("C1", 3), c("C2", 3), c("ODD", 3, { allowed: odd })], passed: new Set(), fromSem: 4, min: 3, max: 9 });
  for (const n of Object.values(out.ch)) assert.ok(n <= 9);
  assert.equal(out.bySem[4][0], "F201");
  const semOf = (code: string) => Number(Object.entries(out.bySem).find(([, v]) => v.includes(code))![0]);
  assert.ok(semOf("C301") > semOf("F201"));
  assert.equal(semOf("ODD") % 2, 1);
  assert.equal(out.unfit.length, 0);
  assert.ok(out.graduation! >= 5);
});
