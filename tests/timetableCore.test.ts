import { test } from "node:test";
import assert from "node:assert/strict";
import { clashes, freeSlots, mostFree, whoIsFree, type E } from "../lib/timetableCore";

const e = (id: string, day: string, s: number, en: number, t: string, room: string, sec: string[]): E => ({ id, dayOfWeek: day, startHour: s, endHour: en, courseCode: id, instructorId: t, instructorName: t, roomId: room, roomName: room, batchLabels: [], sectionKeys: sec });
const es = [e("A", "Monday", 8, 9.5, "t1", "r1", ["s1"]), e("B", "Monday", 9, 10.5, "t1", "r2", ["s2"]), e("C", "Monday", 11, 12.5, "t2", "r1", ["s1"]), e("D", "Monday", 13, 14.5, "t3", "r2", ["s1"])];
const rooms = [{ id: "r1", name: "R1", type: "LECTURE", capacity: 50 }, { id: "r2", name: "R2", type: "LECTURE", capacity: 50 }];
test("a teacher in two rooms at once is a clash", () => { assert.equal(clashes(es)[0].why, "teacher t1"); });
test("free-slot finder returns only times every chosen section is free, with a room", () => {
  const f = freeSlots(es, rooms, { sections: ["s1", "s2"], days: ["Monday"], from: 8, to: 17, minHours: 1 });
  for (const x of f) assert.ok(!es.some((y) => (y.sectionKeys.includes("s1") || y.sectionKeys.includes("s2")) && y.startHour < x.end && x.start < y.endHour));
  assert.ok(f.length > 0 && f[0].rooms.length > 0);
});
test("most-free ranks by free sections; who-is-free needs a class before and after", () => {
  assert.equal(mostFree(es, ["s1", "s2"])[0].free, 2);
  assert.deepEqual(whoIsFree(es, "Monday", 10.75, ["s1", "s2"], []).sections, ["s1"]);
});
