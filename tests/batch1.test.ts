import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTitles, defaultTitles, TITLE_KEYS } from "../lib/titles";
import { breakdown } from "../lib/feedbackAnalysis";
import { defaultQuestions } from "../lib/questionnaires";
import { gradeOk, TYPES } from "../lib/studentStatus";
import { GLOSSARY, STATUS } from "../lib/glossary";

test("institute titles replace the default names, whole words only and in one pass", () => {
  const t = defaultTitles();
  t.INSTITUTE_HEAD.title = "Vice Chancellor";
  t.DEAN.title = "Director of School";
  t.PROGRAM_LEAD.title = "Program Coordinator";
  assert.equal(applyTitles("Approved by the Institute Head and the Dean", t), "Approved by the Vice Chancellor and the Director of School");
  assert.equal(applyTitles("Deans and the Deanship", t), "Director of Schools and the Deanship");
  // "Program Lead" becomes "Program Coordinator"; that new text is not replaced again.
  assert.equal(applyTitles("Program Lead signature", t), "Program Coordinator signature");
  assert.equal(applyTitles("Nothing to change", defaultTitles()), "Nothing to change");
  assert.ok(TITLE_KEYS.every((k) => !!k.default));
});

test("feedback totals: counts per rating, averages and the weighted total out of 100", () => {
  const qs = defaultQuestions("TEACHER").slice(0, 2).map((q, i) => ({ ...q, weight: i === 0 ? 2 : 1 }));
  const rows = [5, 4, 4, 2].map((v, i) => ({ courseId: "c", studentId: `s${i}`, kind: "TEACHER" as const, answers: { [qs[0].key]: v, [qs[1].key]: 3 }, comment: null }));
  const b = breakdown(rows, qs);
  assert.equal(b.n, 4);
  assert.deepEqual(b.lines[0].counts, [0, 1, 0, 2, 1]); // 1★ … 5★
  assert.equal(b.lines[0].avg, 3.75);
  assert.equal(b.lines[1].avg, 3);
  // (3.75/5 × 2 + 3/5 × 1) ÷ 3 × 100 = 70
  assert.equal(b.total, 70);
  assert.equal(breakdown([], qs).total, null);
});

test("version 1 questionnaires are the HEC questions with groups, and every question has a key", () => {
  for (const k of ["COURSE", "TEACHER"] as const) {
    const q = defaultQuestions(k);
    assert.equal(q.length, 9);
    assert.equal(new Set(q.map((x) => x.key)).size, 9);
    assert.ok(q.every((x) => x.group && x.weight === 1 && x.version === 1));
  }
});

test("credit transfer grades: the minimum grade or better", () => {
  assert.ok(gradeOk("A", "C"));
  assert.ok(gradeOk("C", "C"));
  assert.ok(!gradeOk("C-", "C"));
  assert.ok(!gradeOk("F", "C"));
  assert.ok(!gradeOk("", "C"));
  assert.ok(gradeOk(" b+ ", "C"));
});

test("status types and glossary terms are complete", () => {
  for (const t of ["DROPPED", "LEFT", "FREEZE", "TRANSFER_INTERNAL", "TRANSFER_OUT", "TRANSFER_IN", "RUSTICATED", "READMISSION"]) assert.ok(TYPES[t]?.label, t);
  assert.equal(new Set(GLOSSARY.map((g) => g.key)).size, GLOSSARY.length);
  for (const s of ["SUBMITTED", "APPROVED", "RETURNED", "PROVISIONAL", "HELD", "ATTAINED", "NOT_ATTAINED", "VACANT", "ACTING"]) assert.ok(STATUS[s]?.meaning, s);
});
