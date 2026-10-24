import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "zlib";
import { KINDS, kindOf, autoMap, headerRow, mappedRows } from "../lib/dataImport";
import { rankByCgpa } from "../lib/examController";
import { readBackup, TABLES } from "../lib/instituteBackup";
import { ipOf } from "../lib/rateLimit";
import { isLab, toolGa, kindOf as courseKind } from "../lib/gaCoverage";

test("data import: finds the heading row below a title and matches owner's own column names", () => {
  const k = kindOf("students")!;
  const grid = [["Enrolled Students Fall 2026"], [], ["Sr", "Reg No", "Student Name", "Semester"], ["1", "2026-CS-001", "Ali Khan", "1"], ["2", "2026-CS-002", "Sara", ""], ["", "", "", ""]];
  const hi = headerRow(grid, k);
  assert.equal(hi, 2);
  const map = autoMap(grid[hi], k);
  assert.deepEqual(map, { rollNumber: 1, name: 2, semester: 3 });
  const rows = mappedRows(grid, hi, map);
  assert.equal(rows.length, 2); // the blank row is dropped
  assert.equal(rows[0].row, 4); // spreadsheet row number for error messages
  assert.deepEqual(rows[0].v, { rollNumber: "2026-CS-001", name: "Ali Khan", semester: "1" });
});

test("data import: transcript columns from a typical result sheet", () => {
  const k = kindOf("transcripts")!;
  const m = autoMap(["Roll No", "Course Code", "Course Title", "Cr Hrs", "Grade", "Session", "Year", "Marks"], k);
  assert.deepEqual(m, { rollNumber: 0, courseCode: 1, courseTitle: 2, creditHours: 3, grade: 4, termName: 5, termYear: 6, totalPct: 7 });
});

test("data import: every kind has required fields with aliases and an example", () => {
  for (const k of KINDS) {
    assert.ok(k.fields.some((f) => f.required), k.key);
    for (const f of k.fields) { assert.ok(f.aliases.length > 0, `${k.key}.${f.key}`); assert.notEqual(f.example, undefined); }
  }
});

test("standing list: ties share a position, no CGPA goes last without a position", () => {
  const r = rankByCgpa([{ n: "a", cgpa: 3.1 }, { n: "b", cgpa: 3.8 }, { n: "c", cgpa: null }, { n: "d", cgpa: 3.8 }, { n: "e", cgpa: 2.0 }]);
  assert.deepEqual(r.map((x) => [x.n, x.position]), [["b", 1], ["d", 1], ["a", 3], ["e", 4], ["c", null]]);
});

test("backups: reads gzipped and plain files, rejects others", () => {
  const b = { version: 1, chairmanId: "c1", institute: "X", createdAt: "2026-10-24T00:00:00.000Z", tables: { student: [{ id: "s1" }] } };
  assert.equal(readBackup(gzipSync(Buffer.from(JSON.stringify(b)))).tables.student.length, 1);
  assert.equal(readBackup(Buffer.from(JSON.stringify(b))).chairmanId, "c1");
  assert.throws(() => readBackup(Buffer.from(JSON.stringify({ hello: 1 }))));
  // parents restore before children
  const order = TABLES.map((t) => t.model);
  assert.ok(order.indexOf("batch") < order.indexOf("student") && order.indexOf("course") < order.indexOf("studentMark") && order.indexOf("user") < order.indexOf("batch"));
  // no secrets in backups
  assert.deepEqual(TABLES.find((t) => t.model === "user")!.omit, ["passwordHash", "mfaSecret"]);
});

test("rate limit: first address of x-forwarded-for", () => {
  assert.equal(ipOf(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" })), "203.0.113.5");
  assert.equal(ipOf(new Headers({})), "");
});

test("GA coverage: labs and the tool-usage GA", () => {
  assert.ok(isLab({ courseType: "Core", title: "Programming Fundamentals Lab", code: "CS101L" }));
  assert.ok(!isLab({ courseType: "Core", title: "Calculus", code: "MT101" }));
  assert.equal(courseKind({ courseType: "Capstone", title: "FYP-I", code: "CS491" }), "Project");
  assert.equal(toolGa([{ id: "1", number: 4, title: "Investigation" }, { id: "2", number: 5, title: "Modern Tool Usage" }])!.id, "2");
  assert.equal(toolGa([{ id: "9", number: 5, title: "Something" }])!.id, "9");
});

test("data import: NCEAC Teacher Data headings are matched, both email columns", () => {
  const k = kindOf("faculty-details")!;
  const head = ["Email Address", "Name", "Gender", "CNIC", "Date of Birth", "Phone Number", "Email", "Address", "Province", "City", "Contract Type", "Academic Rank", "Joining Date", "Leaving Date", "Degree Name", "Degree Type", "Field of Study", "Degree Awarded Country", "Degree Awarded Institute", "Degree Start Date", "Degree End Date", "Department"];
  const m = autoMap(head, k);
  assert.equal(m.email, 0); assert.equal(m.personalEmail, 6); assert.equal(m.department, 21);
  assert.equal(m.rank, 11); assert.equal(m.university, 18); assert.equal(m.degreeEnd, 20); assert.equal(m.country, 17);
});

test("curriculum codes: official and institute curricula", async () => {
  const { propose, ownerCode } = await import("../lib/curriculumLibrary");
  assert.equal(propose({ id: "1", authority: "NCEAC", title: "BS Computer Science", version: "2023", chairmanId: null }).code, "NCEAC-BS-CS-2023");
  assert.equal(propose({ id: "2", authority: "HEC", title: "BS Artificial Intelligence", version: "2025 rev", chairmanId: null }).code, "HEC-BS-AI-2025");
  assert.equal(propose({ id: "3", authority: "NBEAC", title: "BBA (Hons)", version: "2024", chairmanId: null }).code, "NBEAC-BBA-2024");
  assert.equal(propose({ id: "4", authority: "HEC", title: "BS Software Engineering", version: "2027", chairmanId: "x" }, "University of the Punjab").code, "UP-BS-SE-2027");
  assert.equal(ownerCode("Punjab University"), "PU");
  assert.equal(propose({ id: "5", authority: "PEC", title: "BSc Electrical Engineering", version: "2022", chairmanId: null }).level, "BE");
});

test("credit hours count elective slots, not the elective list", async () => {
  const { countedCredits, typeKey } = await import("../lib/courseTypes");
  const cs = [{ creditHours: 3, category: "Core" }, { creditHours: 3, category: "Elective" }, { creditHours: 3, category: "Elective" }, { creditHours: 3, category: "Domain Elective" }, { creditHours: 3, category: "Domain Elective" }, { creditHours: 3, category: "Domain Elective" }, { creditHours: 2, category: "Major" }, { creditHours: 0, category: "Certification" }];
  assert.equal(countedCredits(cs), 11);
  assert.equal(typeKey("Major"), "Core"); assert.equal(typeKey("general education / other"), "General Education");
});

test("builder: NCEAC 2023 CS template matches the official document and places courses", async () => {
  const { TEMPLATES, autoPlace, parseReq, reqPresent } = await import("../lib/curriculumTemplates");
  const t = TEMPLATES.find((x) => x.key === "NCEAC-BS-CS-2023")!;
  const counted = t.types.filter((x) => x.kind !== "ELECTIVE_LIST");
  assert.equal(counted.reduce((s, x) => s + (x.minCredits || 0), 0), 130);
  assert.equal(counted.reduce((s, x) => s + (x.minCourses || 0), 0), 44);
  for (const x of counted) if ((x.required || []).length) assert.equal(x.required!.reduce((s, r) => s + (parseReq(r).ch || 0), 0), x.minCredits, x.name);
  assert.deepEqual(parseReq("Programming Fundamentals 4 (3+1)"), { title: "Programming Fundamentals", ch: 4, theory: 3, lab: 1 });
  assert.ok(reqPresent("Quantitative Reasoning I (Discrete Structures) 3", ["Discrete Structures"]));
  const types = t.types.map((x) => ({ name: x.name, kind: x.kind, required: x.required || [] }));
  assert.equal(autoPlace({ title: "Data Structures", category: "Major" }, types), "Computing Core");
  assert.equal(autoPlace({ title: "Theory of Automata", category: "Major" }, types), "Domain Core");
  assert.equal(autoPlace({ title: "Linear Algebra", category: "Major" }, types), "Mathematics & Supporting Courses");
  assert.equal(autoPlace({ title: "Calculus and Analytic Geometry", category: "Major" }, types), "General Education");
  assert.equal(autoPlace({ title: "Cloud Computing", category: "Domain Elective" }, types), "Domain Elective list");
});

test("course codes: prefix, year digit and sequence", async () => {
  const { sample } = await import("../lib/courseCodes");
  assert.equal(sample({ prefix: "CS", digits: 4, separator: "-" }, 1, 1), "CS-1001");
  assert.equal(sample({ prefix: "MT", digits: 3, separator: "" }, 2, 3), "MT203");
});

test("HEC BS CS 2025: 130 CH and 14 tracks with shared electives", async () => {
  const { TEMPLATES, HEC_CS_2025_TRACKS, parseReq, normTitle, kindInfo } = await import("../lib/curriculumTemplates");
  const t = TEMPLATES.find((x) => x.key === "HEC-BS-CS-2025")!;
  const ch = t.types.filter((x) => kindInfo(x.kind).counts).reduce((a, x) => a + (x.minCredits || 0), 0);
  assert.equal(ch, 130);
  assert.equal(Object.keys(HEC_CS_2025_TRACKS).length, 14);
  const all = Object.values(HEC_CS_2025_TRACKS).flat().map((x) => normTitle(parseReq(x).title));
  assert.ok(new Set(all).size < all.length); // e.g. Machine Learning sits in several tracks
  assert.equal(parseReq("Embedded Programming 4 (3+1)").lab, 1);
});

test("HEC CS 2025 master content: semesters, CLOs, lecture plans resolve for every required course", async () => {
  const { TEMPLATES, HEC_CS_2025_TRACKS, parseReq } = await import("../lib/curriculumTemplates");
  const { CONTENT_PACKS, mapLectures, suggestPlo } = await import("../lib/curriculumContent");
  const pack = CONTENT_PACKS["HEC-BS-CS-2025"];
  const t = TEMPLATES.find((x) => x.key === "HEC-BS-CS-2025")!;
  const miss: string[] = [];
  for (const ty of t.types) for (const r of ty.required || []) {
    const title = parseReq(r).title;
    if (ty.kind === "IDS_LIST") continue;
    if (!pack.semester(title, ty.kind, 0)) miss.push("sem " + title);
    if (["Professional Certification", "Field Experience", "Final Year Project"].includes(title)) continue;
    const c = pack.content(title);
    if (!c || !c.clos.length) miss.push("clo " + title); else if (c.topics.length < 32) miss.push("lec " + title);
  }
  assert.deepEqual(miss, []);
  const el = Object.values(HEC_CS_2025_TRACKS).flat().map((x) => parseReq(x).title);
  assert.equal(el.filter((x) => !pack.content(x)?.clos.length).length, 0);
  assert.equal(pack.semester("Specialization Electives V", "ELECTIVE_SLOT", 4), 7);
  const m = mapLectures(["Linked lists", "Stacks and queues", "Graph traversal"], ["Implement linked lists and stacks", "Traverse graphs"]);
  assert.deepEqual(m, [1, 1, 2]);
  assert.equal(suggestPlo("Discuss ethical issues of AI", "C2"), 9);
  assert.equal(suggestPlo("Design a distributed system", "C6"), 4);
});
