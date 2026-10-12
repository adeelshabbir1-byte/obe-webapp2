import { test } from "node:test";
import assert from "node:assert/strict";
import { termIndex, computeCurrentSemesterNumber } from "../lib/termLogic";
import { courseTermIndex, termLabel, isPastTerm } from "../lib/courseTerm";

test("terms run Fall Y -> Spring Y+1 -> Fall Y+1", () => {
  assert.equal(termIndex("Spring", 2027) - termIndex("Fall", 2026), 1);
  assert.equal(termIndex("Fall", 2027) - termIndex("Spring", 2027), 1);
  assert.equal(termLabel(termIndex("Fall", 2026)), "Fall 2026");
  assert.equal(termLabel(termIndex("Spring", 2027)), "Spring 2027");
});

test("a batch's current semester counts terms since its start (0 or less = not started)", () => {
  assert.equal(computeCurrentSemesterNumber({ startTerm: "Fall", startYear: 2024 }, { termName: "Fall", year: 2026 }), 5);
  assert.equal(computeCurrentSemesterNumber({ startTerm: "Spring", startYear: 2025 }, { termName: "Fall", year: 2026 }), 4);
  assert.ok(computeCurrentSemesterNumber({ startTerm: "Fall", startYear: 2027 }, { termName: "Fall", year: 2026 }) <= 0);
});

test("a course's term: stamped offering first, else batch start + semester", () => {
  const batch = { startTerm: "Fall", startYear: 2024 };
  assert.equal(termLabel(courseTermIndex({ semesterNumber: 7, batch })!), "Fall 2027");
  assert.equal(termLabel(courseTermIndex({ semesterNumber: 7, batch, offeredTermName: "Spring", offeredTermYear: 2026 })!), "Spring 2026");
  assert.equal(courseTermIndex({ semesterNumber: null, batch: null }), null);
});

test("past term means strictly before the program's current term", () => {
  const now = termIndex("Fall", 2026);
  const batch = { startTerm: "Fall", startYear: 2023 };
  assert.equal(isPastTerm({ semesterNumber: 6, batch }, now), true); // Spring 2026
  assert.equal(isPastTerm({ semesterNumber: 7, batch }, now), false); // Fall 2026 (now)
  assert.equal(isPastTerm({ semesterNumber: 8, batch }, now), false);
  assert.equal(isPastTerm({ semesterNumber: 6, batch }, null), false); // current term not set
});
