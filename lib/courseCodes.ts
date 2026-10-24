import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { courseLock } from "./curriculumLibrary";

// Course codes: each department's system, decided by the Dean — a 2-letter prefix and 3 or 4 digits whose first digit is
// the year of study (semesters 1–2 → 1, 3–4 → 2 …), e.g. CS-1001, MT-2003, or CS101. A course takes the system of its
// HOME department (Calculus is coded by Mathematics in every program), and the same course keeps the same code in every
// program and batch. A program may have its own prefix. The system applies to batches from its effective term.

const cdb = prisma as unknown as Record<string, any>;
export const CODES_HINT = "Course codes need prisma/migration_curriculum_builder.sql — run it in Supabase (or System Health).";
export type Scheme = { id: string; chairmanId: string; departmentId: string; program: string | null; prefix: string; digits: number; separator: string; effectiveTerm: string | null; effectiveYear: number | null };
const TERMS = ["Spring", "Summer", "Fall"];
const key = (t: string | null, y: number | null) => (y || 0) * 10 + Math.max(0, TERMS.indexOf(t || "Spring"));
const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/\b(lab|laboratory)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export const isLabTitle = (t: string) => /\b(lab|laboratory)\b/i.test(t);

export async function schemes(chairmanId: string) { return (await cdb.courseCodeScheme.findMany({ where: { chairmanId } }).catch(() => null)) as Scheme[] | null; }
export async function saveScheme(chairmanId: string, by: string, s: { id?: string; departmentId: string; program?: string | null; prefix: string; digits: number; separator: string; effectiveTerm?: string | null; effectiveYear?: number | null }) {
  const prefix = s.prefix.toUpperCase().replace(/[^A-Z]/g, "");
  if (prefix.length < 2 || prefix.length > 4) throw new Error("The prefix is 2 letters (up to 4), e.g. CS, MT, EE.");
  if (![3, 4].includes(s.digits)) throw new Error("Choose 3 or 4 digits.");
  const data = { departmentId: s.departmentId, program: s.program?.trim() || null, prefix, digits: s.digits, separator: s.separator === "-" ? "-" : s.separator === " " ? " " : "", effectiveTerm: s.effectiveTerm || null, effectiveYear: s.effectiveYear || null, setById: by, updatedAt: new Date() };
  const clash = (await cdb.courseCodeScheme.findMany({ where: { chairmanId, prefix } })) as Scheme[];
  if (clash.some((x) => x.id !== s.id && x.departmentId !== s.departmentId)) throw new Error(`${prefix} is already the prefix of another department.`);
  if (s.id) await cdb.courseCodeScheme.updateMany({ where: { id: s.id, chairmanId }, data });
  else await cdb.courseCodeScheme.create({ data: { id: randomUUID(), chairmanId, ...data } });
  await writeAuditLog({ actorUserId: by, action: "COURSE_CODE_SCHEME_SET", entityType: "Department", entityId: s.departmentId, metadata: { prefix, digits: s.digits } });
}
export const sample = (s: Pick<Scheme, "prefix" | "digits" | "separator">, year = 1, n = 1) => `${s.prefix}${s.separator}${year}${String(n).padStart(s.digits - 1, "0")}`;
const parse = (code: string, s: Scheme) => { const m = code.toUpperCase().replace(/\s+/g, "").match(new RegExp(`^${s.prefix}${s.separator === "-" ? "-?" : ""}(\\d)(\\d{${s.digits - 1}})L?$`)); return m ? { year: Number(m[1]), n: Number(m[2]) } : null; };

/** Proposed codes for one batch's courses. */
export async function proposeCodes(batchId: string) {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { degreeProgram: true, startTerm: true, startYear: true, coordinator: { select: { managedById: true, departmentId: true } } } });
  if (!b?.coordinator.managedById) return null;
  const cid = b.coordinator.managedById;
  const all = await schemes(cid);
  if (all === null) return null;
  const depts = new Map((await prisma.department.findMany({ where: { chairmanId: cid }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
  const intake = key(b.startTerm, b.startYear);
  const schemeFor = (dept: string | null) => {
    const xs = all.filter((s) => s.departmentId === dept && (!s.effectiveYear || key(s.effectiveTerm, s.effectiveYear) <= intake));
    return xs.find((s) => s.program && s.program.toLowerCase() === b.degreeProgram.toLowerCase()) || xs.find((s) => !s.program) || null;
  };
  const cs = await prisma.course.findMany({ where: { batchId }, select: { id: true, code: true, title: true, semesterNumber: true, courseType: true, subjectHomeDepartmentId: true }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] });
  // Codes already given in the institute under each system: the same course keeps its code everywhere.
  const inst = await prisma.course.findMany({ where: { coordinator: { managedById: cid }, NOT: { batchId } }, select: { code: true, title: true } });
  const used = new Set([...inst, ...cs].map((c) => c.code.toUpperCase()));
  const byTitle = new Map<string, string>();
  const out = cs.map((c) => {
    const home = c.subjectHomeDepartmentId || b.coordinator.departmentId;
    const s = schemeFor(home);
    const year = c.semesterNumber ? Math.ceil(c.semesterNumber / 2) : null;
    const base = { courseId: c.id, code: c.code, title: c.title, semester: c.semesterNumber, home: home ? depts.get(home) || "—" : "—", type: c.courseType };
    if (!s) return { ...base, proposed: null as string | null, why: "No code system for the home department yet" };
    if (!year) return { ...base, proposed: null, why: "Set the semester first — the first digit is the year" };
    if (/^domain /i.test(c.courseType)) return { ...base, proposed: null, why: "An option in a list — gets its code when it is offered" };
    const cur = parse(c.code, s);
    if (cur && cur.year === year) return { ...base, proposed: c.code, why: "Already follows the system" };
    const t = norm(c.title) + (isLabTitle(c.title) ? " lab" : "");
    const same = inst.find((x) => norm(x.title) + (isLabTitle(x.title) ? " lab" : "") === t && (() => { const p = parse(x.code, s); return p && p.year === year; })());
    if (same) { byTitle.set(t, same.code); return { ...base, proposed: same.code.toUpperCase(), why: "Same course already has this code in another program" }; }
    if (byTitle.has(t)) return { ...base, proposed: byTitle.get(t)!, why: "Same as another course in this batch" };
    let n = 1, code = "";
    do { code = sample(s, year, n++); } while (used.has(code) || used.has(`${code}L`));
    if (isLabTitle(c.title)) { const theory = byTitle.get(norm(c.title)); if (theory) code = `${theory}L`; }
    used.add(code); byTitle.set(t, code);
    return { ...base, proposed: code, why: cur ? `Year ${cur.year} code but semester ${c.semesterNumber} is year ${year}` : "New code" };
  });
  return { program: b.degreeProgram, rows: out, hasSchemes: all.length > 0 };
}

export async function applyCodes(by: string, batchId: string, picks: { courseId: string; code: string }[]) {
  let n = 0; const skipped: string[] = [];
  for (const p of picks) {
    const code = p.code.trim().toUpperCase().slice(0, 20);
    const c = await prisma.course.findFirst({ where: { id: p.courseId, batchId }, select: { id: true, code: true } });
    if (!c || !code || c.code === code) continue;
    const lock = await courseLock(c.id, "scheme");
    if (lock) { skipped.push(`${c.code}: set by the university`); continue; }
    if (await prisma.course.findFirst({ where: { batchId, code, id: { not: c.id } } })) { skipped.push(`${code} is already used in this batch`); continue; }
    await prisma.course.update({ where: { id: c.id }, data: { code } });
    n++;
  }
  await writeAuditLog({ actorUserId: by, action: "COURSE_CODES_APPLIED", entityType: "Batch", entityId: batchId, metadata: { changed: n, skipped: skipped.length } });
  return { n, skipped };
}
