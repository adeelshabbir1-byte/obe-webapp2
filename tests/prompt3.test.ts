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
