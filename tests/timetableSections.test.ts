import test from "node:test";
import assert from "node:assert/strict";

// Department timetable: student sections of at most 50, combined classes never over 50, clashes per student section.

test("a batch is split into even sections of at most 50", async () => {
  const { splitSizes } = await import("../lib/studentSections");
  assert.deepEqual(splitSizes(120), [40, 40, 40]);
  assert.deepEqual(splitSizes(51), [26, 25]);
  assert.deepEqual(splitSizes(50), [50]);
  assert.deepEqual(splitSizes(101), [34, 34, 33]);
  assert.deepEqual(splitSizes(0), [0]);
  assert.deepEqual(splitSizes(70, 30), [24, 23, 23]);
});

test("combined classes never go over 50", async () => {
  const { packCombined, packNote } = await import("../lib/studentSections");
  const it = (b: string, size: number) => ({ key: `${b}#A`, batchId: b, size });
  const two30 = [it("X", 30), it("Y", 30)];
  const a = packCombined(two30);
  assert.equal(a.length, 2, "30 + 30 = 60 > 50: not combined");
  assert.equal(packNote(two30, a), "not combined — 30 + 30 = 60 > 50");
  const b = packCombined([it("X", 20), it("Y", 25)]);
  assert.equal(b.length, 1);
  assert.equal(b[0].total, 45);
  const three = [it("X", 30), it("Y", 20), it("Z", 15)];
  const c = packCombined(three);
  assert.deepEqual(c.map((x) => x.total).sort((p, q) => q - p), [50, 15]);
  assert.ok(c.every((x) => x.total <= 50), "no class over 50");
  assert.equal(c.flatMap((x) => x.items).length, 3, "no student section split or lost");
  assert.match(packNote(three, c), /combined into 2 classes \(50, 15\)/);
  // two sections of the same batch are never put in one class
  assert.equal(packCombined([{ key: "X#A", batchId: "X", size: 20 }, { key: "X#B", batchId: "X", size: 20 }]).length, 2);
});

test("the section plan: one section per student section, teachers in order, the rest to be assigned", async () => {
  const { planSections } = await import("../lib/studentSections");
  const course = (id: string, batchId: string, extra: Record<string, unknown> = {}) => ({ id, code: id, batchId, batchLabel: batchId, courseType: "Core", isNonCredit: false, contactHours: null, instructorId: null, assignments: [], groupId: null, ...extra });
  const sections = new Map([["BIG", [{ label: "A", size: 40 }, { label: "B", size: 40 }, { label: "C", size: 40 }]], ["X", [{ label: "A", size: 30 }]], ["Y", [{ label: "A", size: 30 }]], ["P", [{ label: "A", size: 20 }]], ["Q", [{ label: "A", size: 25 }]]]);
  const plan = planSections([course("CS101", "BIG", { assignments: [{ instructorId: "T1", sectionCount: 1 }] })], [], sections);
  assert.deepEqual(plan.sections.map((s) => s.label), ["Section A", "Section B", "Section C"]);
  assert.deepEqual(plan.sections.map((s) => s.instructorId), ["T1", null, null]);
  assert.equal(plan.toAssign.length, 2, "missing sections are listed, not dropped");
  assert.ok(plan.sections.every((s) => s.covers.reduce((a, c) => a + c.size, 0) <= 50));

  // 30 + 30: each taught as its own section; 20 + 25: one combined class of 45
  const g = planSections([course("M1", "X", { groupId: "G", instructorId: "T1" }), course("M2", "Y", { groupId: "G", instructorId: "T2" }), course("M3", "P", { groupId: "H" }), course("M4", "Q", { groupId: "H" })],
    [{ id: "G", name: "Maths (X/Y)", assignments: [] }, { id: "H", name: "Maths (P/Q)", assignments: [{ instructorId: "T9", sectionCount: 1 }] }], sections);
  const combined = g.sections.filter((s) => s.groupId);
  assert.equal(combined.length, 1);
  assert.equal(combined[0].groupId, "H");
  assert.equal(combined[0].covers.reduce((a, c) => a + c.size, 0), 45);
  assert.equal(combined[0].instructorId, "T9");
  assert.deepEqual(g.sections.filter((s) => s.courseId).map((s) => `${s.courseId}:${s.instructorId}`).sort(), ["M1:T1", "M2:T2"]);
  assert.ok(g.groupNotes.some((n) => n.note === "not combined — 30 + 30 = 60 > 50"));
});

test("Section A and Section B of one batch may run at once; Section A in two classes at once is a clash", async () => {
  const { runGeneticAlgorithm } = await import("../lib/timetableGA");
  const slot = (i: number, keys: string[], teacher: string) => ({ slotIndex: i, scheduleSectionId: `S${i}`, courseId: null, batchIds: keys, instructorId: teacher, roomTypeNeeded: "LECTURE", durationHours: 1.5, studentCount: 40, allowedDays: ["Mon"], dayStartHour: 8, dayEndHour: 9.5 });
  const rooms = [{ id: "R1", type: "LECTURE", capacity: 50 }, { id: "R2", type: "LECTURE", capacity: 50 }];
  // only one possible time (Mon 08:00-09:30), so both are at the same time
  let best = Infinity;
  for (let k = 0; k < 5 && best > 0; k++) best = Math.min(best, runGeneticAlgorithm([slot(0, ["B1#A"], "T1"), slot(1, ["B1#B"], "T2")], rooms, [], { timeBudgetMs: 1500 }).hardViolations);
  assert.equal(best, 0, "different sections of one batch don't clash");
  const clash = runGeneticAlgorithm([slot(0, ["B1#A"], "T1"), slot(1, ["B1#A", "B2#A"], "T2")], rooms, [], { timeBudgetMs: 800 });
  assert.ok(clash.hardViolations > 0, "the same section can't be in two classes at once");
});

test("the timetable pages and services treat the Department Coordinator as themself", async () => {
  const { isDeptCoordinatorPath } = await import("../lib/deptCoordinator");
  for (const p of ["/coordinator/timetable", "/api/coordinator/timetable/generate", "/api/coordinator/schedule-sections/auto-generate", "/api/coordinator/rooms", "/api/coordinator/faculty-unavailability"]) assert.equal(isDeptCoordinatorPath(p), false, p);
  assert.equal(isDeptCoordinatorPath("/coordinator/students"), true, "other pages still work for the picked program");
});
