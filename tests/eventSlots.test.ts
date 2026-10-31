import test from "node:test";
import assert from "node:assert/strict";
import { runGeneticAlgorithm, type Slot } from "../lib/timetableGA";

// A pre-semester event holds its slot: no class of the batches it involves is put there.
const slot = (i: number, batch: string, teacher: string): Slot => ({ slotIndex: i, scheduleSectionId: `s${i}`, courseId: `c${i}`, batchIds: [`${batch}#A`], instructorId: teacher, roomTypeNeeded: "LECTURE", durationHours: 1.5, studentCount: 30, allowedDays: ["Mon"], dayStartHour: 8, dayEndHour: 12 });
const rooms = [{ id: "r1", type: "LECTURE", capacity: 50 }, { id: "r2", type: "LECTURE", capacity: 50 }];
const end = (g: { startHour: number }) => g.startHour + 1.5;

test("an event for one batch keeps that batch's classes out of its slot, not other batches'", () => {
  const slots = [slot(0, "b1", "t1"), slot(1, "b2", "t2")];
  const ev = [{ facultyId: "", dayOfWeek: "Mon", startHour: 8, endHour: 10.5, batchIds: ["b1"] }];
  const r = runGeneticAlgorithm(slots, rooms, ev, { maxGenerations: 300, timeBudgetMs: 4000 });
  assert.equal(r.hardViolations, 0);
  assert.ok(r.chromosome[0].startHour >= 10.5, "b1's class is after the event");
});

test("an event for every batch ([]) blocks all classes; a plain teacher block still works", () => {
  const slots = [slot(0, "b1", "t1"), slot(1, "b2", "t2")];
  const r = runGeneticAlgorithm(slots, rooms, [{ facultyId: "", dayOfWeek: "Mon", startHour: 8, endHour: 10.5, batchIds: [] }], { maxGenerations: 300, timeBudgetMs: 4000 });
  assert.equal(r.hardViolations, 0);
  assert.ok(r.chromosome.every((g) => g.startHour >= 10.5));
  const t = runGeneticAlgorithm(slots, rooms, [{ facultyId: "t2", dayOfWeek: "Mon", startHour: 10, endHour: 12 }], { maxGenerations: 300, timeBudgetMs: 4000 });
  assert.equal(t.hardViolations, 0);
  assert.ok(end(t.chromosome[1]) <= 10, "t2 teaches before their block");
});
