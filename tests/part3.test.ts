import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { runSources, sortTasks, urgencyOf, dueText, type Task } from "../lib/nextTasksCore";
import { share, worst, isReady, topLine } from "../lib/semesterReadinessCore";
import { parseWorkbook, checkWorkbook, SHEETS, countsLine, counts } from "../lib/planWorkbookCore";

const now = new Date("2026-11-01T09:00:00Z");
const t = (title: string, due: Date | null, urgency: Task["urgency"] = "normal"): Task => ({ title, href: `/${title}`, due, urgency, source: "x" });

test("nextTasks: one failing source never hides the others; overdue first, then soon, then the rest", async () => {
  const r = await runSources([
    { name: "plans", run: async () => [t("Finish CS-201 plan", null)] },
    { name: "broken", run: async () => { throw new Error("table missing"); } },
    { name: "marks", run: async () => [t("Upload Quiz 2 marks", new Date("2026-10-30T00:00:00Z"), "overdue"), t("Vote on 3 plans", new Date("2026-11-02T00:00:00Z"), "soon")] },
  ], {}, now);
  assert.deepEqual(r.failed, ["broken"]);
  assert.deepEqual(r.tasks.map((x) => x.title), ["Upload Quiz 2 marks", "Vote on 3 plans", "Finish CS-201 plan"]);
  assert.equal(urgencyOf(new Date("2026-10-31T00:00:00Z"), now), "overdue");
  assert.equal(urgencyOf(new Date("2026-11-03T00:00:00Z"), now), "soon");
  assert.equal(urgencyOf(new Date("2026-11-20T00:00:00Z"), now), "normal");
  assert.match(dueText(new Date("2026-10-30T00:00:00Z"), now), /overdue/);
  assert.equal(sortTasks([t("b", null), t("a", null)])[0].title, "a");
});

test("readiness: a missing plan is red and links to the course; all green counts as ready", () => {
  const plans = share(4, 5, "/coordinator/batch-review?batchId=b&courseId=c", ["CS-201"]);
  assert.equal(plans.light, "amber"); assert.match(plans.href!, /courseId=c/);
  assert.equal(share(0, 5).light, "red");
  assert.equal(share(5, 5).light, "green");
  const prog = worst([share(5, 5), share(0, 2)]);
  assert.equal(prog.light, "red"); assert.equal(prog.text, "5 of 7");
  const green = { setup: share(1, 1), plans: share(5, 5), instructors: share(5, 5), sections: share(5, 5), timetable: share(9, 9), registration: { light: "green" as const, text: "open" } };
  assert.equal(isReady(green), true);
  assert.equal(isReady({ ...green, plans }), false);
  assert.equal(topLine("Fall 2026", new Date("2026-11-24T00:00:00Z"), 2, 5, now), "Fall 2026 starts in 23 days · 2 of 5 programs ready");
});

async function grids(fill: (wb: ExcelJS.Workbook) => void) {
  const wb = new ExcelJS.Workbook(); fill(wb);
  const out: { name: string; grid: string[][] }[] = [];
  wb.eachSheet((ws) => { const grid: string[][] = []; ws.eachRow((r) => { const cells: string[] = []; r.eachCell({ includeEmpty: true }, (c, i) => { cells[i - 1] = (c.text || "").trim(); }); grid.push(cells); }); out.push({ name: ws.name, grid }); });
  return out;
}

test("workbook: the template's sheets read back; a missing CLO is reported; differently named columns work once pointed to", async () => {
  const g = await grids((wb) => {
    for (const s of SHEETS) { const ws = wb.addWorksheet(s.title); ws.addRow(s.fields.map((f) => f.label)); }
    wb.getWorksheet("CLOs")!.addRows([["CLO-1", "Explain stacks and queues", "C2", "GA-1"], ["CLO-2", "Apply trees", "C3", "GA-2"]]);
    wb.getWorksheet("Lecture plan")!.addRows([[1, 1, "Stacks", "push; pop", "CLO-1"], [2, 1, "Trees", "", "CLO-9"]]);
    wb.getWorksheet("Assessments")!.addRows([["Quiz", 4, 10], ["Assignment", 2, 15], ["Midterm", 1, 25], ["Final", 1, 50]]);
    wb.getWorksheet("Mid and final questions")!.addRows([["Final", 1, "CLO-2", 20, "Trees", "C3"], ["Final", 2, "CLO-1", "", "Stacks", "C2"]]);
  });
  const p = parseWorkbook(g);
  assert.equal(p.clos.length, 2); assert.equal(p.lectures.length, 2); assert.equal(p.assessments.length, 4); assert.equal(p.questions.length, 2);
  assert.match(countsLine(counts(p)), /CLOs 2 · lectures 2 · quizzes 4 · assignments 2 · mid questions 0 · final questions 2/);
  const probs = checkWorkbook(p, { existingClos: [], gaNumbers: [1, 2, 3] });
  assert.deepEqual(probs.lectures, ["Lecture 2: CLO-9 does not exist"]);
  assert.deepEqual(probs.questions, ["Final Q2: no marks"]);
  assert.deepEqual(probs.clos, []);
  assert.match(checkWorkbook(p, { existingClos: [], gaNumbers: [1] }).clos[0], /GA-2 is not one of this batch's GAs/);
  // Their own sheet: "Outcome" for the statement and "Cognitive" for Bloom, pointed to once.
  const own = await grids((wb) => { const ws = wb.addWorksheet("Course Outcomes"); ws.addRow(["CLO", "Outcome", "Cognitive"]); ws.addRow(["1", "Explain stacks", "C2"]); });
  assert.equal(parseWorkbook(own).clos.length, 1, "Outcome is a known name for the statement");
  const odd = await grids((wb) => { const ws = wb.addWorksheet("CLOs"); ws.addRow(["CLO", "What students do", "Taxo"]); ws.addRow(["1", "Explain stacks", "C2"]); });
  const before = parseWorkbook(odd);
  assert.equal(before.clos.length, 0); assert.ok(before.unmatched[0].missing.includes("Statement"));
  const after = parseWorkbook(odd, { clos: { columns: { statement: "What students do", bloom: "Taxo" } } });
  assert.deepEqual(after.clos, [{ code: "CLO-1", statement: "Explain stacks", bloom: "C2", ga: null }]);
});
