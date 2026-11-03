import { test } from "node:test";
import assert from "node:assert/strict";
import { matchStudent, matchColumn, readCell, preview } from "../lib/markScanCore";
const S = [{ id: "s1", roll: "DRM-CS-24-001", name: "Ali" }, { id: "s2", roll: "DRM-CS-24-014", name: "Sara" }, { id: "s3", roll: "DRM-CS-24-114", name: "Omar" }];
const I = [{ id: "q1", label: "Quiz 1", maxScore: 10 }, { id: "a1", label: "Assignment 1", maxScore: 10 }, { id: "m3", label: "Midterm Q3", maxScore: 8 }];
test("students by roll number, including the last digits only when unique", () => {
  assert.equal(matchStudent("drm cs 24 001", S)?.id, "s1");
  assert.equal(matchStudent("001", S)?.id, "s1");
  assert.equal(matchStudent("14", S), null); // 014 and 114 both end in 14
  assert.equal(matchStudent("014", S)?.id, "s2");
});
test("columns by label", () => {
  assert.equal(matchColumn("QUIZ-1", I)?.id, "q1");
  assert.equal(matchColumn("Assign 1", I)?.id, "a1");
  assert.equal(matchColumn("Mid Q3", I)?.id, "m3");
  assert.equal(matchColumn("Viva", I), null);
});
test("cells: absent, blank, out of range", () => {
  assert.deepEqual(readCell("A", 10), { value: null, absent: true, error: null });
  assert.deepEqual(readCell(null, 10), { value: null, absent: false, error: null });
  assert.equal(readCell(12, 10).error, "12 is outside 0–10");
  assert.equal(readCell("7,5", 10).value, 7.5);
});
test("preview counts problems", () => {
  const p = preview({ columns: ["Quiz 1", "Viva"], rows: [{ roll: "001", values: [8, 5] }, { roll: "999", values: [11, 2] }, { roll: "001", values: [7, 1] }] }, S, I);
  assert.equal(p.unmatched, 1); assert.equal(p.errors, 1); assert.equal(p.rows[2].duplicate, true); assert.deepEqual(p.missing, ["DRM-CS-24-014", "DRM-CS-24-114"]);
});
