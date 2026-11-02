import { test } from "node:test";
import assert from "node:assert/strict";
import { compare, toPct } from "../lib/cloSelfCore";
test("self ratings on a 0–100 scale against marks", () => {
  assert.equal(toPct(1), 0); assert.equal(toPct(5), 100); assert.equal(toPct(3), 50);
  assert.deepEqual(compare([5, 4, 5], 45), { n: 3, self: 92, direct: 45, gap: 47, flag: "Students feel more confident than their marks show" });
  assert.equal(compare([3, 3], 55).flag, "");
  assert.equal(compare([], 55).self, null);
});
