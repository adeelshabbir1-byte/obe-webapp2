import { test } from "node:test";
import assert from "node:assert/strict";
import { areaOf, summarise, cleanMinutes } from "../lib/pilotFiguresCore";

test("actions fall into their areas", () => {
  assert.equal(areaOf("MARK_ENTERED"), "marks");
  assert.equal(areaOf("LECTURE_ROW_ADDED"), "planning");
  assert.equal(areaOf("CQI_RECORD_CREATED"), "cqi");
  assert.equal(areaOf("AFF_SESSIONALS_SUBMITTED"), "colleges");
  assert.equal(areaOf("LOGIN_SUCCESS"), null);
});
test("hours saved only where the institute entered both minutes", () => {
  const s = summarise({ MARK_ENTERED: 120, MARK_CHANGED: 0, CQI_RECORD_CREATED: 6, LOGIN_SUCCESS: 999 }, { marks: { before: 10, now: 4 }, cqi: { before: 60 } });
  const marks = s.rows.find((r) => r.key === "marks")!;
  assert.equal(marks.count, 120);
  assert.equal(marks.hoursSaved, 12);
  assert.equal(s.rows.find((r) => r.key === "cqi")!.hoursSaved, null);
  assert.equal(s.total, 126);
  assert.equal(s.hoursSaved, 12);
  assert.equal(s.entered, 1);
});
test("form values are cleaned", () => {
  assert.deepEqual(cleanMinutes({ marks: { before: "10", now: "" }, bogus: { before: 5 }, cqi: { before: -3, now: 99999 } }), { marks: { before: 10 } });
});
