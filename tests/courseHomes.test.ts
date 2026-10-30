import test from "node:test";
import assert from "node:assert/strict";
import { assignCodes, chainsForDept, duplicateCodes, findMatches, homeBase, proposeHome, subjectKey, suggestChain, type Dept, type Program, type Subject } from "../lib/courseHomeCore";

// Course homes and PREFIX-YCN codes, and the content-sync base that follows the home.
const CS = "d-cs", MG = "d-mg", MT = "d-mt", EN = "d-en";
const depts: Dept[] = [{ id: CS, name: "Computer Science", prefix: "CS" }, { id: MG, name: "Management Sciences", prefix: "MG" }, { id: MT, name: "Mathematics", prefix: "MT" }];
const programs: Program[] = [{ name: "BSCS", departmentId: CS, prefix: "CS" }, { name: "BSAI", departmentId: CS, prefix: "AI" }, { name: "BSSE", departmentId: CS, prefix: "SE" }, { name: "BBA", departmentId: MG, prefix: "BA" }];
const use = (program: string, semester = 1, category = "Core") => ({ courseId: `${program}-${semester}`, program, departmentId: programs.find((p) => p.name === program)!.departmentId, semester, category });
const S = (title: string, uses: ReturnType<typeof use>[]): Subject => ({ key: subjectKey(title), title, isLab: /lab/i.test(title), uses });

test("prefixes: shared in a department → CS; one program → AI; English → EN or GE; Calculus in CS and BBA → MT", () => {
  assert.equal(proposeHome(S("Data Structures", [use("BSCS", 3), use("BSAI", 3)]), depts, programs).prefix, "CS");
  assert.equal(proposeHome(S("Data Structures", [use("BSCS", 3), use("BSAI", 3)]), depts, programs).level, "DEPARTMENT");
  const ai = proposeHome(S("Computer Vision", [use("BSAI", 7)]), depts, programs);
  assert.equal(ai.prefix, "AI"); assert.equal(ai.level, "PROGRAM");
  const eng = S("Functional English", [use("BSCS", 1, "General Education"), use("BBA", 1, "General Education")]);
  assert.equal(proposeHome(eng, [...depts, { id: EN, name: "English", prefix: "EN" }], programs).prefix, "EN");
  assert.equal(proposeHome(eng, depts, programs).prefix, "GE");
  assert.equal(proposeHome(eng, depts, programs).level, "GE");
  const calc = proposeHome(S("Calculus and Analytical Geometry", [use("BSCS", 1), use("BBA", 1)]), depts, programs);
  assert.equal(calc.prefix, "MT"); assert.equal(calc.level, "SERVICE");
});

test("codes: first programming course in S1 → CS-101, the next → CS-102, its lab → CS-101L; a 10th in a chain is flagged", () => {
  const chains = chainsForDept("Computer Science");
  assert.equal(suggestChain("Programming Fundamentals", chains), 0);
  assert.equal(suggestChain("Computer Networks", chains), 1);
  const rows = [
    { key: subjectKey("Programming Fundamentals"), title: "Programming Fundamentals", isLab: false, prefix: "CS", semester: 1, chain: 0 },
    { key: subjectKey("Programming Fundamentals Lab"), title: "Programming Fundamentals Lab", isLab: true, prefix: "CS", semester: 1, chain: 0 },
    { key: subjectKey("Object Oriented Programming"), title: "Object Oriented Programming", isLab: false, prefix: "CS", semester: 2, chain: 0 },
  ];
  const c = assignCodes(rows);
  assert.deepEqual(c.map((x) => x.code), ["CS-101", "CS-101L", "CS-102"]);
  const ten = Array.from({ length: 10 }, (_, i) => ({ key: `k${i}`, title: `Programming ${i}`, isLab: false, prefix: "CS", semester: 1, chain: 0 }));
  const t = assignCodes(ten);
  assert.equal(t[8].code, "CS-109");
  assert.equal(t[9].code, null);
  assert.match(t[9].flags[0], /full/);
  assert.deepEqual(duplicateCodes([{ key: "a", code: "CS-101" }, { key: "b", code: "CS-101" }]).map((d) => d.code), ["CS-101"]);
});

test("an approved code is kept when the course moves semester; only renumbering changes it", () => {
  const moved = assignCodes([{ key: "pf", title: "Programming Fundamentals", isLab: false, prefix: "CS", semester: 3, chain: 0, approvedCode: "CS-101" }, { key: "x", title: "New course", isLab: false, prefix: "CS", semester: 1, chain: 0 }]);
  assert.equal(moved[0].code, "CS-101");
  assert.equal(moved[1].code, "CS-102", "number 1 is still taken by the approved code");
  assert.equal(assignCodes([{ key: "pf", title: "Programming Fundamentals", isLab: false, prefix: "CS", semester: 3, chain: 0, approvedCode: "CS-101", renumber: true }])[0].code, "CS-201");
});

test("the same course across degrees is found by meaning, with a reason", () => {
  const m = findMatches([{ key: "a", title: "Linked Lists and Data Structures" }, { key: "b", title: "Data Structure" }, { key: "c", title: "Marketing" }]);
  assert.ok(m.some((x) => [x.a, x.b].sort().join() === "a,b" && /titles alike/.test(x.reason)));
  assert.ok(!m.some((x) => x.a === "c" || x.b === "c"));
});

test("content-sync base follows the home", () => {
  const copies = [
    { courseId: "se-2025", program: "BSSE", departmentId: CS, startKey: 4050, hasBatch: true },
    { courseId: "cs-2026", program: "BSCS", departmentId: CS, startKey: 4052, hasBatch: true },
    { courseId: "se-2024", program: "BSSE", departmentId: CS, startKey: 4048, hasBatch: true },
  ];
  assert.equal(homeBase(copies, { level: "PROGRAM", departmentId: CS, program: "BSSE", prefix: "SE", reason: "" }), "se-2025");
  const calc = [{ courseId: "cs-calc", program: "BSCS", departmentId: CS, startKey: 4052, hasBatch: true }, { courseId: "mt-copy", program: null, departmentId: MT, startKey: 0, hasBatch: false }];
  assert.equal(homeBase(calc, { level: "SERVICE", departmentId: MT, program: null, prefix: "MT", reason: "" }), "mt-copy");
  assert.equal(homeBase([calc[0]], { level: "SERVICE", departmentId: MT, program: null, prefix: "MT", reason: "" }), null, "no Maths copy yet: the caller makes a department-level copy");
  assert.equal(homeBase(copies, { level: "DEPARTMENT", departmentId: CS, program: null, prefix: "CS", reason: "", leadProgram: "BSSE" }), "se-2025");
});
