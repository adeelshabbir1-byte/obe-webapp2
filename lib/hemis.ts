import ExcelJS from "exceljs";
import { randomUUID } from "crypto";
import { prisma } from "./db";
import { sectionRows } from "./aas";
import { canonValues } from "./aasFields";
import { canon, type Lists } from "./nceacLists";
import { cellOf, portalLists, type Col, type Cell, type Issue } from "./nceacPortal";
import { bestAttemptTotals } from "./cgpaMath";

// HEC HEMIS (Higher Education Management Information System) data: students, faculty, programs, enrolment, results
// and graduates, one sheet each, checked before export (CNIC, dates, codes) and logged. The columns follow HEMIS's data
// sets; an institute whose HEMIS template names a column differently can still upload these values, and the page says
// which template the columns were matched to. Values come from OBEHUB and from people's NCEAC details (CNIC, date of
// birth, domicile …), so filling one fills both.

export const hdb = prisma as unknown as Record<string, any>;
export const HEMIS_HINT = "HEMIS codes and the export log need prisma/migration_hemis.sql — run it in Supabase (downloads work without it).";
export const HEMIS_ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"];
export type Dataset = "students" | "faculty" | "programs" | "enrolment" | "results" | "graduates";
const c = (header: string, key: string, required: boolean, width: number, o: Partial<Col> = {}): Col => ({ header, key, required, type: "text", width, ...o });

export const DATASETS: { key: Dataset; title: string; note: string; cols: Col[] }[] = [
  { key: "students", title: "Students", note: "Every current student (not left, dropped, graduated, transferred out or rusticated).", cols: [
    c("Institute Code", "inst", true, 14), c("Program Code", "pcode", true, 14), c("Program Name", "program", true, 28), c("Session", "session", true, 14), c("Roll No", "roll", true, 16),
    c("Student Name", "name", true, 24), c("Father Name", "father", true, 22), c("Gender", "gender", true, 9, { list: "studentGender" }), c("CNIC / B-Form", "cnic", true, 17, { check: "cnic" }),
    c("Date of Birth", "dob", true, 13, { type: "date" }), c("Nationality", "nationality", true, 12), c("Domicile District", "domDistrict", true, 16), c("Domicile Province", "domProvince", true, 18, { list: "province" }),
    c("Admission Date", "admission", true, 14, { type: "date" }), c("Current Semester", "semester", true, 10, { type: "number" }), c("Status", "status", true, 12), c("Email", "email", false, 24, { check: "email" }), c("Mobile", "phone", false, 14, { check: "phone" }),
  ] },
  { key: "faculty", title: "Faculty", note: "Every teacher of the institute with an OBEHUB account.", cols: [
    c("Institute Code", "inst", true, 14), c("Name", "name", true, 24), c("Gender", "gender", true, 9, { list: "facultyGender" }), c("CNIC", "cnic", true, 17, { check: "cnic" }), c("Date of Birth", "dob", true, 13, { type: "date" }),
    c("Designation", "rank", true, 18, { list: "academicRank" }), c("Employment Type", "contract", true, 14, { list: "contractType" }), c("Highest Degree", "degree", true, 24), c("Degree Level", "degreeType", true, 12, { list: "degreeType" }),
    c("Field of Study", "field", true, 20), c("Degree Country", "country", true, 14), c("Degree Institute", "university", true, 28), c("Joining Date", "joining", true, 13, { type: "date" }), c("Department", "department", true, 24),
    c("Email", "email", true, 26, { check: "email" }), c("Mobile", "mobile", false, 14, { check: "phone" }),
  ] },
  { key: "programs", title: "Programs", note: "Every program of the institute with its HEMIS code.", cols: [
    c("Institute Code", "inst", true, 14), c("Program Code", "pcode", true, 14), c("Program Name", "program", true, 30), c("Level", "level", true, 14), c("Duration (years)", "years", true, 10, { type: "number" }),
    c("Total Credit Hours", "credits", true, 10, { type: "number" }), c("Department", "department", true, 26), c("Discipline", "discipline", true, 20), c("Start Year", "start", true, 9, { type: "number" }), c("Accreditation Council", "council", false, 12),
  ] },
  { key: "enrolment", title: "Enrolment", note: "Current students per program and session, by gender.", cols: [
    c("Institute Code", "inst", true, 14), c("Program Code", "pcode", true, 14), c("Program Name", "program", true, 28), c("Session", "session", true, 14), c("Current Semester", "semester", false, 10, { type: "number" }),
    c("Male", "male", true, 8, { type: "number" }), c("Female", "female", true, 8, { type: "number" }), c("Total", "total", true, 8, { type: "number" }),
  ] },
  { key: "results", title: "Results", note: "Each student's GPA per term and CGPA up to that term, from the transcript records.", cols: [
    c("Institute Code", "inst", true, 14), c("Program Code", "pcode", true, 14), c("Roll No", "roll", true, 16), c("Student Name", "name", true, 24), c("Term", "term", true, 12),
    c("Credit Hours", "credits", true, 9, { type: "number" }), c("GPA", "gpa", true, 7, { type: "number" }), c("CGPA", "cgpa", true, 7, { type: "number" }), c("Result", "result", true, 12),
  ] },
  { key: "graduates", title: "Graduates", note: "Students who have graduated, with their final CGPA.", cols: [
    c("Institute Code", "inst", true, 14), c("Program Code", "pcode", true, 14), c("Program Name", "program", true, 28), c("Roll No", "roll", true, 16), c("Student Name", "name", true, 24), c("Father Name", "father", true, 22),
    c("Gender", "gender", true, 9, { list: "studentGender" }), c("CNIC", "cnic", true, 17, { check: "cnic" }), c("CGPA", "cgpa", true, 7, { type: "number" }), c("Credit Hours Earned", "credits", true, 10, { type: "number" }),
    c("Graduation Date", "graduated", true, 14, { type: "date" }), c("Degree Title", "program", true, 28),
  ] },
];
export const datasetOf = (k: string) => DATASETS.find((d) => d.key === k) || null;

export type HRow = { ref: string; kind: "student" | "staff" | "program" | "none"; id: string; name: string; program: string; cells: Cell[]; issues: Issue[] };
// HEMIS spells designations and degree levels in words.
const words = (x: Cell) => (typeof x === "string" ? x.replace(/([a-z])([A-Z])/g, "$1 $2").replace("Ph D", "PhD").replace("Lab Instructor", "Lab Engineer / Instructor") : x);

function row(cols: Col[], v: Record<string, string>, lists: Lists, base: Omit<HRow, "cells" | "issues">): HRow {
  const issues: Issue[] = [];
  const cells = cols.map((col) => {
    const r = cellOf(col, v[col.key], lists);
    if (r.problem) issues.push({ col: col.header, problem: r.problem === "missing" ? (col.key === "pcode" ? "missing — set the program's HEMIS code" : col.key === "inst" ? "missing — set the institute's HEMIS code" : "missing") : r.problem, severity: "reject" });
    return col.key === "rank" || col.key === "contract" ? words(r.value) : r.value;
  });
  return { ...base, cells, issues };
}

/* ---------------- Codes ---------------- */

export type Codes = { inst: string; programs: Map<string, { code: string; level: string; discipline: string; years: number }> };
export async function hemisCodes(chairmanId: string): Promise<Codes & { ready: boolean }> {
  try {
    const rows = (await hdb.hemisCode.findMany({ where: { chairmanId } })) as { program: string; code: string; level: string | null; discipline: string | null; years: number | null }[];
    const inst = rows.find((r) => r.program === "")?.code || "";
    return { ready: true, inst, programs: new Map(rows.filter((r) => r.program).map((r) => [r.program, { code: r.code, level: r.level || "BS (4 years)", discipline: r.discipline || "", years: r.years || 4 }])) };
  } catch { return { ready: false, inst: "", programs: new Map() }; }
}
export async function saveHemisCode(chairmanId: string, program: string, v: { code: string; level?: string; discipline?: string; years?: number }, by: string) {
  const data = { code: v.code.trim().slice(0, 40), level: (v.level || "").slice(0, 40) || null, discipline: (v.discipline || "").slice(0, 80) || null, years: v.years && v.years > 0 && v.years < 10 ? Math.round(v.years) : null, updatedById: by, updatedAt: new Date() };
  if (!data.code) { await hdb.hemisCode.deleteMany({ where: { chairmanId, program } }); return; }
  await hdb.hemisCode.upsert({ where: { chairmanId_program: { chairmanId, program } }, create: { id: randomUUID(), chairmanId, program, ...data }, update: data });
}

/* ---------------- Building the data sets ---------------- */

const AWAY = ["LEFT", "DROPPED", "GRADUATED", "WITHDRAWN", "TRANSFERRED", "RUSTICATED", "DISMISSED"];
const STATUS_WORD: Record<string, string> = { ACTIVE: "Active", FROZEN: "Frozen", PROBATION: "Probation", GRADUATED: "Graduated" };
const termStart = (term: string, year: number) => new Date(Date.UTC(year, /spring/i.test(term) ? 1 : /summer/i.test(term) ? 5 : 8, 1));
const dmyS = (d: Date | null) => (d ? `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}` : "");
const TERM_ORDER = (t: string, y: number) => y * 10 + (/spring/i.test(t) ? 1 : /summer/i.test(t) ? 2 : 3);

export async function hemisData(chairmanId: string, only?: Dataset[]) {
  const want = (k: Dataset) => !only || only.includes(k);
  const lists = await portalLists(chairmanId);
  const codes = await hemisCodes(chairmanId);
  const progs = (await prisma.departmentProgram.findMany({ where: { chairmanId }, select: { degreeProgram: true, accreditationBody: true, department: { select: { name: true } } } as never }).catch(() => [])) as unknown as { degreeProgram: string; accreditationBody: string | null; department?: { name: string } | null }[];
  const batches = await prisma.batch.findMany({ where: { coordinator: { managedById: chairmanId } }, select: { id: true, degreeProgram: true, batchName: true, startTerm: true, startYear: true }, orderBy: { startYear: "asc" } });
  const programNames = Array.from(new Set([...progs.map((p) => p.degreeProgram), ...batches.map((b) => b.degreeProgram)])).sort();
  const base = (program: string) => ({ inst: codes.inst, pcode: codes.programs.get(program)?.code || "", program });
  const out: Record<Dataset, HRow[]> = { students: [], faculty: [], programs: [], enrolment: [], results: [], graduates: [] };
  const ctxOf = (program: string, batchId: string | null) => ({ chairmanId, program, batchId, focalId: chairmanId });

  const students = await prisma.student.findMany({ where: { batchId: { in: batches.map((b) => b.id).concat(["none"]) } }, select: { id: true, rollNumber: true, name: true, status: true, statusDate: true, batchId: true, currentSemesterNumber: true } });
  const records = want("results") || want("graduates") ? await prisma.studentTranscriptRecord.findMany({ where: { studentId: { in: students.map((s) => s.id).concat(["none"]) } }, select: { studentId: true, courseCode: true, creditHours: true, gpaPoints: true, termName: true, termYear: true } }) : [];

  for (const b of batches) {
    const mine = students.filter((s) => s.batchId === b.id);
    const details = want("students") || want("graduates") || want("enrolment") ? await sectionRows("students", ctxOf(b.degreeProgram, b.id)) : [];
    const det = new Map(details.map((r) => [r.ref, canonValues("student", r.values, lists)]));
    const session = `${b.startTerm} ${b.startYear}`;
    if (want("students")) for (const s of mine.filter((x) => !AWAY.includes(x.status))) {
      const v = { ...base(b.degreeProgram), ...det.get(s.rollNumber), session, roll: s.rollNumber, name: s.name, admission: dmyS(termStart(b.startTerm, b.startYear)), semester: String(s.currentSemesterNumber || ""), status: STATUS_WORD[s.status] || s.status };
      out.students.push(row(DATASETS[0].cols, v, lists, { ref: s.rollNumber, kind: "student", id: s.id, name: s.name, program: b.degreeProgram }));
    }
    if (want("enrolment")) {
      const cur = mine.filter((x) => !AWAY.includes(x.status));
      if (cur.length) {
        const g = (x: string) => cur.filter((s) => (canon("studentGender", det.get(s.rollNumber)?.gender, lists) || "") === x).length;
        const v = { ...base(b.degreeProgram), session, semester: String(Math.max(...cur.map((s) => s.currentSemesterNumber || 0)) || ""), male: String(g("M")), female: String(g("F")), total: String(cur.length) };
        const r = row(DATASETS[3].cols, v, lists, { ref: b.batchName, kind: "none", id: b.id, name: `${b.degreeProgram} ${b.batchName}`, program: b.degreeProgram });
        const unknown = cur.length - g("M") - g("F");
        if (unknown) r.issues.push({ col: "Male / Female", problem: `${unknown} student(s) have no gender recorded`, severity: "check" });
        out.enrolment.push(r);
      }
    }
    if (want("results")) for (const s of mine) {
      const rs = records.filter((r) => r.studentId === s.id);
      const terms = Array.from(new Set(rs.map((r) => `${r.termName}|${r.termYear}`))).map((k) => { const [t, y] = k.split("|"); return { t, y: Number(y) }; }).sort((a, b2) => TERM_ORDER(a.t, a.y) - TERM_ORDER(b2.t, b2.y));
      for (const term of terms) {
        const inTerm = rs.filter((r) => r.termName === term.t && r.termYear === term.y);
        // Transfer credits (no grade points) are not a term's result.
        if (inTerm.every((r) => r.gpaPoints === null)) continue;
        const t1 = bestAttemptTotals(inTerm), upTo = bestAttemptTotals(rs.filter((r) => TERM_ORDER(r.termName, r.termYear) <= TERM_ORDER(term.t, term.y)));
        const gpa = t1.credits ? t1.points / t1.credits : null, cgpa = upTo.credits ? upTo.points / upTo.credits : null;
        const v = { ...base(b.degreeProgram), roll: s.rollNumber, name: s.name, term: `${term.t} ${term.y}`, credits: String(inTerm.reduce((t, r) => t + r.creditHours, 0)), gpa: gpa === null ? "" : gpa.toFixed(2), cgpa: cgpa === null ? "" : cgpa.toFixed(2), result: cgpa === null ? "" : cgpa < 2 ? "Probation" : "Pass" };
        out.results.push(row(DATASETS[4].cols, v, lists, { ref: `${s.rollNumber} ${term.t} ${term.y}`, kind: "student", id: s.id, name: s.name, program: b.degreeProgram }));
      }
    }
    if (want("graduates")) for (const s of mine.filter((x) => x.status === "GRADUATED")) {
      const t = bestAttemptTotals(records.filter((r) => r.studentId === s.id));
      const v = { ...base(b.degreeProgram), ...det.get(s.rollNumber), roll: s.rollNumber, name: s.name, cgpa: t.credits ? (t.points / t.credits).toFixed(2) : "", credits: String(t.credits || ""), graduated: dmyS(s.statusDate) };
      out.graduates.push(row(DATASETS[5].cols, v, lists, { ref: s.rollNumber, kind: "student", id: s.id, name: s.name, program: b.degreeProgram }));
    }
  }

  if (want("programs")) for (const p of programNames) {
    const dp = progs.find((x) => x.degreeProgram === p);
    const bs = batches.filter((b) => b.degreeProgram === p);
    const latest = bs[bs.length - 1];
    const credits = latest ? (await prisma.course.aggregate({ where: { batchId: latest.id, isNonCredit: false, trackName: null }, _sum: { creditHours: true } }))._sum.creditHours || 0 : 0;
    const pc = codes.programs.get(p);
    const v = { ...base(p), level: pc?.level || (/^b/i.test(p) ? "BS (4 years)" : ""), years: String(pc?.years || 4), credits: credits ? String(credits) : "", department: dp?.department?.name || "", discipline: pc?.discipline || "", start: bs[0] ? String(bs[0].startYear) : "", council: dp?.accreditationBody || "" };
    out.programs.push(row(DATASETS[2].cols, v, lists, { ref: p, kind: "program", id: p, name: p, program: p }));
  }

  if (want("faculty")) {
    const staff = await sectionRows("faculty", ctxOf("", null));
    const users = await prisma.user.findMany({ where: { id: { in: staff.map((s) => s.ref).concat(["none"]) } }, select: { id: true, email: true, department: true, department_: { select: { name: true } }, faculty_: { select: { name: true } } } as never }) as unknown as { id: string; email: string; department: string | null; department_?: { name: string } | null; faculty_?: { name: string } | null }[];
    for (const s of staff) {
      const u = users.find((x) => x.id === s.ref);
      const v: Record<string, string> = { ...canonValues("staff", s.values, lists), inst: codes.inst, email: u?.email || s.values.email || "", department: u?.department_?.name || u?.department || u?.faculty_?.name || "" }; // a Dean: their faculty
      if (!/^pakistan/i.test(v.country || "Pakistan") && v.foreignUniversity) v.university = v.foreignUniversity;
      out.faculty.push(row(DATASETS[1].cols, v, lists, { ref: s.ref, kind: "staff", id: s.ref, name: s.values.name || s.ref, program: "" }));
    }
    out.faculty.sort((a, b) => a.name.localeCompare(b.name));
  }
  return { out, codes, programNames };
}

export const hemisSummary = (rows: HRow[]) => ({ rows: rows.length, rejected: rows.filter((r) => r.issues.some((i) => i.severity === "reject")).length, checks: rows.reduce((t, r) => t + r.issues.filter((i) => i.severity === "check").length, 0) });

/** One workbook: a sheet per data set (header row + rows, dates as dates). */
export async function hemisWorkbook(data: Partial<Record<Dataset, HRow[]>>) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OBEHUB";
  for (const d of DATASETS) {
    const rows = data[d.key];
    if (!rows) continue;
    const ws = wb.addWorksheet(d.title);
    ws.columns = d.cols.map((col) => ({ width: col.width }));
    const h = ws.addRow(d.cols.map((col) => col.header)); h.font = { bold: true };
    for (const r of rows) { const x = ws.addRow(r.cells); d.cols.forEach((col, i) => { if (col.type === "date" && r.cells[i] instanceof Date) x.getCell(i + 1).numFmt = "dd/mm/yyyy"; }); }
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  return wb.xlsx.writeBuffer();
}
/** One data set as CSV (dates dd/mm/yyyy). */
export function hemisCsv(d: (typeof DATASETS)[number], rows: HRow[]) {
  const esc = (x: Cell) => { const s = x instanceof Date ? dmyS(x) : x === null ? "" : String(x); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [d.cols.map((c2) => esc(c2.header)).join(","), ...rows.map((r) => r.cells.map(esc).join(","))].join("\r\n");
}

export async function logHemis(e: { chairmanId: string; dataset: string; rows: number; rejected: number; byId: string }) {
  try { await hdb.hemisExportLog.create({ data: { id: randomUUID(), ...e } }); return true; } catch { return false; }
}
export async function hemisLog(chairmanId: string) {
  try {
    const rows = (await hdb.hemisExportLog.findMany({ where: { chairmanId }, orderBy: { createdAt: "desc" }, take: 40 })) as { id: string; dataset: string; rows: number; rejected: number; byId: string; createdAt: Date }[];
    const us = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.byId).concat(["none"]) } }, select: { id: true, name: true } });
    return { ok: true as const, rows: rows.map((r) => ({ ...r, by: us.find((u) => u.id === r.byId)?.name || "—" })) };
  } catch { return { ok: false as const, rows: [] }; }
}
