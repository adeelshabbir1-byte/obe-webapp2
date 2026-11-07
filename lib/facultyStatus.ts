import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import * as R from "./facultyRulesCore";

// Queue item 23: one place for each faculty member's highest degree, designation, employment and accreditation
// class (defaults worked out, every value editable), their FTE in each program, and NCEAC Criterion 5 per program.
const db = prisma as unknown as Record<string, any>;
export const FST_HINT = "Run prisma/migration_adeel_p14.sql (System Health → Database updates) first.";
const FACULTY_ROLES = ["INSTRUCTOR", "SUBJECT_EXPERT", "LAB_ENGINEER", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEAN", "CHAIRMAN", "OMC"];
const ADMIN_ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"];
export const canEditFaculty = (u: { role: string; extraRoles?: string[] }) => ADMIN_ROLES.includes(u.role) || (u.extraRoles || []).includes("HR");
type Stored = { userId: string; degree: string | null; designation: string | null; employment: string | null; facultyClass: string | null; aqpq: string | null; note: string | null; updatedAt: Date };

export async function storedStatus(ids: string[]) {
  return ((await db.facultyStatus?.findMany({ where: { userId: { in: ids.concat("none") } } }).catch(() => null)) ?? null) as Stored[] | null;
}
/** Every faculty member of the institute with their degree, designation, employment and class (stored or default). */
export async function facultyOf(chairmanId: string, departmentId?: string | null) {
  const users = await prisma.user.findMany({ where: { isActive: true, isVisitingPlaceholder: false, role: { in: FACULTY_ROLES as never[] }, OR: [{ id: chairmanId }, { managedById: chairmanId }, { managedBy: { managedById: chairmanId } }], ...(departmentId ? { departmentId } : {}) }, select: { id: true, name: true, role: true, departmentId: true }, orderBy: { name: "asc" } });
  const ids = users.map((u) => u.id);
  const [profiles, stored] = await Promise.all([
    prisma.facultyProfile.findMany({ where: { userId: { in: ids.concat("none") } }, select: { userId: true, designation: true, employmentType: true } }),
    storedStatus(ids),
  ]);
  return { ready: stored !== null, people: users.map((u) => {
    const p = profiles.find((x) => x.userId === u.id); const s = (stored || []).find((x) => x.userId === u.id);
    const degree = (R.parseDegree(s?.degree) || R.defaultDegree(u.name, u.role)) as R.Degree;
    const employment = s?.employment || R.parseEmployment(p?.employmentType, u.role);
    const designation = s?.designation || p?.designation || (u.role === "LAB_ENGINEER" ? "Lab Engineer" : "");
    return { id: u.id, name: u.name, role: u.role, departmentId: u.departmentId, degree, degreeSet: !!s?.degree, employment, designation, cls: s?.facultyClass || null, aqpq: s?.aqpq || null, note: s?.note || null,
      admin: ADMIN_ROLES.includes(u.role) || /dean|chair|director|rector|vice.?chancellor|head of/i.test(designation) };
  }) };
}
async function sameInstitute(chairmanId: string, userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, managedById: true, managedBy: { select: { managedById: true } } } });
  return !!u && (u.id === chairmanId || u.managedById === chairmanId || u.managedBy?.managedById === chairmanId);
}
export type StatusInput = { degree?: string | null; designation?: string | null; employment?: string | null; facultyClass?: string | null; aqpq?: string | null; note?: string | null };
const clean = (v: unknown, ok?: string[]) => { const s = v === undefined ? undefined : v === null ? null : String(v).trim().slice(0, 120) || null; return s && ok && !ok.includes(s) ? undefined : s; };
/** Save one person's values (blank = back to the default). */
export async function saveStatus(actorId: string, chairmanId: string, userId: string, d: StatusInput) {
  if (!db.facultyStatus) throw new Error(FST_HINT);
  if (!(await sameInstitute(chairmanId, userId))) throw new Error("Not in your institute.");
  const data: Record<string, unknown> = {};
  const deg = d.degree === undefined ? undefined : d.degree ? R.parseDegree(d.degree) : null; if (deg !== undefined) data.degree = deg;
  for (const [k, ok] of [["designation"], ["employment", ["PERMANENT", "CONTRACT", "VISITING", "LAB_ENGINEER"]], ["facultyClass", ["DEDICATED", "SHARED", "VISITING", "DEMONSTRATOR"]], ["aqpq", ["AQ", "PQ", "OTHER"]], ["note"]] as [keyof StatusInput, string[]?][]) { const v = clean(d[k], ok); if (v !== undefined) data[k] = v; }
  await db.facultyStatus.upsert({ where: { userId }, create: { userId, ...data, byId: actorId }, update: { ...data, byId: actorId, updatedAt: new Date() } });
  if (typeof data.designation === "string") await prisma.facultyProfile.updateMany({ where: { userId }, data: { designation: data.designation } }).catch(() => null);
  await writeAuditLog({ actorUserId: actorId, action: "FACULTY_STATUS_CHANGED", entityType: "User", entityId: userId, metadata: data as never });
}
export async function saveMany(actorId: string, chairmanId: string, ids: string[], d: StatusInput) { for (const id of ids.slice(0, 300)) await saveStatus(actorId, chairmanId, id, d); return Math.min(ids.length, 300); }

// ---- Load: credit hours per person per program, this term and over the academic year.
export async function fullLoad(chairmanId: string) {
  const { allStored } = await import("./scopedSettings");
  const r = (await allStored(chairmanId)).find((x) => x.scopeType === "INSTITUTE" && x.key === "faculty.fullLoad");
  const v = Number(r?.value); return Number.isFinite(v) && v > 0 ? v : R.NCEAC_DEFAULT.maxLoadTerm;
}
export async function saveFullLoad(chairmanId: string, v: number, byId: string) {
  if (!(v > 0 && v <= 30)) throw new Error("Give the full load in credit hours a semester (1–30).");
  const { saveSetting } = await import("./scopedSettings"); await saveSetting(chairmanId, "INSTITUTE", chairmanId, "faculty.fullLoad", String(v), byId);
}
/** The current term (most offered courses) and the academic year around it (Fall Y + Spring Y+1). */
export async function loads(chairmanId: string) {
  const courses = await prisma.course.findMany({ where: { coordinator: { managedById: chairmanId }, isNonCredit: false, offeredTermYear: { not: null } }, select: { id: true, creditHours: true, instructorId: true, labEngineerId: true, hasLab: true, isOffered: true, offeredTermName: true, offeredTermYear: true, batch: { select: { degreeProgram: true } } } });
  const count = new Map<string, number>(); for (const c of courses.filter((x) => x.isOffered)) { const k = `${c.offeredTermName}|${c.offeredTermYear}`; count.set(k, (count.get(k) || 0) + 1); }
  const cur = Array.from(count.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || `Fall|${new Date().getUTCFullYear()}`;
  const [term, y] = cur.split("|"); const year = Number(y);
  const fallYear = /fall/i.test(term) ? year : year - 1;
  const inYear = (c: (typeof courses)[number]) => (/fall/i.test(c.offeredTermName || "") && c.offeredTermYear === fallYear) || (/spring/i.test(c.offeredTermName || "") && c.offeredTermYear === fallYear + 1);
  const inTerm = (c: (typeof courses)[number]) => c.offeredTermName === term && c.offeredTermYear === year;
  const yearCourses = courses.filter(inYear);
  const yearKnown = yearCourses.some((c) => /fall/i.test(c.offeredTermName || "")) && yearCourses.some((c) => /spring/i.test(c.offeredTermName || ""));
  // Lab engineers: one credit hour for each lab they run (the lab part of a course).
  const add = (m: Map<string, Map<string, number>>, who: string | null, prog: string, h: number) => { if (!who) return; const x = m.get(who) || new Map<string, number>(); x.set(prog, (x.get(prog) || 0) + h); m.set(who, x); };
  const termM = new Map<string, Map<string, number>>(), yearM = new Map<string, Map<string, number>>();
  for (const c of courses) { const prog = c.batch?.degreeProgram || "—";
    if (inTerm(c)) { add(termM, c.instructorId, prog, c.creditHours); if (c.hasLab) add(termM, c.labEngineerId, prog, 1); }
    if (inYear(c)) { add(yearM, c.instructorId, prog, c.creditHours); if (c.hasLab) add(yearM, c.labEngineerId, prog, 1); } }
  const programs: string[] = Array.from(new Set<string>(courses.filter((c) => inTerm(c) || inYear(c)).map((c) => c.batch?.degreeProgram || "—"))).sort();
  return { term, year, fallYear, yearKnown, termM, yearM, programs };
}
const sum = (m?: Map<string, number>) => (m ? Array.from(m.values()).reduce((a, b) => a + b, 0) : 0);

/** Faculty × program table: each cell the person's FTE in that program (full-time: their share of their own load;
 * visiting: hours ÷ the full load). Over the year when both terms are known, else this term. */
export async function fteMatrix(chairmanId: string, departmentId?: string | null) {
  const [{ people, ready }, L, full] = await Promise.all([facultyOf(chairmanId, departmentId), loads(chairmanId), fullLoad(chairmanId)]);
  const M = L.yearKnown ? L.yearM : L.termM; const fullFor = L.yearKnown ? full * 2 : full;
  const rows = people.map((p) => { const m = M.get(p.id); const all = sum(m);
    const cells = L.programs.map((g) => { const h = m?.get(g) || 0; const fte = !h ? 0 : p.employment === "VISITING" ? Math.min(1, h / fullFor) : all ? h / all : 0; return { program: g, hours: h, fte: Math.round(fte * 100) / 100 }; });
    return { ...p, hours: all, cells, total: Math.round(cells.reduce((a, c) => a + c.fte, 0) * 100) / 100 };
  }).filter((r) => r.hours > 0 || r.role !== "CHAIRMAN");
  return { ready, rows, programs: L.programs, basis: L.yearKnown ? `academic year ${L.fallYear}–${String(L.fallYear + 1).slice(2)} (Fall + Spring)` : `${L.term} ${L.year} only — one semester, so a full load here is ${full} credit hours (half the year's ${full * 2})`, full };
}

// ---- Requirement versions (Super Admin).
export async function versions(body?: string) {
  const rows = ((await db.accreditationRuleVersion?.findMany({ where: { status: "ACTIVE", ...(body ? { body } : {}) }, orderBy: [{ fromYear: "desc" }, { at: "desc" }] }).catch(() => null)) ?? null) as { id: string; body: string; label: string; fromTerm: string; fromYear: number; rulesJson: string; note: string | null; byId: string; at: Date }[] | null;
  return rows === null ? null : rows.map((v) => ({ ...v, rules: (() => { try { return JSON.parse(v.rulesJson) as Record<string, number>; } catch { return {}; } })() }));
}
export async function saveVersion(actorId: string, d: { body: string; label: string; fromTerm: string; fromYear: number; rules: Record<string, unknown>; note?: string }) {
  if (!db.accreditationRuleVersion) throw new Error(FST_HINT);
  const fields = R.BODIES[d.body]; if (!fields) throw new Error("Unknown body.");
  if (!/^(Fall|Spring)$/.test(d.fromTerm) || !(d.fromYear >= 2000 && d.fromYear <= 2100)) throw new Error("Give the term (Fall / Spring) and year it applies from.");
  if (!String(d.label || "").trim()) throw new Error("Name the version (e.g. NCEAC Manual 2025).");
  const rules = Object.fromEntries(fields.map((f) => [f.key, Number(d.rules[f.key])]).filter(([, v]) => Number.isFinite(v as number) && (v as number) >= 0));
  const id = randomUUID();
  await db.accreditationRuleVersion.create({ data: { id, body: d.body, label: String(d.label).slice(0, 120), fromTerm: d.fromTerm, fromYear: d.fromYear, rulesJson: JSON.stringify(rules), note: d.note ? String(d.note).slice(0, 1000) : null, byId: actorId } });
  await writeAuditLog({ actorUserId: actorId, action: "ACCREDITATION_RULES_VERSION", entityType: "AccreditationRuleVersion", entityId: id, metadata: { body: d.body, from: `${d.fromTerm} ${d.fromYear}` } });
  return id;
}
export async function withdrawVersion(actorId: string, id: string) {
  await db.accreditationRuleVersion.update({ where: { id }, data: { status: "WITHDRAWN" } });
  await writeAuditLog({ actorUserId: actorId, action: "ACCREDITATION_RULES_WITHDRAWN", entityType: "AccreditationRuleVersion", entityId: id });
}

/** NCEAC Criterion 5 for one program, under the version in force this term. */
export async function nceacFor(chairmanId: string, program: string) {
  const [{ people }, L, vs] = await Promise.all([facultyOf(chairmanId), loads(chairmanId), versions("NCEAC")]);
  const v = R.versionFor("NCEAC", (vs || []).map((x) => ({ id: x.id, body: x.body, label: x.label, fromTerm: x.fromTerm, fromYear: x.fromYear, rules: x.rules })), L.term, L.year);
  const persons: R.Person[] = people.map((p) => ({ id: p.id, name: p.name, degree: p.degree, employment: p.employment, cls: p.cls, admin: p.admin,
    inProgTerm: L.termM.get(p.id)?.get(program) || 0, inProgYear: L.yearM.get(p.id)?.get(program) || 0, allTerm: sum(L.termM.get(p.id)), allYear: sum(L.yearM.get(p.id)), yearKnown: L.yearKnown }))
    .filter((p) => p.inProgTerm > 0 || p.inProgYear > 0);
  const rows = persons.map((p) => R.classify(p, v.rules));
  const batches = await prisma.batch.findMany({ where: { degreeProgram: program, coordinator: { managedById: chairmanId } }, select: { id: true, _count: { select: { students: true } }, courses: { where: { isOffered: true }, select: { semesterNumber: true } } } }).catch(() => [] as { id: string; _count: { students: number }; courses: { semesterNumber: number | null }[] }[]);
  const maxSem = Math.max(0, ...batches.flatMap((b) => b.courses.map((c) => c.semesterNumber || 0)));
  const yearsRunning = Math.max(1, Math.min(4, Math.ceil(maxSem / 2)));
  const maxBatch = Math.max(0, ...batches.filter((b) => b.courses.length).map((b) => b._count.students));
  return { version: v, term: `${L.term} ${L.year}`, yearKnown: L.yearKnown, rows, ...R.nceacChecks(rows, v.rules, yearsRunning, maxBatch), yearsRunning, maxBatch, programs: L.programs };
}

// ---- Letters and documents exchanged with NCEAC / HEC / NBEAC.
export const LETTER_KINDS = ["Visit report", "Our rebuttal", "Final decision", "Accreditation letter", "NOC", "Application", "Desk audit query", "Our reply", "Circular", "Other"];
export async function letters(chairmanId: string) {
  return ((await db.accreditationLetter?.findMany({ where: { chairmanId }, orderBy: [{ letterDate: "desc" }, { at: "desc" }], take: 300 }).catch(() => null)) ?? null) as { id: string; program: string | null; cycleId: string | null; counterpart: string; direction: string; kind: string; refNo: string | null; letterDate: Date | null; subject: string; fileUrl: string | null; fileName: string | null; byId: string; at: Date }[] | null;
}
export async function addLetter(actorId: string, chairmanId: string, d: { program?: string; cycleId?: string; counterpart: string; direction: string; kind: string; refNo?: string; letterDate?: string; subject: string; fileUrl?: string | null; fileName?: string | null }) {
  if (!db.accreditationLetter) throw new Error(FST_HINT);
  if (!String(d.subject || "").trim()) throw new Error("Give the subject of the letter.");
  const id = randomUUID();
  await db.accreditationLetter.create({ data: { id, chairmanId, program: d.program || null, cycleId: d.cycleId || null, counterpart: String(d.counterpart || "NCEAC").slice(0, 40), direction: d.direction === "OUT" ? "OUT" : "IN", kind: LETTER_KINDS.includes(d.kind) ? d.kind : "Other", refNo: d.refNo ? String(d.refNo).slice(0, 80) : null, letterDate: d.letterDate ? new Date(d.letterDate) : null, subject: String(d.subject).slice(0, 300), fileUrl: d.fileUrl || null, fileName: d.fileName || null, byId: actorId } });
  await writeAuditLog({ actorUserId: actorId, action: "ACCREDITATION_LETTER_ADDED", entityType: "AccreditationLetter", entityId: id });
  return id;
}
export async function removeLetter(actorId: string, chairmanId: string, id: string) {
  await db.accreditationLetter.deleteMany({ where: { id, chairmanId } });
  await writeAuditLog({ actorUserId: actorId, action: "ACCREDITATION_LETTER_REMOVED", entityType: "AccreditationLetter", entityId: id });
}
