import test from "node:test";
import assert from "node:assert/strict";

// Prompt 4 — guided batch set-up, OMC approval of a batch, SE plan step by step with OMC votes, OMC rules.
// Pure logic only (no database): the step list and links, majority and tallies, course categories and limits,
// the plan checks line, and the request votes threshold.

test("batch set-up has 13 steps in the prompt's order, each on an existing page", async () => {
  const { STEP_TITLES, TOTAL_STEPS, stepHref } = await import("../lib/batchFlow");
  assert.equal(TOTAL_STEPS, 13);
  assert.deepEqual(STEP_TITLES.slice(0, 5), ["Batch", "Source", "Tracks", "Preview & import", "Sync & equalise"]);
  assert.equal(STEP_TITLES[12], "Review & send to OMC");
  const b = "B1";
  assert.match(stepHref(5, b), /^\/omc\/content-sync\?batchId=B1&setup=B1$/);
  assert.match(stepHref(8, b), /^\/omc\/course-repositioning\?/);
  assert.match(stepHref(9, b), /^\/coordinator\/prerequisite-map\?/);
  assert.match(stepHref(11, b), /^\/coordinator\/assign-subject-experts\?/);
  assert.match(stepHref(12, b), /^\/omc\/plo-matrix\?/);
  assert.match(stepHref(13, b), /^\/coordinator\/batch-review\?/);
  assert.match(stepHref(6, b), /#home$/);
  assert.match(stepHref(7, b), /#names$/);
  // Before any course exists the first steps open the step-by-step wizard; afterwards the courses page.
  assert.match(stepHref(2, b, false), /^\/coordinator\/batches\/new\?batchId=B1/);
  assert.match(stepHref(2, b, true), /^\/coordinator\/courses\?/);
  for (let n = 1; n <= 13; n++) assert.ok(stepHref(n, b).includes("setup=B1"), `step ${n} keeps the strip on`);
});

test("majority is more than half; tallies say who is still waiting", async () => {
  const { majority, tally } = await import("../lib/omcMembers");
  assert.equal(majority(5), 3);
  assert.equal(majority(4), 3);
  assert.equal(majority(3), 2);
  assert.equal(majority(1), 1);
  assert.equal(majority(0), 1);
  const m = [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }, { id: "d", name: "D" }, { id: "e", name: "E" }];
  const t = tally(m, [{ memberId: "a", yes: true }, { memberId: "b", yes: true }, { memberId: "c", yes: false }, { memberId: "x", yes: true }]);
  assert.equal(t.yes, 2); assert.equal(t.no, 1); assert.equal(t.total, 5); assert.equal(t.need, 3);
  assert.deepEqual(t.waiting, ["D", "E"]);
  assert.equal(t.carried, false, "a vote from a non-member does not count");
  assert.equal(tally(m, ["a", "b", "c"].map((id) => ({ memberId: id, yes: true }))).carried, true);
  assert.equal(tally(m, ["a", "b", "c"].map((id) => ({ memberId: id, yes: false }))).failed, true);
});

test("course categories for the OMC's limits", async () => {
  const { categoryOf } = await import("../lib/omcRules");
  assert.equal(categoryOf({ courseType: "Core", title: "Data Structures" }), "CORE");
  assert.equal(categoryOf({ courseType: "Lab", title: "Programming Fundamentals Lab" }), "LAB");
  assert.equal(categoryOf({ courseType: "Core", title: "Operating Systems Lab" }), "LAB");
  assert.equal(categoryOf({ courseType: "General Education", title: "Islamic Studies" }), "GE");
  assert.equal(categoryOf({ courseType: "Capstone Project", title: "Final Year Project I" }), "CAPSTONE");
  assert.equal(categoryOf({ courseType: "Domain Elective", title: "Machine Learning" }), "ELECTIVE");
});

test("limit figures are cleaned, clamped and described", async () => {
  const { cleanFigures, figuresLine, DEFAULT_FIGURES } = await import("../lib/omcRules");
  const f = cleanFigures({ quizMin: "10", quizMax: "15", finalMin: 40, finalMax: 140, midtermMin: "", minQuizzes: "3" });
  assert.deepEqual(f.quiz, [10, 15]);
  assert.deepEqual(f.final, [40, 100], "percentages are clamped to 0–100");
  assert.equal(f.midterm, undefined, "an empty head is left without a limit");
  assert.equal(f.minQuizzes, 3);
  assert.throws(() => cleanFigures({ quizMin: 20, quizMax: 10 }), /lowest is above the highest/);
  assert.deepEqual(cleanFigures({ quiz: [5, 9] }).quiz, [5, 9], "pairs are accepted too");
  assert.match(figuresLine(DEFAULT_FIGURES.CORE), /Quizzes 10–15% · Assignments 10–15% · Midterm 25–30% · Final 40–50%/);
  assert.equal(figuresLine(null), "—");
});

test("the plan checks line reads like the red flag", async () => {
  const { checksLine, SE_STEPS } = await import("../lib/sePlan");
  assert.equal(SE_STEPS.length, 6);
  assert.deepEqual(SE_STEPS.map((s) => s.key), ["details", "clos", "lectures", "assessments", "questions", "review"]);
  const line = checksLine({ details: true, clos: true, lectures: false, assessments: false, questions: false });
  assert.equal(line, "Course details ✓ · CLOs ✓ · lecture plan ✗ · assessments ✗ · exam questions ✗");
});

test("three-way comparison labels and side text", async () => {
  const { TAG_LABEL, sideText } = await import("../lib/batchCompare");
  assert.equal(TAG_LABEL.moved, "moved semester");
  assert.equal(TAG_LABEL.ch, "CH changed");
  assert.equal(TAG_LABEL.elective, "chosen elective");
  assert.equal(sideText(null), "—");
  assert.equal(sideText({ code: "CS101", title: "Programming", ch: 4, type: "Core", semester: 1 }), "CS101 Programming · 4 CH · S1");
});

test("OMC review of a batch has the seven steps of the prompt", async () => {
  const { REVIEW_STEPS, PROPOSAL_KINDS } = await import("../lib/batchApproval");
  assert.deepEqual(REVIEW_STEPS.map((s) => s.title), ["Comparison", "Structure check", "Changes", "Semester plan & prerequisites", "Electives & tracks", "Subject Experts", "Course → GA mapping"]);
  for (const k of ["MOVE", "RENAME", "CH", "DROP", "SE", "PREREQ", "TYPE", "NOTE"]) assert.ok(PROPOSAL_KINDS[k], k);
});

test("every new migration is idempotent and probed", async () => {
  const fs = await import("node:fs");
  const { MIGRATIONS } = await import("../lib/migrationProbes");
  for (const f of ["migration_batch_flow.sql", "migration_batch_omc.sql", "migration_se_plan_votes.sql", "migration_omc_rules.sql"]) {
    const sql = fs.readFileSync(`prisma/${f}`, "utf8");
    assert.ok(!/CREATE TABLE (?!IF NOT EXISTS)/.test(sql), `${f}: every table is CREATE TABLE IF NOT EXISTS`);
    assert.ok(!/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/.test(sql), `${f}: every index is IF NOT EXISTS`);
    assert.ok(MIGRATIONS.some((m) => m.f === f), `${f} has a probe`);
  }
});

test("route files only export handlers", async () => {
  const fs = await import("node:fs");
  const files = ["app/api/coordinator/batch-flow/route.ts", "app/api/coordinator/batch-compare/route.ts", "app/api/omc/batch-review/route.ts", "app/api/omc/omc-rules/route.ts", "app/api/subjectexpert/courses/[courseId]/plan-flow/route.ts", "app/api/omc/templates/[courseId]/route.ts"];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    const exported = Array.from(src.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)).map((m) => m[1]);
    for (const e of exported) assert.ok(["GET", "POST", "PUT", "PATCH", "DELETE", "dynamic", "maxDuration"].includes(e), `${f} exports ${e}`);
  }
});
