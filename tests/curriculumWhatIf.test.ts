import { test } from "node:test";
import assert from "node:assert/strict";
import { dropEffect } from "../lib/curriculumWhatIfCore";
test("dropping a course: credits, GA coverage and dependents", () => {
  const cs = [
    { id: "a", code: "CS101", title: "Programming", credits: 4, semester: 1, gas: [1, 2], prereqId: null },
    { id: "b", code: "CS201", title: "Data Structures", credits: 4, semester: 2, gas: [2, 3], prereqId: "a" },
    { id: "c", code: "HU101", title: "English", credits: 3, semester: 1, gas: [9], prereqId: null },
  ];
  const r = dropEffect(cs, new Set(["c"]), [{ number: 2, title: "Analysis" }, { number: 9, title: "Communication" }]);
  assert.equal(r.creditsBefore, 11); assert.equal(r.creditsAfter, 8);
  assert.deepEqual(r.gaRows.map((g) => [g.number, g.before, g.after, g.risk]), [[2, 2, 2, ""], [9, 1, 0, "No course builds it"]]);
  assert.deepEqual(dropEffect(cs, new Set(["a"]), []).dependents, [{ code: "CS201", title: "Data Structures", needs: "CS101" }]);
});
