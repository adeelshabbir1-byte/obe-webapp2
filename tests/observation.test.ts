import { test } from "node:test";
import assert from "node:assert/strict";
import { summary, cleanScores } from "../lib/observationCore";
test("observation summary", () => {
  const s = summary({ prep: 4, clarity: 3, engage: 2, clo: 3, time: 4, climate: 4 }, "Recursion basics", "Recursion basics and examples");
  assert.equal(s.avg, 3.3); assert.equal(s.onPlan, true); assert.deepEqual(s.weak, ["Students engaged (questions, activity, discussion)"]);
  assert.deepEqual(cleanScores({ prep: "4", clarity: 9, x: 2 }), { prep: 4 });
});
