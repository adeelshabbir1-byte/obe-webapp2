import { test } from "node:test";
import assert from "node:assert/strict";
import { codeScripts, conflictOf, pickMarker, rankExaminers, splitSessions } from "../lib/examLogistics";

test("sessions by capacity", () => {
  assert.deepEqual(splitSessions(40, 40), [40]);
  assert.deepEqual(splitSessions(90, 40), [30, 30, 30]);
  assert.equal(splitSessions(90, 40).length, 3);
});
test("external examiner conflicts", () => {
  const pool = [{ id: "a", name: "A", institute: "Govt College Sahiwal", city: "Sahiwal", courses: "CS-201", relatives: "", duties: 0 }, { id: "b", name: "B", institute: "UET", city: "Lahore", courses: "CS-201", relatives: "", duties: 2 }, { id: "c", name: "C", institute: "NUST", city: "Islamabad", courses: "CS-201", relatives: "Govt College Sahiwal", duties: 0 }];
  const r = rankExaminers(pool, { course: "CS-201", collegeName: "Govt College Sahiwal", city: "Sahiwal" });
  assert.equal(r[0].id, "b");
  assert.ok(!r.find((x) => x.id === "a")!.ok && !r.find((x) => x.id === "c")!.ok);
  assert.ok(conflictOf(pool[0], "Govt College Sahiwal"));
});
test("script codes hide the order and markers skip the college", () => {
  let i = 0; const rand = () => ((i = (i * 9301 + 49297) % 233280) / 233280);
  const key = codeScripts(["R1", "R2", "R3"], rand);
  assert.equal(Object.keys(key).length, 3);
  assert.deepEqual(Object.values(key).sort(), ["R1", "R2", "R3"]);
  const ms = [{ name: "X", institute: "College B", scripts: 0 }, { name: "Y", institute: "UET", scripts: 5 }, { name: "Z", institute: "GCU", scripts: 1 }];
  assert.equal(pickMarker(ms, "College B")!.name, "Z");
  assert.equal(pickMarker(ms, "College B", "Z")!.name, "Y");
});
