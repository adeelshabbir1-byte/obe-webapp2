import test from "node:test";
import assert from "node:assert/strict";
import { resolveTemplate, mergeConfig, headerRows, layoutSections, access, seenBy, DEFAULT_TEMPLATE, type TemplateRow } from "../lib/paperTemplateCore";

const row = (id: string, scope: TemplateRow["scope"], scopeId: string | null, examType = "ALL", over: Record<string, unknown> = {}): TemplateRow => ({ id, scope, scopeId, examType, config: mergeConfig({ instructions: id, ...over }) });

test("a CS department variant overrides the institute template for CS courses only; the exam type's own first", () => {
  const rows = [row("inst", "INSTITUTE", null), row("cs", "DEPARTMENT", "dep-cs"), row("cs-final", "DEPARTMENT", "dep-cs", "Final"), row("bba", "PROGRAM", "BBA")];
  assert.equal(resolveTemplate(rows, { departmentId: "dep-cs", program: "BS CS", examType: "Midterm" })!.id, "cs");
  assert.equal(resolveTemplate(rows, { departmentId: "dep-cs", program: "BS CS", examType: "Final" })!.id, "cs-final");
  assert.equal(resolveTemplate(rows, { departmentId: "dep-ms", program: "BS Math", examType: "Final" })!.id, "inst");
  assert.equal(resolveTemplate(rows, { departmentId: "dep-ms", program: "BBA", examType: "Quiz" })!.id, "bba", "a program variant first");
  assert.equal(resolveTemplate([], { departmentId: null, program: null, examType: "Final" }), null);
});

test("the header: chosen fields filled for the course, the teacher's edit wins, setter hidden", () => {
  const cfg = mergeConfig({ fields: { ...DEFAULT_TEMPLATE.fields, faculty: false, teacher: "HIDDEN" } });
  const h = headerRows(cfg, { institute: "Dream University", department: "Computing", course: "CS-201 Data Structures", date: "", teacher: "Dr X" }, { date: "2026-11-20" });
  const m = Object.fromEntries(h);
  assert.equal(m.Institute, "Dream University"); assert.equal(m.Course, "CS-201 Data Structures"); assert.equal(m.Date, "2026-11-20");
  assert.equal(m.Teacher, "Paper setter: hidden"); assert.equal(m.Faculty, undefined);
});

test("sections by question type with \"attempt any N of M\"; numbering Q1 (a) or 1.1", () => {
  const cfg = mergeConfig({ sections: [{ title: "Section A — MCQ", types: ["MCQ", "TRUE_FALSE"] }, { title: "Section B — Short", types: ["SHORT"], attemptAny: 2 }, { title: "Section C — Long", types: ["LONG"] }], numbering: "1.1" });
  const qs = [{ type: "LONG" }, { type: "MCQ" }, { type: "SHORT" }, { type: "SHORT" }, { type: "SHORT" }, { type: "CODE" }];
  const s = layoutSections(qs, cfg);
  assert.deepEqual(s.map((x) => [x.title, x.items.length]), [["Section A — MCQ", 1], ["Section B — Short", 3], ["Section C — Long", 2]]);
  assert.equal(s[1].note, "Attempt any 2 of 3.");
  assert.equal(s[0].items[0].no, "1."); assert.equal(s[2].items[0].partNo(1, "b"), "5.2");
  assert.equal(layoutSections(qs, mergeConfig({}))[0].items[2].partNo(0, "a"), "(a)");
});

test("a locked final: the teacher cannot open it, the HOD and Controller can; only the Controller downloads; open again on exam day", () => {
  const v = (o: Partial<Parameters<typeof access>[0]>) => ({ id: "u", isSetter: false, isHod: false, isController: false, isReviewer: false, ...o });
  const p = { locked: true, examDay: new Date("2026-12-10") }, now = new Date("2026-11-20");
  assert.equal(access(v({ isSetter: true }), p, now).open, false);
  assert.equal(access(v({ isHod: true }), p, now).open, true); assert.equal(access(v({ isHod: true }), p, now).download, false);
  assert.equal(access(v({ isController: true }), p, now).download, true);
  assert.equal(access(v({ isReviewer: true }), p, now).open, false);
  assert.equal(access(v({ isSetter: true }), p, new Date("2026-12-10T08:00:00")).open, true, "exam day");
  assert.equal(access(v({ isReviewer: true }), { locked: false, examDay: null }, now).open, true, "during vetting the reviewers see it");
  assert.equal(seenBy([{ name: "Dr X", role: "PL", action: "OPENED", at: new Date("2026-11-12T10:42:00Z") }, { name: "Ms C", role: "Controller", action: "DOWNLOADED", at: new Date("2026-11-13T09:15:00Z") }]), "Seen by: Dr X (PL) 12 Nov 10:42 · Ms C (Controller) 13 Nov 09:15 (downloaded)");
});
