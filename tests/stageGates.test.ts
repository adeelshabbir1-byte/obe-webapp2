import test from "node:test";
import assert from "node:assert/strict";
import { findCycle, gate1, gate2, gate3Course, gates, poolBuffer, translateCategory, type GCourse, type GType } from "../lib/stageGateCore";

// HEC stage-gates.
const types: GType[] = [
  { name: "Computing Core", kind: "CORE", minCourses: 2, minCredits: 6 },
  { name: "Elective slots", kind: "ELECTIVE_SLOT", minCourses: 2, minCredits: 6 },
  { name: "Elective pool", kind: "ELECTIVE_LIST", minCourses: null, minCredits: null },
];
const course = (id: string, category: string, extra: Partial<GCourse> = {}): GCourse => ({
  id, code: id.toUpperCase(), title: id, creditHours: 3, labCredits: 0, category, description: "About it.", prerequisiteId: null, noPrereq: true,
  clos: [1, 2, 3, 4].map((n) => ({ id: `${id}-c${n}`, n, bloom: "C3", ploIds: ["p1"] })), weights: [],
  topics: Array.from({ length: 32 }, (_, i) => ({ lecture: i + 1, cloNumber: (i % 4) + 1 })), labWeeks: [], topicDeps: [], ...extra,
});

test("gate 1: total degree credit hours set; categories complete; sum equals the total exactly", () => {
  assert.match(gate1(null, types)[0].text, /total degree credit hours/);
  assert.equal(gate1(12, types).length, 0);
  assert.match(gate1(13, types).map((i) => i.text).join(), /add up to 12, not the degree's 13 — 1 short/);
  assert.match(gate1(12, [...types, { name: "IDS", kind: "IDS", minCourses: null, minCredits: 3 }]).map((i) => i.text).join(), /IDS: set the minimum number of courses/);
});

test("gate 2: mandatory categories filled; an elective pool needs a 1.5× choice buffer (4 → 6)", () => {
  assert.equal(poolBuffer(4), 6);
  const cs = [course("a", "Computing Core"), course("b", "Computing Core"), course("s1", "Elective slots"), course("s2", "Elective slots"), course("e1", "Elective pool"), course("e2", "Elective pool")];
  assert.match(gate2(types, cs).map((i) => i.text).join(), /2 course\(s\) in the pool; students take 2, so it needs at least 3/);
  assert.equal(gate2(types, [...cs, course("e3", "Elective pool")]).length, 0);
  assert.match(gate2(types, cs.slice(1)).map((i) => i.text).join(), /Computing Core: 1 course\(s\), needs 2/);
});

test("gate 3: basic info, contact hours with a 16-week lab plan, ≥ 4 CLOs, matrix to 100%, 16 weeks of topics, acyclic", () => {
  const ok = course("a", "Computing Core");
  assert.equal(gate3Course(ok, [ok]).pct, 100);
  const lab = course("l", "Computing Core", { labCredits: 1 });
  assert.match(gate3Course(lab, [lab]).parts.find((p) => p.key === "contact")!.why[0], /48 contact hours: the 16-week lab experiment plan has 0/);
  assert.equal(gate3Course({ ...lab, labWeeks: Array.from({ length: 16 }, (_, i) => i + 1) }, [lab]).pct, 100);
  const three = course("t", "Computing Core", { clos: [1, 2, 3].map((n) => ({ id: `t${n}`, n, bloom: "C2", ploIds: ["p1"] })) });
  assert.match(gate3Course(three, [three]).parts.find((p) => p.key === "clos")!.why[0], /at least 4/);
  const w = course("w", "Computing Core", { weights: [{ cloId: "w-c1", ploId: "p1", pct: 50 }, { cloId: "w-c2", ploId: "p1", pct: 30 }, { cloId: "w-c3", ploId: "p1", pct: 10 }, { cloId: "w-c4", ploId: "p1", pct: 5 }] });
  assert.match(gate3Course(w, [w]).parts.find((p) => p.key === "matrix")!.why[0], /95%, not 100%/);
  const noPre = course("n", "Computing Core", { noPrereq: false, description: "" });
  assert.equal(gate3Course(noPre, [noPre]).parts.find((p) => p.key === "basic")!.why.length, 2);
  const short = course("s", "Computing Core", { topics: Array.from({ length: 30 }, (_, i) => ({ lecture: i + 1, cloNumber: 1 })) });
  assert.match(gate3Course(short, [short]).parts.find((p) => p.key === "topics")!.why[0], /15 week\(s\)/);
  assert.deepEqual(findCycle([["a", "b"], ["b", "c"], ["c", "a"]]), ["a", "b", "c", "a"]);
  assert.equal(findCycle([["a", "b"], ["b", "c"]]), null);
  const x = course("x", "Computing Core", { topicDeps: [{ lecture: 3, onCourseId: "y", onLecture: 2 }] }), y = course("y", "Computing Core", { topicDeps: [{ lecture: 2, onCourseId: "x", onLecture: 3 }] });
  assert.match(gate3Course(x, [x, y]).parts.find((p) => p.key === "topics")!.why.join(), /cycle/);
});

test("publish only when every gate passes and compliant courses = total", () => {
  const cs = [course("a", "Computing Core"), course("b", "Computing Core"), course("s1", "Elective slots"), course("s2", "Elective slots"), ...[1, 2, 3].map((i) => course(`e${i}`, "Elective pool"))];
  assert.equal(gates(12, types, cs).publishable, true);
  assert.equal(gates(13, types, cs).publishable, false);
  assert.equal(gates(13, types, cs).open2, false);
  assert.equal(gates(12, types, [...cs.slice(0, 6), course("e3", "Elective pool", { clos: [] })]).publishable, false);
});

test("evolutionary seeding: categories translated by the convener's map", () => {
  const map = [{ fromName: "Computing Core", toName: "Foundational Computing" }];
  assert.equal(translateCategory("computing core", map), "Foundational Computing");
  assert.equal(translateCategory("Mathematics", map), null);
});
