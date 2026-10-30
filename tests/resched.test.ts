import test from "node:test";
import assert from "node:assert/strict";
import { blackout, decide, eventConflicts, freeSlots, makeupSlots, rankSlots, type ClassSlot } from "../lib/reschedCore";

// Smart scheduling and rescheduling rules.
const cls = (id: string, day: string, start: number, end: number, batch: string, instructor = "t1"): ClassSlot => ({ entryId: id, courseId: id, code: id.toUpperCase(), batchIds: [batch], day, start, end, instructorId: instructor });
const classes = [cls("a", "Mon", 8, 9.5, "b1"), cls("b", "Mon", 10, 11.5, "b2"), cls("c", "Tue", 8, 11, "b1", "t2")];

test("free slots for chosen batches, and slots ranked by fewest affected classes", () => {
  const f = freeSlots(classes, ["b1"], { days: ["Mon"], from: 8, to: 12, length: 1 });
  assert.ok(!f.some((s) => s.start === 8 || s.start === 9));
  assert.ok(f.some((s) => s.start === 10), "b2's class doesn't block b1");
  const r = rankSlots(classes, ["b1", "b2"], { days: ["Mon"], from: 8, to: 12, length: 2, step: 1 });
  assert.equal(r[r.length - 1].affected.length, 2, "Mon 9–11 hits both");
  assert.equal(r[0].affected.length, 1, "every 2-hour Monday window hits one class; 9–11 is the worst");
});

test("blackouts: the week before the midterms and the last week of the semester", () => {
  const s = { semesterStart: new Date("2026-09-01"), midtermStart: new Date("2026-10-26"), finalStart: new Date("2026-12-21") };
  assert.equal(blackout(new Date("2026-10-20"), s), "the week before the midterms");
  assert.equal(blackout(new Date("2026-12-15"), s), "the last week of the semester");
  assert.equal(blackout(new Date("2026-10-12"), s), null);
  assert.equal(blackout(new Date("2026-10-26"), s), null, "the midterm week itself is not the week before");
});

test("the path: Dean first, then Program Lead and teacher; a visiting teacher who can't come blocks it", () => {
  const r0 = { status: "PENDING_DEAN" as const, visiting: true, plOk: null, facultyOk: null };
  assert.throws(() => decide(r0, "PL", true), /Dean reviews it first/);
  const p = decide(r0, "DEAN", true);
  assert.equal(p.status, "PROVISIONAL");
  const pl = decide(p, "PL", true);
  assert.equal(pl.status, "PROVISIONAL");
  assert.equal(decide(pl, "FACULTY", false).status, "BLOCKED");
  assert.equal(decide(pl, "FACULTY", true).status, "APPROVED");
  const perm = decide({ ...p, visiting: false }, "FACULTY", false);
  assert.equal(perm.status, "REJECTED");
  assert.equal(decide(r0, "DEAN", false).status, "REJECTED");
});

test("force majeure: every class of the closed day gets a make-up slot outside blackouts, free for its batch and teacher", () => {
  const s = { semesterStart: null, midtermStart: null, finalStart: null };
  const mon = new Date("2026-11-02"); // a Monday
  const all = [...classes, cls("d", "Tue", 11, 12.5, "b1")];
  const r = makeupSlots(mon, classes.filter((c) => c.day === "Mon"), all, s);
  assert.equal(r.plan.length, 2);
  const a = r.plan.find((p) => p.entryId === "a")!;
  assert.equal(a.date, "2026-11-03");
  assert.ok(a.start >= 12.5, "after b1's Tuesday classes (8–11 and 11–12:30)");
  assert.deepEqual(r.unplaced, []);
});

test("pre-semester events lock their slot and flag clashing classes", () => {
  const c = eventConflicts([{ id: "e", title: "Convocation", day: "Mon", start: 9, end: 12, batchIds: [] }], classes);
  assert.deepEqual(c.map((x) => x.code), ["A", "B"]);
  assert.deepEqual(eventConflicts([{ id: "e", title: "Seminar", day: "Mon", start: 9, end: 12, batchIds: ["b2"] }], classes).map((x) => x.code), ["B"]);
});
