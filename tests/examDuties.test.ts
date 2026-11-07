import { test } from "node:test";
import assert from "node:assert/strict";
import { assignDuties, dayRules, dutyCode, layoutSeats, neededFor, quotas, seatLabel, type DutySlot } from "../lib/examDutiesCore";
import { scheduleExams } from "../lib/examPlanner";

test("codes, seats, invigilators by room size, quotas (item 17)", () => {
  assert.equal(dutyCode(0, 0), "D1,1");
  assert.equal(seatLabel(9, 8), "R2-S2");
  assert.equal(layoutSeats({ rows: 10, cols: 8, blocked: 4 }), 76);
  assert.equal(neededFor(61, 30, 1), 3);
  assert.equal(neededFor(10, 0, 2), 2);
  assert.deepEqual(Array.from(quotas(10, ["a", "b", "c"], new Map([["c", 0]])).values()), [5, 5, 0]);
});
const slot = (date: string, s: number, rooms: DutySlot["rooms"], reserves = 0): DutySlot => ({ key: `${date}:${s}`, date, slot: s, slotsInDay: 3, rooms, reserves });
test("preferences, blocks, own course, no third duty in a row", () => {
  const slots = [0, 1, 2].map((s) => slot("2026-12-01", s, [{ roomId: "R1", need: 1, teachers: ["a"] }]));
  const r = assignDuties(slots, ["a", "b"], { prefs: new Map([["b", { perDay: 3 }], ["a", { perDay: 3 }]]), quota: new Map(), history: new Map(), blocked: (u) => (u === "b" ? null : null) });
  const who = slots.map((s) => r.bySlot.get(s.key)!.get("R1")![0]);
  assert.ok(!who.every((w) => w === "b"), "nobody does three in a row");
  assert.notEqual(r.bySlot.get(slots[0].key)!.get("R1")![0], "a", "not the only invigilator of their own course while someone else is free");
  const off = assignDuties([slot("2026-12-02", 2, [{ roomId: "R1", need: 1, teachers: [] }])], ["x", "y"], { prefs: new Map([["x", { unavailable: ["2026-12-02"] }]]), quota: new Map(), history: new Map(), blocked: (u) => (u === "y" ? "official work" : null) });
  assert.equal(off.unfilled, 1);
  const late = assignDuties([slot("2026-12-03", 0, [{ roomId: "R1", need: 1, teachers: [] }]), slot("2026-12-03", 2, [{ roomId: "R1", need: 1, teachers: [] }])], ["m", "n"], { prefs: new Map([["m", { time: "LAST" }]]), quota: new Map(), history: new Map(), blocked: () => null });
  assert.equal(late.bySlot.get("2026-12-03:2")!.get("R1")![0], "m");
});
test("date sheet: one paper per batch per day; core + core only when allowed", () => {
  assert.equal(dayRules({ batches: ["B1"], core: true, students: ["s"] }, [{ batches: ["B1"], core: false, students: new Set() }], () => false).batchClash, true);
  const g = (k: string, st: string[], b: string[], core: boolean) => ({ key: k, courseIds: [k], students: st, instructorIds: [], batches: b, core });
  const r = scheduleExams([g("A", ["s1"], ["B1"], true), g("B", ["s1"], ["B2"], true)], 2, 2, 2, 100, { allowCoreCore: false });
  assert.notEqual(r.placed.get("A")!.day, r.placed.get("B")!.day);
  const one = scheduleExams([g("A", ["s1"], ["B1"], true), g("B", ["s1"], ["B2"], true)], 1, 2, 2, 100, { allowCoreCore: false });
  assert.equal(one.placed.size, 2); assert.equal(one.bent.length, 1);
});
