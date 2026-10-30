import test from "node:test";
import assert from "node:assert/strict";
import { compliance, lockedCloChange, lockedCourseChange, synthesisChecks, synthesize, type Parts } from "../lib/synthesisCore";

// Hybrid synthesis and Golden Copy guardrails.
const parts = (tag: string, extra: Partial<Parts> = {}): Parts => ({
  description: `Description ${tag}`, clos: [1, 2, 3, 4].map((i) => ({ statement: `${tag} CLO ${i}`, bloom: "C3" })),
  topics: Array.from({ length: 32 }, (_, i) => ({ n: i + 1, topic: `${tag} topic ${i + 1}`, clo: (i % 4) + 1 })),
  labPlan: [], assessments: [{ type: "Quiz", pct: 20 }, { type: "Final", pct: 80 }], books: [{ title: `${tag} book`, kind: "TEXT" }], ...extra,
});
const props = [{ id: "A", author: "Teacher A", parts: parts("A") }, { id: "B", author: "Teacher B", parts: parts("B") }, { id: "C", author: "Teacher C", parts: parts("C", { assessments: [{ type: "Quiz", pct: 10 }, { type: "Mid", pct: 30 }, { type: "Final", pct: 60 }] }) }];
const course = { id: "x", code: "CS-101", title: "PF", creditHours: 3, labCredits: 0, category: "Core", prerequisiteId: null, noPrereq: true, ploOf: () => ["p1"] };

test("synthesis: base from A, weeks 5–8 from B, assessments and books from C", () => {
  const s = synthesize(props, { base: "A", modules: ["A", "B", "A", "A"], lab: "A", assessments: "C", books: "C" });
  assert.equal(s.description, "Description A");
  assert.equal(s.clos[0].statement, "A CLO 1");
  assert.equal(s.topics[8].topic, "B topic 9");
  assert.equal(s.topics[16].topic, "A topic 17");
  assert.equal(s.topics.length, 32);
  assert.equal(s.assessments.length, 3);
  assert.equal(s.books[0].title, "C book");
  assert.equal(synthesisChecks(s, course).ok, true);
});

test("every merge is checked: weeks missing, assessments not 100, Golden Copy content lost", () => {
  const short = { ...props[1], parts: parts("B", { topics: parts("B").topics.slice(0, 12) }) };
  const s = synthesize([props[0], short, props[2]], { base: "A", modules: ["A", "B", "A", "A"], lab: "A", assessments: "A", books: "A" });
  assert.ok(synthesisChecks(s, course).issues.some((i) => /week/.test(i)));
  const bad = synthesize([props[0], { ...props[2], parts: parts("C", { assessments: [{ type: "Quiz", pct: 50 }] }) }], { base: "A", modules: ["A", "A", "A", "A"], lab: "A", assessments: "C", books: "A" });
  assert.ok(synthesisChecks(bad, course).issues.some((i) => /add up to 50%/.test(i)));
  const golden = { clos: ["A CLO 1", "A CLO 2"], topics: ["A topic 9"] };
  const fromB = synthesize(props, { base: "A", modules: ["A", "B", "A", "A"], lab: "A", assessments: "A", books: "A" });
  assert.ok(synthesisChecks(fromB, course, golden).issues.some((i) => /core topic/.test(i)));
  assert.equal(synthesisChecks(synthesize(props, { base: "A", modules: ["A", "A", "A", "A"], lab: "A", assessments: "A", books: "B" }), course, golden).ok, true);
});

test("compliance meter: 100% green; local electives → yellow; core mandates missing → red", () => {
  const g = Array.from({ length: 10 }, (_, i) => ({ code: `CS-10${i}`, title: `Course ${i}`, creditHours: 3, category: "Core", pool: false, clos: ["a", "b", "c", "d"], topics: ["t1", "t2"] }));
  assert.deepEqual([compliance(g, g).score, compliance(g, g).band], [100, "GREEN"]);
  const local = [...g, { code: "LOC-1", title: "Local elective", creditHours: 3, category: "Elective", pool: false, clos: [], topics: [] }];
  assert.equal(compliance(g, local).band, "YELLOW");
  assert.deepEqual(compliance(g, local).extras, ["LOC-1 Local elective"]);
  assert.equal(compliance(g, g.slice(0, 7)).band, "RED");
  assert.equal(compliance(g, g.slice(0, 7)).missing.length, 3);
});

test("locked fields: code, title, credit hours, removing a mandatory course; electives from the pool may be dropped", () => {
  const gc = { code: "CS-101", title: "Programming Fundamentals", creditHours: 4, category: "Core", pool: false, clos: [], topics: [] };
  assert.match(lockedCourseChange(gc, { creditHours: 3 })!, /credit hours \(4\)/);
  assert.match(lockedCourseChange(gc, { code: "CS-111" })!, /code CS-101/);
  assert.match(lockedCourseChange(gc, { remove: true })!, /can't be removed/);
  assert.equal(lockedCourseChange({ ...gc, pool: true }, { remove: true }), null);
  assert.equal(lockedCourseChange(gc, { title: "programming fundamentals" }), null);
  assert.match(lockedCloChange(["Apply basic programming concepts"], "Apply basic programming concepts", { statement: "Use programming" })!, /mandatory/);
  assert.equal(lockedCloChange(["Apply basic programming concepts"], "My own CLO", { remove: true }), null);
});
