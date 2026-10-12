import { test } from "node:test";
import assert from "node:assert/strict";
import { examDays, scheduleExams, allocateRooms, assignInvigilators, seatOrder, type Group } from "../lib/examPlanner";

test("exam days skip off weekdays and holidays", () => {
  const days = examDays(new Date("2026-12-14T00:00:00Z"), new Date("2026-12-27T00:00:00Z"), [0, 6], new Set(["2026-12-25"]));
  const iso = days.map((d) => d.toISOString().slice(0, 10));
  assert.equal(iso.length, 9);
  assert.ok(!iso.includes("2026-12-25"));
  assert.ok(days.every((d) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6));
});

// 20 papers over 4 cohorts of 40 students, with some students sitting papers of two cohorts.
function groups(): Group[] {
  const out: Group[] = [];
  for (let c = 0; c < 4; c++) for (let p = 0; p < 5; p++) {
    const students = Array.from({ length: 40 }, (_, i) => `s${c}-${i}`);
    if (p === 0) students.push(`s${(c + 1) % 4}-0`, `s${(c + 1) % 4}-1`); // repeaters from the next cohort
    out.push({ key: `C${c}P${p}`, courseIds: [`C${c}P${p}`], students, instructorIds: [`t${c}`] });
  }
  return out;
}

test("date sheet: every paper placed, no student clash, at most maxPerDay a day, seats respected", () => {
  const gs = groups();
  const { placed, unplaced } = scheduleExams(gs, 10, 2, 1, 200);
  assert.equal(unplaced.length, 0);
  assert.equal(placed.size, gs.length);
  const slot = new Map<string, string>(), day = new Map<string, number>(), seats = new Map<string, number>();
  for (const g of gs) {
    const p = placed.get(g.key)!;
    const k = `${p.day}:${p.slot}`;
    seats.set(k, (seats.get(k) || 0) + g.students.length);
    for (const s of g.students) {
      assert.ok(!slot.has(`${s}|${k}`), `${s} has two papers in slot ${k}`);
      slot.set(`${s}|${k}`, g.key);
      day.set(`${s}|${p.day}`, (day.get(`${s}|${p.day}`) || 0) + 1);
    }
  }
  assert.ok(Array.from(day.values()).every((n) => n <= 1));
  assert.ok(Array.from(seats.values()).every((n) => n <= 200));
});

test("date sheet reports papers it cannot place instead of clashing", () => {
  const { unplaced } = scheduleExams(groups(), 2, 1, 1, 1000);
  assert.ok(unplaced.length > 0);
});

test("pinned papers keep their day and slot", () => {
  const gs = groups();
  gs[3].pinned = { day: 4, slot: 1 };
  const { placed } = scheduleExams(gs, 10, 2, 2, 500);
  assert.deepEqual(placed.get(gs[3].key), { day: 4, slot: 1 });
});

test("rooms never overfill; overflow is reported as short", () => {
  const r = allocateRooms([{ courseId: "A", students: Array.from({ length: 50 }, (_, i) => `a${i}`) }, { courseId: "B", students: Array.from({ length: 30 }, (_, i) => `b${i}`) }], [{ id: "R1", seats: 40 }, { id: "R2", seats: 30 }]);
  assert.equal(r.short, 10);
  for (const u of r.uses) assert.ok(u.students.length <= (u.roomId === "R1" ? 40 : 30));
});

test("invigilators: never two rooms at once, never someone unavailable, duties spread evenly", () => {
  const slots = Array.from({ length: 6 }, (_, i) => ({ key: `0:${i}`, rooms: [{ roomId: "R1", instructorIds: ["t1"] }, { roomId: "R2", instructorIds: [] }] }));
  const { bySlot, duties, unfilled } = assignInvigilators(slots, ["t1", "t2", "t3", "t4"], 1, (k) => new Set(k === "0:0" ? ["t2"] : []));
  assert.equal(unfilled, 0);
  for (const [k, rooms] of Array.from(bySlot.entries())) {
    const people = Array.from(rooms.values()).flat();
    assert.equal(new Set(people).size, people.length, `double-booked in ${k}`);
    if (k === "0:0") assert.ok(!people.includes("t2"));
  }
  const counts = Array.from(duties.values());
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
});

test("seats interleave papers so neighbours write different papers", () => {
  const seats = seatOrder([
    ...["1", "2", "3"].map((r) => ({ studentId: `a${r}`, courseId: "A", roll: r })),
    ...["1", "2", "3"].map((r) => ({ studentId: `b${r}`, courseId: "B", roll: r })),
  ]);
  for (let i = 1; i < seats.length; i++) assert.notEqual(seats[i].courseId, seats[i - 1].courseId);
  assert.deepEqual(seats.map((s) => s.seat), [1, 2, 3, 4, 5, 6]);
});
