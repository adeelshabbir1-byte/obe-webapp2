import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { writeAuditLog } from "./audit";
import { collegesOf, universityOf, setAffiliation } from "./curriculumLibrary";
import { allStored, saveSetting } from "./scopedSettings";

// Affiliation work between a university and its colleges (Adeel prompt §28–30), on one register with a trail:
// applications (new / renewal / program / seats / withdrawal) through scrutiny, visit, report, committee and the final
// authority; lab and exam centres; the external examiner pool; exam sessions with two examiners, one agreed mark and
// grievances; examiner claims (taxable fees vs tax-free TA/DA, by the Registrar's rates); notices with acknowledgement;
// college faculty approval; fees; migrations; colleges' council accreditation; re-check / re-marking.
// Side: UNI = the affiliating university (its IH, Dean, HOD, Controller), COLLEGE = an affiliated college (its head, PL, DC).
const db = prisma as unknown as Record<string, any>;
export type Side = "UNI" | "COLLEGE";
export type Field = { key: string; label: string; type?: "text" | "number" | "date" | "select" | "long"; options?: string[]; side?: Side };
export type KindDef = { key: string; label: string; createdBy: Side; fields: Field[]; statuses: string[]; moves: Record<string, { to: string[]; by: Side }> };
const S = (to: string[], by: Side) => ({ to, by });
export const KINDS: KindDef[] = [
  { key: "APPLICATION", label: "Affiliation applications", createdBy: "COLLEGE", statuses: ["SUBMITTED", "SCRUTINY", "DOCS_NEEDED", "VISIT_SET", "INSPECTED", "RECOMMENDED", "APPROVED", "CONDITIONAL", "REFUSED"],
    fields: [{ key: "type", label: "Application for", type: "select", options: ["New affiliation", "Renewal", "New program", "More seats"] }, { key: "programs", label: "Programs" }, { key: "seats", label: "Seats requested", type: "number" }, { key: "facilities", label: "Facilities (labs, PCs, library, rooms)", type: "long" }, { key: "faculty", label: "Faculty (number, PhDs)", type: "long" }, { key: "finance", label: "Finances", type: "long" }, { key: "documents", label: "Documents (links)", type: "long" },
      { key: "visitDate", label: "Visit date", type: "date", side: "UNI" }, { key: "team", label: "Inspection team", side: "UNI" }, { key: "score", label: "Inspection score (0–100)", type: "number", side: "UNI" }, { key: "report", label: "Inspection report / remarks", type: "long", side: "UNI" }, { key: "conditions", label: "Conditions and deadlines", type: "long", side: "UNI" }, { key: "authority", label: "Final approval by", type: "select", options: ["Syndicate", "Vice-Chancellor", "Academic Council"], side: "UNI" }, { key: "validUntil", label: "Valid until", type: "date", side: "UNI" }],
    moves: { SUBMITTED: S(["SCRUTINY", "DOCS_NEEDED"], "UNI"), DOCS_NEEDED: S(["SUBMITTED"], "COLLEGE"), SCRUTINY: S(["VISIT_SET", "DOCS_NEEDED"], "UNI"), VISIT_SET: S(["INSPECTED"], "UNI"), INSPECTED: S(["RECOMMENDED", "REFUSED"], "UNI"), RECOMMENDED: S(["APPROVED", "CONDITIONAL", "REFUSED"], "UNI"), CONDITIONAL: S(["APPROVED", "REFUSED"], "UNI") } },
  { key: "CENTRE", label: "Lab and exam centres", createdBy: "COLLEGE", statuses: ["APPLIED", "DECLARED", "SUSPENDED", "WITHDRAWN"],
    fields: [{ key: "type", label: "Centre for", type: "select", options: ["Lab tests", "Theory exams"] }, { key: "capacity", label: "Working PCs / hall seats per session", type: "number" }, { key: "software", label: "Software, internet, power backup", type: "long" }, { key: "city", label: "City" }, { key: "validUntil", label: "Valid until", type: "date", side: "UNI" }],
    moves: { APPLIED: S(["DECLARED", "WITHDRAWN"], "UNI"), DECLARED: S(["SUSPENDED", "WITHDRAWN"], "UNI"), SUSPENDED: S(["DECLARED", "WITHDRAWN"], "UNI") } },
  { key: "EXAMINER", label: "External examiner pool", createdBy: "UNI", statuses: ["PROPOSED", "APPROVED", "INACTIVE"],
    fields: [{ key: "institute", label: "Institute" }, { key: "city", label: "City" }, { key: "designation", label: "Designation" }, { key: "payScale", label: "Pay scale (BPS)", type: "number" }, { key: "courses", label: "Courses he can examine (codes)" }, { key: "qualification", label: "Qualification" }, { key: "bank", label: "Bank details" }, { key: "relatives", label: "Declared relatives at colleges" }],
    moves: { PROPOSED: S(["APPROVED", "INACTIVE"], "UNI"), APPROVED: S(["INACTIVE"], "UNI"), INACTIVE: S(["APPROVED"], "UNI") } },
  { key: "SESSION", label: "Exam sessions (lab tests and finals)", createdBy: "UNI", statuses: ["SCHEDULED", "HELD", "GRIEVANCE", "MARKS_AGREED", "SENT"],
    fields: [{ key: "type", label: "Session", type: "select", options: ["Lab test", "Theory final"] }, { key: "courseCode", label: "Course code" }, { key: "centreId", label: "Centre (record id)" }, { key: "date", label: "Date", type: "date" }, { key: "slot", label: "Session / slot" }, { key: "students", label: "Students", type: "number" }, { key: "externalId", label: "External examiner (record id)" }, { key: "internal", label: "Internal examiner", side: "COLLEGE" }, { key: "superintendent", label: "Superintendent / invigilators" }, { key: "paperRelease", label: "Paper released at (date-time)" },
      { key: "condition", label: "Lab / centre condition report (external)", type: "long" }, { key: "unfairMeans", label: "Absentees and unfair-means cases", type: "long" }, { key: "grievance", label: "Grievance (internal examiner)", type: "long", side: "COLLEGE" }, { key: "resolution", label: "Controller's resolution", type: "long", side: "UNI" }],
    moves: { SCHEDULED: S(["HELD"], "UNI"), HELD: S(["MARKS_AGREED", "GRIEVANCE"], "UNI"), GRIEVANCE: S(["MARKS_AGREED"], "UNI"), MARKS_AGREED: S(["SENT"], "UNI") } },
  { key: "CLAIM", label: "Examiner claims (fees and TA/DA)", createdBy: "UNI", statuses: ["SUBMITTED", "VERIFIED", "APPROVED", "PAID", "REFUSED"],
    fields: [{ key: "examinerId", label: "Examiner (record id)" }, { key: "sessionId", label: "Session (record id)" }, { key: "role", label: "Role", type: "select", options: ["External examiner", "Internal examiner", "Paper setter", "Paper marker", "Superintendent", "Invigilator"] }, { key: "students", label: "Students evaluated / scripts marked", type: "number" }, { key: "paperSet", label: "Paper set (1 / 0)", type: "number" }, { key: "fromCity", label: "From city" }, { key: "toCity", label: "To city" }, { key: "depart", label: "Departure (date-time)" }, { key: "return", label: "Return (date-time)" }, { key: "transport", label: "Transport", type: "select", options: ["Own car", "Public transport", "Air", "University vehicle"] }, { key: "km", label: "Distance (km, own car)", type: "number" }, { key: "fare", label: "Fare paid (public / air)", type: "number" }, { key: "payScale", label: "Pay scale (BPS)", type: "number" }, { key: "nights", label: "Nights stayed", type: "number" }, { key: "receipts", label: "Tickets / receipts (links)" }],
    moves: { SUBMITTED: S(["VERIFIED", "REFUSED"], "UNI"), VERIFIED: S(["APPROVED", "REFUSED"], "UNI"), APPROVED: S(["PAID"], "UNI") } },
  { key: "NOTICE", label: "Notices and circulars", createdBy: "UNI", statuses: ["SENT", "CLOSED"],
    fields: [{ key: "text", label: "Notice", type: "long" }, { key: "attachment", label: "Attachment (link)" }, { key: "deadline", label: "Action deadline", type: "date" }, { key: "colleges", label: "To colleges (blank = all, or record ids)" }],
    moves: { SENT: S(["CLOSED"], "UNI") } },
  { key: "FACULTY", label: "College faculty approval", createdBy: "COLLEGE", statuses: ["SUBMITTED", "APPROVED", "REFUSED", "EXPIRED"],
    fields: [{ key: "teacher", label: "Teacher" }, { key: "courses", label: "Course codes" }, { key: "qualification", label: "Qualification and field" }, { key: "experience", label: "Experience (years)", type: "number" }, { key: "publications", label: "Publications" }, { key: "cv", label: "CV and degrees (links)" }, { key: "validUntil", label: "Approved until", type: "date", side: "UNI" }],
    moves: { SUBMITTED: S(["APPROVED", "REFUSED"], "UNI"), APPROVED: S(["EXPIRED"], "UNI"), EXPIRED: S(["SUBMITTED"], "COLLEGE") } },
  { key: "FEE", label: "College fees to the university", createdBy: "UNI", statuses: ["DUE", "PAID", "WAIVED"],
    fields: [{ key: "head", label: "Fee", type: "select", options: ["Affiliation", "Inspection", "Registration", "Exam", "Centre"] }, { key: "amount", label: "Amount (Rs)", type: "number" }, { key: "due", label: "Due date", type: "date" }, { key: "challan", label: "Challan number" }, { key: "paidOn", label: "Paid on", type: "date", side: "COLLEGE" }],
    moves: { DUE: S(["PAID", "WAIVED"], "UNI") } },
  { key: "MIGRATION", label: "Student migration between colleges", createdBy: "COLLEGE", statuses: ["REQUESTED", "BOTH_AGREED", "APPROVED", "REFUSED"],
    fields: [{ key: "student", label: "Student (roll number, name)" }, { key: "toCollege", label: "To college (name)" }, { key: "reason", label: "Reason", type: "long" }],
    moves: { REQUESTED: S(["BOTH_AGREED", "REFUSED"], "COLLEGE"), BOTH_AGREED: S(["APPROVED", "REFUSED"], "UNI") } },
  { key: "ACCREDITATION", label: "Colleges' council accreditation (NCEAC …)", createdBy: "COLLEGE", statuses: ["APPLIED", "VISIT_SCHEDULED", "VISITED", "ACCREDITED", "DEFERRED", "REFUSED"],
    fields: [{ key: "program", label: "Program" }, { key: "council", label: "Council", type: "select", options: ["NCEAC", "NBEAC", "PEC", "Other"] }, { key: "visit", label: "Visit date", type: "date" }, { key: "level", label: "Level / years" }, { key: "validUntil", label: "Valid until", type: "date" }, { key: "letter", label: "Council decision letter (link)" }, { key: "verified", label: "Verified by the Affiliation office (yes / no)", side: "UNI" }],
    moves: { APPLIED: S(["VISIT_SCHEDULED"], "COLLEGE"), VISIT_SCHEDULED: S(["VISITED"], "COLLEGE"), VISITED: S(["ACCREDITED", "DEFERRED", "REFUSED"], "COLLEGE"), DEFERRED: S(["VISIT_SCHEDULED"], "COLLEGE") } },
  { key: "RECHECK", label: "Re-checking and re-marking", createdBy: "COLLEGE", statuses: ["APPLIED", "DONE", "REFUSED"],
    fields: [{ key: "student", label: "Student (roll number)" }, { key: "course", label: "Course code" }, { key: "type", label: "Request", type: "select", options: ["Re-checking (totals, unmarked)", "Re-marking (another marker)"] }, { key: "fee", label: "Fee paid", type: "number" }, { key: "outcome", label: "Outcome", type: "long", side: "UNI" }],
    moves: { APPLIED: S(["DONE", "REFUSED"], "UNI") } },
];
export const kindOf = (k: string) => KINDS.find((x) => x.key === k);
type Rec = { id: string; universityId: string; collegeId: string | null; kind: string; status: string; title: string; dataJson: string; createdById: string; createdAt: Date; updatedAt: Date };
const J = <T>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };
export const dataOf = (r: Rec) => J<Record<string, any>>(r.dataJson, {});
const UNI_ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"];

/** Where this person stands: as the university (has colleges) and/or as a college (has a university). */
export async function sideOf(user: { id: string; role: string; extraRoles?: string[] }, instituteId: string) {
  const [colleges, uni] = await Promise.all([collegesOf(instituteId).catch(() => []), universityOf(instituteId).catch(() => null)]);
  const controller = (user.extraRoles || []).includes("EXAM_CONTROLLER");
  return { asUni: colleges.length > 0 && (UNI_ROLES.includes(user.role) || controller), asCollege: !!uni && ["CHAIRMAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "HEAD_OF_DEPARTMENT"].includes(user.role), universityId: colleges.length ? instituteId : uni, colleges };
}

export async function list(universityId: string, kind: string, collegeId?: string | null) {
  return ((await db.affRecord?.findMany({ where: { universityId, kind, ...(collegeId ? { OR: [{ collegeId }, { collegeId: null }] } : {}) }, orderBy: { updatedAt: "desc" }, take: 300 }).catch(() => [])) || []) as Rec[];
}
export async function eventsOf(recordId: string) {
  return ((await db.affEvent?.findMany({ where: { recordId }, orderBy: { at: "asc" } }).catch(() => [])) || []) as { byId: string; action: string; note: string | null; at: Date }[];
}
async function log(recordId: string, byId: string, action: string, note?: string) {
  await db.affEvent.create({ data: { id: randomUUID(), recordId, byId, action, note: note?.slice(0, 500) || null } });
}

export async function create(user: { id: string }, side: Side, universityId: string, collegeId: string | null, kind: string, title: string, data: Record<string, unknown>) {
  if (!db.affRecord) throw new Error("Run prisma/migration_adeel_p9.sql in Supabase first.");
  const k = kindOf(kind); if (!k) throw new Error("Unknown kind.");
  if (k.createdBy !== side) throw new Error(`${k.label} are started by the ${k.createdBy === "UNI" ? "university" : "college"}.`);
  const id = randomUUID();
  const clean = Object.fromEntries(k.fields.filter((f) => !f.side || f.side === side).map((f) => [f.key, data[f.key] ?? ""]));
  await db.affRecord.create({ data: { id, universityId, collegeId, kind, status: k.statuses[0], title: title.slice(0, 200) || k.label, dataJson: JSON.stringify(clean), createdById: user.id } });
  await log(id, user.id, "CREATED");
  const to = side === "COLLEGE" ? [universityId] : collegeId ? [collegeId] : (await collegesOf(universityId)).map((c) => c.collegeId);
  await notifyUsers(to, { kind: "AFFILIATION", title: `${k.label}: ${title}`, href: `/affiliation?tab=${kind}` }).catch(() => null);
  return id;
}

/** Edit the fields this side may fill. */
export async function edit(user: { id: string }, side: Side, rec: Rec, data: Record<string, unknown>) {
  const k = kindOf(rec.kind)!;
  const d = dataOf(rec);
  for (const f of k.fields) if ((!f.side || f.side === side) && f.key in data) d[f.key] = data[f.key];
  await db.affRecord.update({ where: { id: rec.id }, data: { dataJson: JSON.stringify(d), updatedAt: new Date() } });
  await log(rec.id, user.id, "EDITED");
}

/** Move a record on; the rules of each kind are checked here. */
export async function move(user: { id: string; name: string }, side: Side, rec: Rec, to: string, note = "") {
  const k = kindOf(rec.kind)!, m = k.moves[rec.status];
  if (!m || !m.to.includes(to)) throw new Error(`Can't go from ${rec.status} to ${to}.`);
  if (m.by !== side) throw new Error(`The ${m.by === "UNI" ? "university" : "college"} does this step.`);
  const d = dataOf(rec);
  if (rec.kind === "SESSION" && to === "MARKS_AGREED") {
    const rows = (d.marks || []) as { ext?: boolean; int?: boolean }[];
    if (!rows.length || rows.some((r) => !r.ext || !r.int)) throw new Error("Both examiners must confirm every student's agreed mark first.");
    if (rec.status === "GRIEVANCE" && !String(d.resolution || "").trim()) throw new Error("Record the Controller's resolution first.");
  }
  if (rec.kind === "CLAIM" && to === "VERIFIED" && /external/i.test(String(d.role || ""))) {
    const s = d.sessionId ? ((await db.affRecord.findUnique({ where: { id: d.sessionId } })) as Rec | null) : null;
    if (!s || !String(dataOf(s).condition || "").trim()) throw new Error("The external examiner's condition report is required before payment.");
  }
  if (rec.kind === "APPLICATION" && to === "APPROVED") {
    if (!d.validUntil) throw new Error("Set “Valid until” first.");
    if (rec.collegeId) await setAffiliation(user.id, rec.collegeId, rec.universityId, `Approved by ${d.authority || "Syndicate"}`).catch(() => null);
  }
  await db.affRecord.update({ where: { id: rec.id }, data: { status: to, updatedAt: new Date() } });
  await log(rec.id, user.id, `STATUS ${to}`, note);
  await writeAuditLog({ actorUserId: user.id, action: `AFF_${rec.kind}_${to}`, entityType: "AffRecord", entityId: rec.id }).catch(() => null);
  const other = side === "UNI" ? [rec.collegeId].filter((x): x is string => !!x) : [rec.universityId];
  await notifyUsers(other, { kind: "AFFILIATION", title: `${k.label}: ${rec.title} — ${to.toLowerCase().replace(/_/g, " ")}`, body: note, href: `/affiliation?tab=${rec.kind}` }).catch(() => null);
}

/** Session marks: each row { roll, mark, ext, int }; the external examiner (university side) and the internal (college) confirm. */
export async function sessionMarks(user: { id: string }, side: Side, rec: Rec, rows: { roll: string; mark: number | null }[], confirm: boolean) {
  const d = dataOf(rec);
  const cur = new Map(((d.marks || []) as { roll: string; mark: number | null; ext?: boolean; int?: boolean }[]).map((r) => [r.roll, r]));
  for (const r of rows) {
    const had = cur.get(r.roll);
    const changed = !had || had.mark !== r.mark;
    cur.set(r.roll, { roll: r.roll, mark: r.mark, ext: changed ? side === "UNI" && confirm : side === "UNI" ? confirm || !!had?.ext : !!had?.ext, int: changed ? side === "COLLEGE" && confirm : side === "COLLEGE" ? confirm || !!had?.int : !!had?.int });
  }
  d.marks = Array.from(cur.values());
  await db.affRecord.update({ where: { id: rec.id }, data: { dataJson: JSON.stringify(d), updatedAt: new Date() } });
  await log(rec.id, user.id, confirm ? "MARKS_CONFIRMED" : "MARKS_EDITED");
}

// Rates (the Registrar / Treasurer, as the university's IH or his delegate).
export type Rates = { perStudent: number; paperSetting: number; perScript: number; duty: number; taxPct: number; perKm: number; daBps: { upTo: number; da: number }[]; night: number };
export const DEFAULT_RATES: Rates = { perStudent: 50, paperSetting: 3000, perScript: 40, duty: 1500, taxPct: 10, perKm: 25, daBps: [{ upTo: 16, da: 2000 }, { upTo: 19, da: 3000 }, { upTo: 22, da: 4000 }], night: 3000 };
export async function ratesOf(universityId: string): Promise<Rates> {
  const r = (await allStored(universityId).catch(() => [])).find((x) => x.scopeType === "INSTITUTE" && x.key === "aff.rates");
  return { ...DEFAULT_RATES, ...J<Partial<Rates>>(r?.value || "{}", {}) };
}
export async function saveRates(universityId: string, rates: Rates, byId: string) { await saveSetting(universityId, "INSTITUTE", universityId, "aff.rates", JSON.stringify(rates), byId); }
/** A claim's amounts: taxable fees (tax deducted) and tax-free TA/DA. */
export function claimAmounts(d: Record<string, any>, r: Rates) {
  const n = Number(d.students) || 0, role = String(d.role || "");
  const taxable = (/examiner/i.test(role) ? n * r.perStudent : 0) + (Number(d.paperSet) ? r.paperSetting : 0) + (/marker/i.test(role) ? n * r.perScript : 0) + (/superintendent|invigilator/i.test(role) ? r.duty : 0);
  const tax = Math.round((taxable * r.taxPct) / 100);
  const internal = /internal/i.test(role);
  const days = d.depart && d.return ? Math.max(1, Math.ceil((new Date(d.return).getTime() - new Date(d.depart).getTime()) / 864e5)) : 0;
  const bps = Number(d.payScale) || 17;
  const da = (r.daBps.find((x) => bps <= x.upTo) || r.daBps[r.daBps.length - 1] || { da: 0 }).da;
  const fare = internal ? 0 : /own car/i.test(String(d.transport || "")) ? (Number(d.km) || 0) * 2 * r.perKm : /university/i.test(String(d.transport || "")) ? 0 : Number(d.fare) || 0;
  const tada = internal ? 0 : fare + days * da + (Number(d.nights) || 0) * r.night;
  return { taxable, tax, netFees: taxable - tax, tada, total: taxable - tax + tada };
}

/** College comparison (§28.8): per course and term — pass rate and mean from approved results — per college. */
export async function comparison(universityId: string) {
  const colleges = await collegesOf(universityId);
  const rows: { college: string; collegeId: string; code: string; term: string; passRate: number; mean: number; students: number }[] = [];
  for (const c of colleges) {
    const courses = await prisma.course.findMany({ where: { coordinator: { managedById: c.collegeId } }, select: { id: true, code: true, offeredTermName: true, offeredTermYear: true } });
    const res = ((await db.courseResult?.findMany({ where: { courseId: { in: courses.map((x) => x.id).concat("none") }, status: "APPROVED" }, select: { courseId: true, summaryJson: true } }).catch(() => [])) || []) as { courseId: string; summaryJson: string | null }[];
    for (const r of res) { const s = J<{ passRate?: number; mean?: number; students?: number }>(r.summaryJson || "{}", {}); const co = courses.find((x) => x.id === r.courseId)!; rows.push({ college: c.head?.instituteName || c.head?.name || "College", collegeId: c.collegeId, code: co.code, term: `${co.offeredTermName || ""} ${co.offeredTermYear || ""}`.trim(), passRate: s.passRate ?? 0, mean: Math.round(s.mean ?? 0), students: s.students ?? 0 }); }
  }
  return rows;
}
/** Sessional vs final (§28.7): per college course, the average % of the final against the other (college) items. */
export async function sessionalVsFinal(universityId: string, gap = 25) {
  const colleges = await collegesOf(universityId);
  const out: { college: string; code: string; sessional: number; final: number; flag: boolean }[] = [];
  for (const c of colleges) {
    const courses = await prisma.course.findMany({ where: { coordinator: { managedById: c.collegeId }, isOffered: true }, select: { id: true, code: true, assessmentInstruments: { select: { id: true, type: true, maxScore: true } } } });
    for (const co of courses) {
      const fin = co.assessmentInstruments.filter((i) => /final/i.test(i.type)), ses = co.assessmentInstruments.filter((i) => !/final/i.test(i.type));
      if (!fin.length || !ses.length) continue;
      const marks = await prisma.studentMark.findMany({ where: { courseId: co.id }, select: { instrumentId: true, score: true } });
      const pctOf = (ids: { id: string; maxScore: number }[]) => { const ms = marks.filter((m) => ids.some((i) => i.id === m.instrumentId)); return ms.length ? Math.round(ms.reduce((a, m) => a + (100 * m.score) / (ids.find((i) => i.id === m.instrumentId)!.maxScore || 1), 0) / ms.length) : null; };
      const s = pctOf(ses), f = pctOf(fin);
      if (s != null && f != null) out.push({ college: c.head?.instituteName || "College", code: co.code, sessional: s, final: f, flag: s - f >= gap });
    }
  }
  return out.sort((a, b) => b.sessional - b.final - (a.sessional - a.final));
}
