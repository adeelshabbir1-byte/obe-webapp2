import { test } from "node:test";
import assert from "node:assert/strict";
import { windowState, whatIfAway, firstTimers } from "../lib/allocExtrasCore";
import type { PRow } from "../lib/yearPlan";

test("preference window", () => {
  const w = { opens: "2026-11-01", closes: "2026-11-15" };
  assert.equal(windowState(null).state, "NONE");
  assert.equal(windowState(w, new Date("2026-10-30T10:00:00")).state, "NOT_YET");
  assert.equal(windowState(w, new Date("2026-11-10T10:00:00")).state, "OPEN");
  assert.equal(windowState(w, new Date("2026-11-16T10:00:00")).state, "CLOSED");
});

const rows: PRow[] = [
  { key: "f1", term: "Fall 2026", summer: false, code: "CS101", title: "Programming", batch: "BSCS 26", sections: 2, teachers: [{ id: "a", name: "Ali", n: 2 }], visiting: 0 },
  { key: "f2", term: "Fall 2026", summer: false, code: "CS201", title: "Data Structures", batch: "BSCS 25", sections: 1, teachers: [{ id: "b", name: "Sara", n: 1 }], visiting: 0 },
];
test("what if a teacher is away: open sections and who could take them", () => {
  const pool = [
    { id: "a", name: "Ali", cap: 3, wants: new Set<string>(), taught: new Set(["CS101"]) },
    { id: "b", name: "Sara", cap: 2, wants: new Set(["CS101"]), taught: new Set<string>() },
    { id: "c", name: "Omar", cap: 3, wants: new Set<string>(), taught: new Set(["CS101"]) },
    { id: "d", name: "Hina", cap: 0, wants: new Set(["CS101"]), taught: new Set<string>() },
  ];
  const w = whatIfAway(rows, "a", pool);
  assert.deepEqual(w.after.find((t) => t.term === "Fall 2026"), { term: "Fall 2026", need: 3, done: 1 });
  assert.equal(w.open.length, 1);
  assert.equal(w.open[0].missing, 2);
  assert.deepEqual(w.open[0].suggest.map((s) => s.name), ["Sara", "Omar"]);
});
test("first-time courses", () => {
  assert.deepEqual(firstTimers(rows, new Set(["a|CS101"])).map((x) => `${x.teacher} ${x.code}`), ["Sara CS201"]);
});
