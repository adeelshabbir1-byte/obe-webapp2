import ExcelJS from "exceljs";
import { randomUUID } from "crypto";
import { prisma } from "./db";
import { adb, sectionRows, staffDetails, saveDetail } from "./aas";
import { canonValues } from "./aasFields";
import { canon, listsWith, parseDate, cnicOf, phoneOf, emailOk, PORTAL_LISTS, type Lists } from "./nceacLists";

// NCEAC portal (AAS) upload files, cell for cell like the portal's own templates ("Template Current Students" and
// "Teacher Data"): same sheet name, headers, column order and widths, dates as real dates, list values spelt as the
// portal spells them, no extra columns. Every row is checked first; the page lists what the portal would reject.

export const PORTAL_HINT = "The NCEAC export log needs prisma/migration_nceac_portal.sql — run it in Supabase (the downloads work without it).";

export type ColType = "text" | "date" | "number" | "id";
export type Col = { header: string; key: string; required: boolean; type: ColType; list?: string; check?: "cnic" | "phone" | "email"; width: number };
export type Template = { key: "students" | "faculty"; title: string; file: string; sheet: string; dateFormat: string; cols: Col[]; note: string };

const c = (header: string, key: string, required: boolean, width: number, o: Partial<Col> = {}): Col => ({ header, key, required, type: "text", width, ...o });

export const STUDENT_TEMPLATE: Template = {
  key: "students", title: "Students file (Template Current Students)", file: "Template Current Students", sheet: "Sheet1", dateFormat: "[$-409]d\\-mmm\\-yyyy;@",
  note: "Header row and one row per current student. The template's example row, its “Compulsory” row and the code legend are guidance and are left out.",
  cols: [
    c("Student Name", "name", true, 13.55), c("FatherName", "father", true, 11.66), c("Gender", "gender", true, 11.33, { list: "studentGender" }),
    c("RollNo", "roll", true, 11.33, { type: "id" }), c("Admission Date", "admission", true, 14.66, { type: "date" }), c("Nationality", "nationality", true, 11.33),
    c("CNIC Number", "cnic", true, 15.66, { check: "cnic" }), c("Passport Number", "passport", false, 16.11), c("Date of Birth", "dob", true, 12, { type: "date" }),
    c("PhoneNumber", "phone", false, 13.55, { check: "phone" }), c("Email", "email", false, 18.33, { check: "email" }), c("Domicile District", "domDistrict", false, 15.33),
    c("Domicile Province", "domProvince", false, 16.44, { list: "province" }), c("Mailing Address", "address", true, 15), c("City (Mailing Address)", "city", true, 20.11),
    c("SSC Degree Name", "sscDegree", false, 16.33), c("SSC Board Name", "sscBoard", false, 15.33), c("SSC Total Marks", "sscTotal", false, 14.89, { type: "number" }),
    c("SSC Obtained Marks", "sscObtained", false, 18.55, { type: "number" }), c("HSSC Degree Name", "hsscDegree", true, 17.44),
    c("HSSC Degree Nomenclature", "hsscCode", true, 30.44, { type: "number", list: "hsscNomenclature" }), c("HSSC Board Name", "hsscBoard", false, 16.66),
    c("HSSC Total Marks", "hsscTotal", true, 16.11, { type: "number" }), c("HSSC Obtained Marks", "hsscObtained", true, 19.89, { type: "number" }),
  ],
};

export const FACULTY_TEMPLATE: Template = {
  key: "faculty", title: "Faculty file (Teacher Data)", file: "Teacher Data", sheet: "Sheet1", dateFormat: "[$-409]d\\-mmm\\-yyyy;@",
  note: "Header row and one row per teacher of the program, with the highest degree.",
  cols: [
    c("Email Address", "accountEmail", true, 26, { check: "email" }), c("Name", "name", true, 24), c("Gender", "gender", true, 10, { list: "facultyGender" }),
    c("CNIC", "cnic", true, 17), c("Date of Birth", "dob", true, 13, { type: "date" }), c("Phone Number", "mobile", true, 15, { check: "phone" }),
    c("Email", "email", true, 26, { check: "email" }), c("Address", "address", true, 30), c("Province", "province", true, 18, { list: "province" }), c("City", "city", true, 14),
    c("Contract Type", "contract", true, 14, { list: "contractType" }), c("Academic Rank", "rank", true, 19, { list: "academicRank" }), c("Joining Date", "joining", true, 13, { type: "date" }),
    c("Leaving Date", "leaving", false, 13, { type: "date" }), c("Degree Name", "degree", true, 26), c("Degree Type", "degreeType", true, 12, { list: "degreeType" }),
    c("Field of Study", "field", true, 22), c("Degree Awarded Country", "country", true, 18), c("Degree Awarded Institute", "university", true, 30),
    c("Degree Start Date", "degreeStart", true, 15, { type: "date" }), c("Degree End Date", "degreeEnd", true, 15, { type: "date" }),
  ],
};
export const TEMPLATES = { students: STUDENT_TEMPLATE, faculty: FACULTY_TEMPLATE };

export type Issue = { col: string; problem: string; severity: "reject" | "check" };
export type Cell = string | number | Date | null;
export type ExportRow = { ref: string; id: string; name: string; cells: Cell[]; issues: Issue[] };

/* ---------------- Lists the institute corrected ---------------- */

export async function portalLists(chairmanId: string | null | undefined): Promise<Lists> {
  if (!chairmanId) return listsWith();
  try {
    const rows = (await adb.aasRecord.findMany({ where: { chairmanId, scope: "portalList" } })) as { key: string; dataJson: string }[];
    const o: Record<string, string[]> = {};
    for (const r of rows) { try { const v = JSON.parse(r.dataJson).values; if (Array.isArray(v)) o[r.key] = v.map(String); } catch { /* skip */ } }
    return listsWith(o);
  } catch { return listsWith(); }
}
export async function savePortalList(chairmanId: string, key: string, values: string[] | null, by: string) {
  if (!PORTAL_LISTS.some((l) => l.key === key)) throw new Error("Unknown list");
  const where = { chairmanId_scope_key: { chairmanId, scope: "portalList", key } };
  if (!values) { await adb.aasRecord.deleteMany({ where: { chairmanId, scope: "portalList", key } }); return; }
  const clean = Array.from(new Set(values.map((v) => String(v).trim().slice(0, 80)).filter(Boolean))).slice(0, 200);
  const data = JSON.stringify({ values: clean });
  await adb.aasRecord.upsert({ where, create: { id: randomUUID(), chairmanId, scope: "portalList", key, dataJson: data, updatedById: by }, update: { dataJson: data, updatedById: by, updatedAt: new Date() } });
}

/* ---------------- One cell, the way the portal wants it ---------------- */

export function cellOf(col: Col, raw: string | null | undefined, lists: Lists): { value: Cell; problem?: string } {
  const v = (raw ?? "").toString().trim();
  if (!v) return { value: null, problem: col.required ? "missing" : undefined };
  if (col.list) {
    const x = canon(col.list, v, lists);
    if (!x) return { value: v, problem: `“${v}” is not one of the portal's choices (${(lists[col.list] || []).join(", ")})` };
    return { value: col.type === "number" ? Number(x) : x };
  }
  if (col.type === "date") { const d = parseDate(v); return d ? { value: d } : { value: v, problem: `“${v}” is not a date (dd/mm/yyyy)` }; }
  if (col.type === "number") { const n = Number(v.replace(/,/g, "")); return isFinite(n) ? { value: n } : { value: v, problem: `“${v}” is not a number` }; }
  if (col.type === "id") return { value: /^\d{1,15}$/.test(v) ? Number(v) : v };
  if (col.check === "cnic") { const x = cnicOf(v); return x ? { value: x } : { value: v, problem: "CNIC must be 13 digits (xxxxx-xxxxxxx-x)" }; }
  if (col.check === "phone") { const x = phoneOf(v); return x ? { value: x } : { value: v, problem: `“${v}” is not a phone number (03xxxxxxxxx)` }; }
  if (col.check === "email") return emailOk(v) ? { value: v } : { value: v, problem: `“${v}” is not an email address` };
  return { value: v.slice(0, 500) };
}

/** A row of values (keys of the template) → the template's cells, with what the portal would reject. */
export function buildRow(t: Template, values: Record<string, string>, lists: Lists, ref: string, id: string): ExportRow {
  const issues: Issue[] = [];
  const cells = t.cols.map((col) => {
    const r = cellOf(col, values[col.key], lists);
    if (r.problem) issues.push({ col: col.header, problem: r.problem, severity: "reject" });
    return r.value;
  });
  const at = (h: string) => cells[t.cols.findIndex((x) => x.header === h)];
  const num = (h: string) => { const x = at(h); return typeof x === "number" ? x : null; };
  const date = (h: string) => { const x = at(h); return x instanceof Date ? x : null; };
  if (t.key === "students") {
    // A foreign student may give a passport instead of a CNIC.
    const cn = issues.findIndex((i) => i.col === "CNIC Number");
    if (cn >= 0 && !/^pakistan/i.test(values.nationality || "Pakistani") && (values.passport || "").trim()) issues.splice(cn, 1);
    for (const [tot, got] of [["SSC Total Marks", "SSC Obtained Marks"], ["HSSC Total Marks", "HSSC Obtained Marks"]]) { const a = num(tot), b = num(got); if (a != null && b != null && b > a) issues.push({ col: got, problem: `obtained (${b}) is more than total (${a})`, severity: "reject" }); }
    const dob = date("Date of Birth"), adm = date("Admission Date");
    if (dob && adm) { const age = (adm.getTime() - dob.getTime()) / (365.25 * 864e5); if (age < 14 || age > 45) issues.push({ col: "Date of Birth", problem: `age at admission would be ${Math.floor(age)}`, severity: "check" }); }
  } else {
    const ds = date("Degree Start Date"), de = date("Degree End Date"), jo = date("Joining Date"), le = date("Leaving Date"), dob = date("Date of Birth");
    if (ds && de && de < ds) issues.push({ col: "Degree End Date", problem: "ends before it starts", severity: "reject" });
    if (jo && le && le < jo) issues.push({ col: "Leaving Date", problem: "before the joining date", severity: "reject" });
    if (dob && jo && (jo.getTime() - dob.getTime()) / (365.25 * 864e5) < 18) issues.push({ col: "Date of Birth", problem: "under 18 at joining", severity: "check" });
    // CNIC: 13 digits for local faculty, a passport number for foreign faculty.
    const raw = (values.cnic || "").trim();
    const i = t.cols.findIndex((x) => x.header === "CNIC");
    if (raw) { const x = cnicOf(raw); if (x) cells[i] = x; else if (/foreign/i.test(values.type || "") && /^[A-Z0-9]{6,12}$/i.test(raw)) cells[i] = raw.toUpperCase(); else issues.push({ col: "CNIC", problem: "CNIC must be 13 digits (foreign faculty: passport number, with Faculty Type Foreign)", severity: "reject" }); }
  }
  return { ref, id, name: values.name || ref, cells, issues };
}

/* ---------------- Who and what goes in each file ---------------- */

type Ctx = { chairmanId: string; program: string; batchId: string | null; focalId: string; batches: { id: string; batchName: string }[] };
const AWAY = ["LEFT", "DROPPED", "GRADUATED", "WITHDRAWN", "TRANSFERRED", "RUSTICATED", "DISMISSED"];

/** Current students of a batch (or of every batch of the program when batchId is "all"). */
export async function studentExport(ctx: Ctx, batchId: string | "all", lists: Lists) {
  const ids = batchId === "all" ? ctx.batches.map((b) => b.id) : [batchId];
  const out: (ExportRow & { batch: string })[] = [];
  for (const bid of ids) {
    const rows = await sectionRows("students", { ...ctx, batchId: bid });
    const st = await prisma.student.findMany({ where: { batchId: bid }, select: { id: true, rollNumber: true, status: true } });
    const by = new Map(st.map((s) => [s.rollNumber, s]));
    const bname = ctx.batches.find((b) => b.id === bid)?.batchName || "";
    for (const r of rows) {
      const s = by.get(r.ref);
      if (!s || AWAY.includes(s.status)) continue;
      const v = canonValues("student", { ...r.values, roll: r.ref }, lists);
      out.push({ ...buildRow(STUDENT_TEMPLATE, v, lists, r.ref, s.id), batch: bname });
    }
  }
  return out;
}

/** The program's teachers: everyone who teaches a course of its batches (whole course or a section), its Program Leads and its HOD. */
export async function programTeacherIds(chairmanId: string, program: string): Promise<Set<string>> {
  const batches = await prisma.batch.findMany({ where: { degreeProgram: program, coordinator: { managedById: chairmanId } }, select: { id: true, coordinatorId: true } });
  const courses = await prisma.course.findMany({ where: { batchId: { in: batches.map((b) => b.id).concat(["none"]) } }, select: { id: true, instructorId: true } });
  const secs = await prisma.courseSectionAssignment.findMany({ where: { courseId: { in: courses.map((x) => x.id).concat(["none"]) } }, select: { instructorId: true } }).catch(() => [] as { instructorId: string }[]);
  const dp = await prisma.departmentProgram.findFirst({ where: { chairmanId, degreeProgram: program }, select: { departmentId: true } }).catch(() => null);
  const hods = dp ? await prisma.user.findMany({ where: { role: "HEAD_OF_DEPARTMENT", departmentId: dp.departmentId, isActive: true }, select: { id: true } }) : [];
  return new Set([...courses.map((x) => x.instructorId), ...secs.map((x) => x.instructorId), ...batches.map((b) => b.coordinatorId), ...hods.map((h) => h.id)].filter((x): x is string => !!x));
}

export async function facultyExport(ctx: Ctx, scope: "program" | "all", lists: Lists) {
  const rows = await sectionRows("faculty", ctx);
  const keep = scope === "all" ? null : await programTeacherIds(ctx.chairmanId, ctx.program);
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.ref).concat(["none"]) } }, select: { id: true, email: true } });
  const mail = new Map(users.map((u) => [u.id, u.email]));
  const stored = await staffDetails(rows.map((r) => r.ref));
  const out: ExportRow[] = [];
  for (const r of rows) {
    if (keep && !keep.has(r.ref)) continue;
    const v = canonValues("staff", { ...r.values, accountEmail: mail.get(r.ref) || r.values.email || "" }, lists);
    if (!/^pakistan/i.test(v.country || "Pakistan") && v.foreignUniversity) v.university = v.foreignUniversity;
    const row = buildRow(FACULTY_TEMPLATE, v, lists, r.ref, r.ref);
    // Degree dates worked out from the year only: the portal accepts them, but the teacher should confirm.
    const own = stored.get(r.ref) || {};
    for (const [k, h] of [["degreeStart", "Degree Start Date"], ["degreeEnd", "Degree End Date"]]) if (v[k] && !own[k]) row.issues.push({ col: h, problem: "estimated from the year of the degree — confirm the exact date", severity: "check" });
    out.push(row);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function summary(rows: ExportRow[]) {
  const rejected = rows.filter((r) => r.issues.some((i) => i.severity === "reject")).length;
  const checks = rows.reduce((t, r) => t + r.issues.filter((i) => i.severity === "check").length, 0);
  const byCol = new Map<string, number>();
  for (const r of rows) for (const i of r.issues) if (i.severity === "reject") byCol.set(i.col, (byCol.get(i.col) || 0) + 1);
  return { rows: rows.length, ready: rows.length - rejected, rejected, checks, topColumns: Array.from(byCol.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6) };
}

/** The file itself: one sheet named as in the template, the header row, then the rows. Nothing else. */
export async function portalWorkbook(t: Template, rows: ExportRow[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OBEHUB";
  const ws = wb.addWorksheet(t.sheet);
  ws.columns = t.cols.map((col) => ({ width: col.width }));
  ws.addRow(t.cols.map((col) => col.header));
  for (const r of rows) {
    const row = ws.addRow(r.cells.map((x) => (x === null ? null : x)));
    t.cols.forEach((col, i) => { if (col.type === "date" && r.cells[i] instanceof Date) row.getCell(i + 1).numFmt = t.dateFormat; });
  }
  return wb.xlsx.writeBuffer();
}

/* ---------------- Courses Catalog (typed into the portal one by one) ---------------- */

export async function courseCatalog(chairmanId: string, program: string) {
  const batches = await prisma.batch.findMany({ where: { degreeProgram: program, coordinator: { managedById: chairmanId } }, select: { id: true }, orderBy: { startYear: "desc" } });
  const cs = await prisma.course.findMany({ where: { batchId: { in: batches.map((b) => b.id).concat(["none"]) }, isNonCredit: false }, select: { id: true, code: true, title: true, creditHours: true, courseType: true, hasLab: true, labPct: true, batchId: true }, orderBy: { code: "asc" } });
  const order = new Map(batches.map((b, i) => [b.id, i]));
  const latest = new Map<string, (typeof cs)[number]>();
  for (const x of cs) { const cur = latest.get(x.code); if (!cur || (order.get(x.batchId || "") ?? 99) < (order.get(cur.batchId || "") ?? 99)) latest.set(x.code, x); }
  const list = Array.from(latest.values());
  const maps = await prisma.coursePloMapping.findMany({ where: { courseId: { in: list.map((x) => x.id).concat(["none"]) } }, select: { courseId: true, plo: { select: { number: true } } } });
  const codes = new Set(list.map((x) => x.code.toUpperCase()));
  return list.map((x) => {
    const gas = new Set(maps.filter((m) => m.courseId === x.id).map((m) => m.plo.number).filter((n) => n >= 1 && n <= 10));
    const isLab = /lab/i.test(x.courseType) || (/L$/i.test(x.code) && codes.has(x.code.slice(0, -1).toUpperCase()));
    const note = !isLab && x.hasLab && x.labPct > 0 && !codes.has(`${x.code}L`.toUpperCase()) ? "has a lab part: add the lab as its own course on the portal" : !gas.size ? "no GA mapped yet (map CLOs to PLOs)" : "";
    return { code: x.code, name: `${x.code} ${x.title}`, type: isLab ? "Lab" : "Theory", credits: x.creditHours, gas, note };
  });
}
export async function courseCatalogWorkbook(rows: Awaited<ReturnType<typeof courseCatalog>>, program: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Courses Catalog");
  ws.addRow([`${program} — Courses Catalog for the NCEAC portal (add theory and lab courses separately)`]).font = { bold: true };
  const head = ws.addRow(["Course Name", "HEC Curriculum", "Course Type", "Linked HEC Course", "Credit Hr", ...Array.from({ length: 10 }, (_, i) => `GA-${i + 1}`), "Note"]);
  head.font = { bold: true };
  for (const r of rows) ws.addRow([r.name, "", r.type, "", r.credits, ...Array.from({ length: 10 }, (_, i) => (r.gas.has(i + 1) ? "✓" : "")), r.note]);
  ws.columns.forEach((col, i) => { col.width = i === 0 ? 40 : i === 15 ? 46 : i >= 5 ? 6 : 16; });
  ws.views = [{ state: "frozen", ySplit: 2 }];
  return wb.xlsx.writeBuffer();
}

/* ---------------- Upload a filled portal file back into OBEHUB ---------------- */

const text = (cell: ExcelJS.Cell) => { const v = cell.value as unknown; if (v instanceof Date) return `${String(v.getUTCDate()).padStart(2, "0")}/${String(v.getUTCMonth() + 1).padStart(2, "0")}/${v.getUTCFullYear()}`; if (v && typeof v === "object" && "text" in (v as object)) return String((v as { text: unknown }).text); if (v && typeof v === "object" && "result" in (v as object)) return String((v as { result: unknown }).result ?? ""); return (cell.text || "").trim(); };

const omit = (o: Record<string, string>, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

/** Read a students or faculty file in the portal's format and keep the values in each person's NCEAC details. */
export async function importPortalFile(buf: Buffer, t: Template, ctx: Ctx, by: string, lists: Lists) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  const ws = wb.worksheets[0];
  if (!ws) return { saved: 0, skipped: ["The file has no sheet."] };
  const head = (ws.getRow(1).values as unknown[]).slice(1).map((x) => String(x ?? "").trim());
  const idx = new Map(t.cols.map((col) => [col.key, head.findIndex((h) => h.toLowerCase() === col.header.toLowerCase())]));
  if (t.cols.filter((col) => (idx.get(col.key) ?? -1) < 0).length > 3) return { saved: 0, skipped: [`This is not the ${t.title}: its headers do not match.`] };
  const skipped: string[] = [];
  let saved = 0;
  const studentByRoll = new Map<string, string>();
  const staffBy = new Map<string, string>();
  if (t.key === "students") {
    const st = await prisma.student.findMany({ where: { batchId: { in: ctx.batches.map((b) => b.id).concat(["none"]) } }, select: { id: true, rollNumber: true } });
    for (const s of st) studentByRoll.set(s.rollNumber.toLowerCase(), s.id);
  } else {
    const rows = await sectionRows("faculty", ctx);
    const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.ref).concat(["none"]) } }, select: { id: true, email: true } });
    for (const u of users) staffBy.set(u.email.toLowerCase(), u.id);
    for (const r of rows) if (r.values.cnic) staffBy.set((cnicOf(r.values.cnic) || r.values.cnic).toLowerCase(), r.ref);
  }
  for (let n = 2; n <= ws.rowCount; n++) {
    const row = ws.getRow(n);
    const vals: Record<string, string> = {};
    for (const col of t.cols) { const i = idx.get(col.key) ?? -1; if (i >= 0) { const x = text(row.getCell(i + 1)); if (x) vals[col.key] = x; } }
    if (!Object.keys(vals).length || /^compulsory$/i.test(vals.name || "")) continue;
    if (t.key === "students") {
      const id = studentByRoll.get((vals.roll || "").toLowerCase());
      if (!id) { skipped.push(`Row ${n}: roll number ${vals.roll || "(empty)"} is not a student of ${ctx.program}`); continue; }
      await saveDetail("student", id, canonValues("student", omit(vals, ["roll", "name", "admission"]), lists), by);
    } else {
      const id = staffBy.get((vals.accountEmail || "").toLowerCase()) || staffBy.get((vals.email || "").toLowerCase()) || staffBy.get((cnicOf(vals.cnic) || "").toLowerCase());
      if (!id) { skipped.push(`Row ${n}: ${vals.name || vals.accountEmail || "this teacher"} has no OBEHUB account (matched by email or CNIC)`); continue; }
      await saveDetail("staff", id, canonValues("staff", omit(vals, ["accountEmail", "name"]), lists), by);
    }
    saved++;
  }
  return { saved, skipped: skipped.slice(0, 25) };
}

/* ---------------- Export log ---------------- */

export async function logExport(e: { chairmanId: string; kind: string; program: string; batchId?: string | null; batchName?: string | null; rows: number; rejected: number; byId: string }) {
  try { await adb.nceacExportLog.create({ data: { id: randomUUID(), chairmanId: e.chairmanId, kind: e.kind, program: e.program, batchId: e.batchId || null, batchName: e.batchName || null, rowCount: e.rows, rejectedCount: e.rejected, byId: e.byId } }); return true; } catch { return false; }
}
export async function exportLog(chairmanId: string, take = 40) {
  try {
    const rows = (await adb.nceacExportLog.findMany({ where: { chairmanId }, orderBy: { createdAt: "desc" }, take })) as { id: string; kind: string; program: string; batchName: string | null; rowCount: number; rejectedCount: number; byId: string; createdAt: Date }[];
    const us = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.byId).concat(["none"]) } }, select: { id: true, name: true } });
    const nm = new Map(us.map((u) => [u.id, u.name]));
    return { ok: true as const, rows: rows.map((r) => ({ ...r, by: nm.get(r.byId) || "—" })) };
  } catch { return { ok: false as const, rows: [] }; }
}
