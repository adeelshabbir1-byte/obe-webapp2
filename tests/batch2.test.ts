import { test } from "node:test";
import assert from "node:assert/strict";
import { clean, PdfDoc } from "../lib/pdfDoc";
import { PARTS } from "../lib/courseFile";
import { DATASETS, hemisCsv } from "../lib/hemis";

test("PDF text: symbols the standard fonts cannot draw become plain text", () => {
  assert.equal(clean("CLO-1 — attained ✓ (≥ 50%) → next…"), "CLO-1 - attained Yes (>= 50%) -> next...");
  assert.equal(clean("Café"), "Café");
  assert.equal(clean("اردو"), "");
});

test("a PDF with long tables breaks across pages and numbers them", async () => {
  const d = await PdfDoc.create("Course file - TEST");
  d.title("Course File: TEST", "Institute");
  d.table([["A", 1], ["B", 4]], Array.from({ length: 120 }, (_, i) => [String(i), "a fairly long cell that has to wrap onto a second line in the narrow column ".repeat(2)]));
  const bytes = await d.save();
  assert.ok(d.doc.getPageCount() > 2);
  assert.ok(bytes.length > 2000);
});

test("course file has the ten parts", () => {
  assert.equal(PARTS.length, 10);
  assert.equal(new Set(PARTS.map((p) => p[0])).size, 10);
});

test("HEMIS: six data sets; CSV quotes commas and writes dates as dd/mm/yyyy", () => {
  assert.deepEqual(DATASETS.map((d) => d.key), ["students", "faculty", "programs", "enrolment", "results", "graduates"]);
  const d = DATASETS.find((x) => x.key === "programs")!;
  const csv = hemisCsv(d, [{ ref: "p", kind: "program", id: "p", name: "p", program: "p", cells: ["HEI-1", "0423-101", "BS Computer Science, Evening", "BS (4 years)", 4, 133, "Computing", "Computer Science", 2020, "NCEAC"], issues: [] }]);
  const lines = csv.replace("﻿", "").split("\r\n");
  assert.equal(lines[0], d.cols.map((c) => c.header).join(","));
  assert.ok(lines[1].includes('"BS Computer Science, Evening"'));
  const s = DATASETS.find((x) => x.key === "students")!;
  const c2 = hemisCsv(s, [{ ref: "r", kind: "student", id: "s", name: "n", program: "p", cells: s.cols.map((c) => (c.type === "date" ? new Date(Date.UTC(2024, 8, 1)) : "x")), issues: [] }]);
  assert.ok(c2.includes("01/09/2024"));
});
