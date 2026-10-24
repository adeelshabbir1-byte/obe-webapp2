import { prisma } from "./db";
import { writeAuditLog } from "./audit";

// Curriculum library: a standard code for every curriculum (AUTHORITY-LEVEL-PROGRAM-YEAR, e.g. NCEAC-BS-CS-2023; an
// institute's own copy or its own curriculum adds the owner: PU-BS-CS-2027), filter fields, an "effective from" term,
// and affiliated colleges. A college affiliated to a university sees the university's own curricula and must follow
// them: the scheme of studies, the GAs and (when given) the CLOs are locked for the college; a new version that the
// university makes effective from, say, Fall 2027 applies to the college's batches that start in Fall 2027 or later.

export const ldb = prisma as unknown as Record<string, any>;
export const LIB_HINT = "The curriculum library needs prisma/migration_curriculum_library.sql — run it in Supabase.";

export const LEVELS: [string, string][] = [["ADP", "Associate degree (2 years)"], ["BS", "BS (4 years)"], ["BE", "BE / BSc Engineering"], ["BBA", "BBA (4 years)"], ["BSc", "BSc (2 years)"], ["MS", "MS / MPhil"], ["PhD", "PhD"]];
export const DISCIPLINES = ["Computing", "Engineering", "Business", "Sciences", "Social Sciences", "Arts & Humanities", "Health", "Agriculture", "Education", "Other"];
// Standard program codes: [code, name, discipline, words that identify it in a title].
export const PROGRAMS: [string, string, string, RegExp][] = [
  ["CS", "Computer Science", "Computing", /computer science|\bcs\b|bscs/i], ["SE", "Software Engineering", "Computing", /software eng|\bse\b|bsse/i],
  ["AI", "Artificial Intelligence", "Computing", /artificial intel|\bai\b/i], ["DS", "Data Science", "Computing", /data science|\bds\b/i],
  ["CYS", "Cyber Security", "Computing", /cyber/i], ["IT", "Information Technology", "Computing", /information tech|\bit\b|bsit/i],
  ["CE", "Computer Engineering", "Engineering", /computer eng/i], ["EE", "Electrical Engineering", "Engineering", /electrical/i],
  ["ME", "Mechanical Engineering", "Engineering", /mechanical/i], ["CIV", "Civil Engineering", "Engineering", /civil/i],
  ["CHE", "Chemical Engineering", "Engineering", /chemical eng/i], ["BBA", "Business Administration", "Business", /business admin|\bbba\b/i],
  ["ACF", "Accounting and Finance", "Business", /accounting|finance/i], ["ECO", "Economics", "Social Sciences", /economics/i],
  ["MTH", "Mathematics", "Sciences", /mathematic/i], ["PHY", "Physics", "Sciences", /physics/i], ["CHM", "Chemistry", "Sciences", /chemistry/i],
  ["ENG", "English", "Arts & Humanities", /english/i], ["PSY", "Psychology", "Social Sciences", /psycholog/i], ["EDU", "Education", "Education", /education\b/i],
];
export const TERMS = ["Spring", "Summer", "Fall"];

export type Meta = { curriculumId: string; code: string; discipline: string | null; level: string | null; programCode: string | null; programName: string | null; notificationNo: string | null; effectiveTerm: string | null; effectiveYear: number | null; lockScheme: boolean; lockGa: boolean; lockClo: boolean; aliasesJson: string };
type Cur = { id: string; authority: string; title: string; version: string; degreeProgram?: string | null; chairmanId: string | null; sourceReference?: string | null; parentCurriculumId?: string | null };

const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "");
/** The owner's short code: an institute's short name (from its name's initials) or the authority for an official one. */
export function ownerCode(name: string) {
  const words = name.replace(/\(.*?\)/g, " ").split(/[\s,.-]+/).filter((w) => w && !/^(of|the|and|for|&)$/i.test(w));
  const ac = words.map((w) => w[0]).join("").toUpperCase();
  return ac.length >= 2 ? ac.slice(0, 8) : clean(name).slice(0, 8);
}
/** A proposed code and fields for a curriculum, guessed from its title, authority and version. */
export function propose(c: Cur, ownerName?: string | null) {
  const t = `${c.degreeProgram || ""} ${c.title}`;
  const level = /\bADP\b|associate/i.test(t) ? "ADP" : /\bBBA\b/i.test(t) ? "BBA" : /\bB\.?E\b|BSc Eng|engineering/i.test(t) && !/software/i.test(t) ? "BE" : /\bM\.?S\b|MPhil|master/i.test(t) ? "MS" : /\bPh\.?D/i.test(t) ? "PhD" : "BS";
  const prog = PROGRAMS.find((p) => p[3].test(t));
  const year = (c.version.match(/(19|20)\d\d/) || [])[0] || clean(c.version).slice(0, 6) || "V1";
  const owner = c.chairmanId ? ownerCode(ownerName || "INST") : clean(c.authority) || "HEC";
  const pc = prog ? prog[0] : clean(c.title).slice(0, 5);
  const code = [owner, level === "BBA" && pc === "BBA" ? "BBA" : `${level}-${pc}`, year].join("-");
  return { code, level, programCode: pc, programName: prog ? prog[1] : c.title, discipline: prog ? prog[2] : "Other", notificationNo: c.sourceReference || null };
}
/** "BS Computer Science — NCEAC 2023 (official)" */
export function displayName(c: Cur, m: Partial<Meta> | null, ownerName?: string | null) {
  const prog = m?.programName ? `${m.level && m.level !== "BBA" ? `${m.level} ` : ""}${m.programName}` : c.title;
  return `${prog} — ${c.chairmanId ? (ownerName || "institute") : c.authority} ${c.version}${c.chairmanId ? "" : " (official)"}`;
}

export async function metaOf(ids: string[]) {
  const rows = (await ldb.curriculumMeta.findMany({ where: { curriculumId: { in: ids.concat("none") } } }).catch(() => [])) as Meta[];
  return new Map(rows.map((r) => [r.curriculumId, r]));
}
export async function saveMeta(id: string, by: string, m: Partial<Meta>) {
  const cur = (await ldb.curriculumMeta.findUnique({ where: { curriculumId: id } }).catch(() => null)) as Meta | null;
  const data = {
    code: String(m.code ?? cur?.code ?? "").toUpperCase().replace(/[^A-Z0-9-]+/g, "").slice(0, 40), discipline: m.discipline ?? cur?.discipline ?? null, level: m.level ?? cur?.level ?? null,
    programCode: m.programCode ? clean(m.programCode).slice(0, 8) : cur?.programCode ?? null, programName: m.programName ?? cur?.programName ?? null, notificationNo: m.notificationNo ?? cur?.notificationNo ?? null,
    effectiveTerm: m.effectiveTerm !== undefined ? m.effectiveTerm || null : cur?.effectiveTerm ?? null, effectiveYear: m.effectiveYear !== undefined ? m.effectiveYear || null : cur?.effectiveYear ?? null,
    lockScheme: m.lockScheme ?? cur?.lockScheme ?? true, lockGa: m.lockGa ?? cur?.lockGa ?? true, lockClo: m.lockClo ?? cur?.lockClo ?? true,
    aliasesJson: m.aliasesJson ?? cur?.aliasesJson ?? "[]", updatedById: by, updatedAt: new Date(),
  };
  if (!data.code) throw new Error("Give the curriculum a code.");
  await ldb.curriculumMeta.upsert({ where: { curriculumId: id }, create: { curriculumId: id, ...data }, update: data });
  return data;
}

// ---------------- Affiliation
export async function universityOf(collegeId: string | null | undefined): Promise<string | null> {
  if (!collegeId) return null;
  const r = (await ldb.instituteAffiliation.findUnique({ where: { collegeId } }).catch(() => null)) as { universityId: string; status: string } | null;
  return r && r.status === "ACTIVE" ? r.universityId : null;
}
export async function collegesOf(universityId: string) {
  const rows = (await ldb.instituteAffiliation.findMany({ where: { universityId } }).catch(() => [])) as { collegeId: string; status: string; since: Date | null; note: string | null }[];
  const heads = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.collegeId).concat("none") } }, select: { id: true, name: true, instituteName: true, email: true } });
  return rows.map((r) => ({ ...r, head: heads.find((h) => h.id === r.collegeId) || null }));
}
export async function setAffiliation(by: string, collegeId: string, universityId: string | null, note = "") {
  if (!universityId) { await ldb.instituteAffiliation.deleteMany({ where: { collegeId } }); await writeAuditLog({ actorUserId: by, action: "AFFILIATION_ENDED", entityType: "User", entityId: collegeId }); return; }
  if (collegeId === universityId) throw new Error("An institute cannot be affiliated to itself.");
  if (await universityOf(universityId)) throw new Error("That university is itself an affiliated college.");
  await ldb.instituteAffiliation.upsert({ where: { collegeId }, create: { collegeId, universityId, since: new Date(), note: note || null, createdById: by }, update: { universityId, status: "ACTIVE", note: note || null } });
  await writeAuditLog({ actorUserId: by, action: "AFFILIATION_SET", entityType: "User", entityId: collegeId, metadata: { universityId } });
}

// ---------------- Visibility
/** Curricula an institute may import from: its own, official ones assigned to it, and its university's (if a college). */
export async function curriculaWhere(chairmanId: string) {
  const uni = await universityOf(chairmanId);
  return { OR: [{ chairmanId }, { chairmanId: null, assignments: { some: { chairmanId } } }, ...(uni ? [{ chairmanId: uni, status: "PUBLISHED" }] : [])] };
}
export async function canUseCurriculum(c: { id: string; chairmanId: string | null }, chairmanId: string | null | undefined) {
  if (!chairmanId) return false;
  if (c.chairmanId === chairmanId) return true;
  if (c.chairmanId === null) return !!(await prisma.curriculumAssignment.findUnique({ where: { curriculumId_chairmanId: { curriculumId: c.id, chairmanId } } }));
  return c.chairmanId === (await universityOf(chairmanId));
}

// ---------------- Locks for affiliated colleges
async function lockFor(chairmanId: string | null | undefined, curriculumIds: string[]) {
  const uni = await universityOf(chairmanId);
  if (!uni || !curriculumIds.length) return null;
  const cs = await prisma.masterCurriculum.findMany({ where: { id: { in: curriculumIds }, chairmanId: uni }, select: { id: true, title: true, version: true } });
  if (!cs.length) return null;
  const m = await metaOf(cs.map((c) => c.id));
  const head = await prisma.user.findUnique({ where: { id: uni }, select: { instituteName: true, name: true } });
  const c = cs[0]; const mm = m.get(c.id);
  return { university: head?.instituteName || head?.name || "the university", name: `${c.title} ${c.version}`, scheme: mm?.lockScheme ?? true, ga: mm?.lockGa ?? true, clo: mm?.lockClo ?? true };
}
const msg = (l: { university: string; name: string }, what: string) => `${what} is set by ${l.university} (${l.name}); affiliated colleges follow it as it is. Ask the university to change it.`;

/** A message when this course's scheme entry (code, title, credit hours, semester, prerequisite) or CLOs are locked. */
export async function courseLock(courseId: string, part: "scheme" | "clo"): Promise<string | null> {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { coordinator: { select: { managedById: true } }, masterCourse: { select: { masterCurriculumId: true } } } }).catch(() => null);
  if (!c?.masterCourse) return null;
  const l = await lockFor(c.coordinator.managedById, [c.masterCourse.masterCurriculumId]);
  if (!l) return null;
  if (part === "scheme" && l.scheme) return msg(l, "This course's place in the scheme of studies");
  if (part === "clo" && l.clo) return msg(l, "The CLOs of this course are");
  return null;
}
/** A message when the batch follows a university curriculum whose scheme (adding courses) or GAs are locked. */
export async function batchLock(batchId: string, part: "scheme" | "ga"): Promise<string | null> {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { coordinator: { select: { managedById: true } } } }).catch(() => null);
  if (!b) return null;
  const mc = await prisma.course.findMany({ where: { batchId, masterCourseId: { not: null } }, select: { masterCourse: { select: { masterCurriculumId: true } } }, take: 200 });
  const l = await lockFor(b.coordinator.managedById, Array.from(new Set(mc.map((x) => x.masterCourse!.masterCurriculumId))));
  if (!l) return null;
  if (part === "scheme" && l.scheme) return msg(l, "The scheme of studies of this batch");
  if (part === "ga" && l.ga) return msg(l, "The graduate attributes (GAs) of this batch are");
  return null;
}

/** For a college batch: the university's version of this program that applies from the batch's intake term. */
export async function versionForIntake(chairmanId: string, chosen: { id: string; chairmanId: string | null }, startTerm: string, startYear: number) {
  const uni = await universityOf(chairmanId);
  if (!uni || chosen.chairmanId !== uni) return null;
  const m = (await metaOf([chosen.id])).get(chosen.id);
  if (!m?.programCode) return null;
  const sameProg = (await ldb.curriculumMeta.findMany({ where: { programCode: m.programCode, level: m.level } })) as Meta[];
  const cands = await prisma.masterCurriculum.findMany({ where: { id: { in: sameProg.map((x) => x.curriculumId) }, chairmanId: uni, status: "PUBLISHED" }, select: { id: true, title: true, version: true } });
  const key = (t: string | null, y: number | null) => (y || 0) * 10 + Math.max(0, TERMS.indexOf(t || "Spring"));
  const intake = key(startTerm, startYear);
  const applies = cands.map((c) => ({ ...c, m: sameProg.find((x) => x.curriculumId === c.id)! })).filter((c) => !c.m.effectiveYear || key(c.m.effectiveTerm, c.m.effectiveYear) <= intake).sort((a, b) => key(b.m.effectiveTerm, b.m.effectiveYear) - key(a.m.effectiveTerm, a.m.effectiveYear))[0];
  return applies && applies.id !== chosen.id ? `Batches starting ${startTerm} ${startYear} follow ${applies.title} ${applies.version}${applies.m.effectiveYear ? ` (effective from ${applies.m.effectiveTerm || ""} ${applies.m.effectiveYear})` : ""}.` : null;
}

/** Tell a university's colleges that a curriculum version takes effect. */
export async function announceVersion(universityId: string, curriculum: { title: string; version: string }, term: string | null, year: number | null) {
  const cols = await collegesOf(universityId);
  if (!cols.length) return 0;
  const leads = await prisma.user.findMany({ where: { OR: [{ id: { in: cols.map((c) => c.collegeId) } }, { managedById: { in: cols.map((c) => c.collegeId) }, role: { in: ["PROGRAM_COORDINATOR", "DEAN", "HEAD_OF_DEPARTMENT"] } }] }, select: { id: true } });
  const { notifyUsers } = await import("./notifications");
  await notifyUsers(leads.map((l) => l.id), { kind: "CURRICULUM", title: `New curriculum: ${curriculum.title} ${curriculum.version}`, body: term && year ? `Applies to batches starting ${term} ${year} onward. Earlier batches keep their curriculum.` : "Published by your university.", href: "/curricula" });
  return leads.length;
}
