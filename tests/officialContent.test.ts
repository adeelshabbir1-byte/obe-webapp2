import test from "node:test";
import assert from "node:assert/strict";
import { cloTags, fromMasterTopics, parseOutline, spreadTo32, planLine, isMidterm } from "../lib/officialContentCore";

test("CLO tags in a sub-topic: single, ranges, lists", () => {
  assert.deepEqual(cloTags("Sets, subsets [CLO1]"), [1]);
  assert.deepEqual(cloTags("Proof techniques [CLO1–3]"), [1, 2, 3]);
  assert.deepEqual(cloTags("Graphs (CLO-2, CLO-3)"), [2, 3]);
  assert.deepEqual(cloTags("no tag here"), []);
  assert.equal(isMidterm("Midterm"), true); assert.equal(isMidterm("Mid-term exam"), true); assert.equal(isMidterm("Middle element"), false);
});

test("Discrete Structures: GE116's 31 lectures kept exactly, CLO from the tag, L17 is the mid-term week", () => {
  const rows = Array.from({ length: 31 }, (_, i) => ({ lectureNumber: i + 1, topic: i === 16 ? "Midterm" : `Topic ${i + 1}`, subtopic: i === 16 ? null : `Sub ${i + 1} [CLO${(i % 3) + 1}]`, cloNumber: null }));
  const { lectures, tagged } = fromMasterTopics(rows, 0);
  assert.equal(lectures.length, 31);
  assert.deepEqual(tagged, [1, 2, 3]);
  assert.equal(lectures[0].topic, "Topic 1"); assert.equal(lectures[0].subtopic, "Sub 1 [CLO1]"); assert.equal(lectures[0].clo, "CLO-1");
  assert.equal(lectures[16].midterm, true); assert.equal(lectures[16].clo, null);
  assert.equal(lectures[30].week, 16);
});

const OUTLINE = `# HEC Quantitative Reasoning

## Course I — Exploring Quantitative Skills

| Week | Module | Goal | Topics |
|---|---|---|---|
| 1 | Module 1: Numbers | Number sense | Types of numbers; Place value |
| 2 | | | Ratios; Proportions |
| 3–4 | Module 2: Data | Read data | Tables; Charts; Graphs; Misleading graphs |

## Course II — Tools for Quantitative Reasoning

### Week 1
- Linear models
- Exponential models

### Week 2
- Matrices
`;

test("an HEC outline: the table of Course I and the headings of Course II, each in weekly order", () => {
  const one = parseOutline(OUTLINE, "Course I");
  assert.deepEqual(one.map((w) => w.week), [1, 2, 3, 4]);
  assert.deepEqual(one[0].topics, ["Types of numbers", "Place value"]);
  assert.equal(one[1].module, "Module 1: Numbers", "a blank module cell continues the module above");
  assert.deepEqual(one[2].topics, ["Tables", "Charts"]); assert.deepEqual(one[3].topics, ["Graphs", "Misleading graphs"]);
  const two = parseOutline(OUTLINE, "Course II");
  assert.deepEqual(two.map((w) => [w.week, w.topics]), [[1, ["Linear models", "Exponential models"]], [2, ["Matrices"]]]);
});

test("spread over 32 lectures by the weekly order; split lectures say so; no topic added", () => {
  const ls = spreadTo32(parseOutline(OUTLINE, "Course I"));
  assert.equal(ls.length, 32);
  assert.deepEqual(ls.map((l) => l.lecture), Array.from({ length: 32 }, (_, i) => i + 1));
  const weeks = ls.map((l) => l.week); assert.deepEqual(weeks, weeks.slice().sort((a, b) => a - b), "weekly order kept");
  const bases = new Set(ls.map((l) => l.splitFrom || l.topic));
  assert.deepEqual(Array.from(bases).sort(), ["Charts", "Graphs", "Misleading graphs", "Place value", "Proportions", "Ratios", "Tables", "Types of numbers"]);
  assert.ok(ls.every((l) => !l.splitFrom || l.topic.startsWith(l.splitFrom)));
  // More topics than lectures: same-week neighbours share a lecture.
  const many = spreadTo32([{ week: 1, module: null, topics: Array.from({ length: 40 }, (_, i) => `T${i + 1}`) }]);
  assert.equal(many.length, 32); assert.equal(many.flatMap((l) => l.topic.split("; ")).length, 40);
  assert.match(planLine({ clos: [{ code: "CLO-1", statement: "x", bloom: "C2" }], lectures: ls, missing: [] }), /1 CLO\(s\), 32 lecture\(s\), \d+ split/);
});
