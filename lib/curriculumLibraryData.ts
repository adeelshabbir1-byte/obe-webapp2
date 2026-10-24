import { courseKeys } from "./curriculumEquivalence";
import { prisma } from "./db";
import { findOwningChairmanId } from "./institutionCurriculum";
import { countedCredits, countsTowardDegree } from "./courseTypes";
import { curriculaWhere, metaOf, propose, displayName, universityOf, ldb, type Meta } from "./curriculumLibrary";

type U = { id: string; role: string };
export const LIB_ROLES = ["SUPER_USER", "CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "OMC"];

/** Whose curricula this person sees: Super User all official ones and every institute's; others what their institute may use. */
export async function libraryScope(user: U) {
  if (user.role === "SUPER_USER") return { chairmanId: null as string | null, where: {} as Record<string, unknown>, superUser: true };
  // A Curriculum Builder (platform curriculum committee member) sees the official curricula.
  if (await (await import("./curriculumBuilder")).builderScope(user.id)) return { chairmanId: null as string | null, where: { chairmanId: null } as Record<string, unknown>, superUser: true };
  const cid = await findOwningChairmanId(user.id);
  return { chairmanId: cid, where: cid ? await curriculaWhere(cid) : { id: "none" }, superUser: false };
}

export type LibItem = Awaited<ReturnType<typeof libraryItems>>[number];
export async function libraryItems(user: U) {
  const sc = await libraryScope(user);
  const cs = await prisma.masterCurriculum.findMany({ where: sc.where, include: { _count: { select: { courses: true, plos: true, assignments: true, programCopies: true } } }, orderBy: [{ title: "asc" }, { version: "desc" }] });
  const meta = await metaOf(cs.map((c) => c.id));
  const owners = await prisma.user.findMany({ where: { id: { in: cs.map((c) => c.chairmanId).filter((x): x is string => !!x).concat("none") } }, select: { id: true, name: true, instituteName: true } });
  const ownerName = new Map(owners.map((o) => [o.id, o.instituteName || o.name]));
  const mcs = await prisma.masterCourse.findMany({ where: { masterCurriculumId: { in: cs.map((c) => c.id).concat("none") } }, select: { masterCurriculumId: true, creditHours: true, category: true } });
  const defs = ((await ldb.curriculumType.findMany({ where: { curriculumId: { in: cs.map((c) => c.id).concat("none") } }, select: { curriculumId: true, name: true, kind: true } }).catch(() => [])) as { curriculumId: string; name: string; kind: string }[]);
  const { kindInfo } = await import("./curriculumTemplates");
  const counts = (cid: string, cat: string) => { const ds = defs.filter((d) => d.curriculumId === cid); if (!ds.length) return countsTowardDegree(cat); const d = ds.find((x) => x.name === cat); return d ? kindInfo(d.kind).counts : false; };
  const chOf = new Map<string, number>(); for (const x of mcs) if (counts(x.masterCurriculumId, x.category)) chOf.set(x.masterCurriculumId, (chOf.get(x.masterCurriculumId) || 0) + x.creditHours);
  const used = await prisma.course.findMany({ where: { masterCourse: { masterCurriculumId: { in: cs.map((c) => c.id).concat("none") } } }, select: { batchId: true, masterCourse: { select: { masterCurriculumId: true } } }, distinct: ["batchId"] });
  const batches = new Map<string, number>(); used.forEach((u) => batches.set(u.masterCourse!.masterCurriculumId, (batches.get(u.masterCourse!.masterCurriculumId) || 0) + 1));
  const uni = sc.chairmanId ? await universityOf(sc.chairmanId) : null;
  return cs.map((c) => {
    const m = meta.get(c.id) || null; const p = propose(c, c.chairmanId ? ownerName.get(c.chairmanId) : null);
    const owner = c.chairmanId ? ownerName.get(c.chairmanId) || "Institute" : c.authority;
    return {
      id: c.id, title: c.title, authority: c.authority, version: c.version, status: c.status, chairmanId: c.chairmanId, parentId: c.parentCurriculumId,
      owner, kind: !c.chairmanId ? "Official" : c.chairmanId === uni ? "Your university's" : c.chairmanId === sc.chairmanId ? "Your institute's" : "Institute",
      code: m?.code || p.code, named: !!m, level: m?.level || p.level, programCode: m?.programCode || p.programCode, programName: m?.programName || p.programName,
      discipline: m?.discipline || p.discipline, notificationNo: m?.notificationNo || c.sourceReference || null, effective: m?.effectiveYear ? `${m.effectiveTerm || ""} ${m.effectiveYear}`.trim() : null,
      locks: m ? { scheme: m.lockScheme, ga: m.lockGa, clo: m.lockClo } : { scheme: true, ga: true, clo: true },
      name: displayName(c, m || p, c.chairmanId ? ownerName.get(c.chairmanId) : null),
      courses: c._count.courses, gas: c._count.plos, credits: chOf.get(c.id) || 0, institutes: c._count.assignments, copies: c._count.programCopies, batches: batches.get(c.id) || 0,
    };
  });
}

/** May this person rename / set the fields of this curriculum? Super User: official ones; the owning institute: its own. */
export async function canEditMeta(user: U, c: { chairmanId: string | null }) {
  if (user.role === "SUPER_USER") return true;
  if (!c.chairmanId && (await (await import("./curriculumBuilder")).builderScope(user.id))) return true;
  if (!c.chairmanId || !["CHAIRMAN", "DEAN", "OMC"].includes(user.role)) return false;
  return (await findOwningChairmanId(user.id)) === c.chairmanId;
}

export async function curriculumDetail(id: string) {
  const c = await prisma.masterCurriculum.findUnique({ where: { id }, include: { courses: { orderBy: [{ semesterNumber: "asc" }, { code: "asc" }], select: { id: true, code: true, title: true, creditHours: true, category: true, semesterNumber: true, _count: { select: { seedClos: true } } } }, plos: { orderBy: { number: "asc" } }, parentCurriculum: { select: { id: true, title: true, version: true } }, programCopies: { select: { id: true, title: true, version: true, chairmanId: true } }, assignments: { select: { chairmanId: true } } } });
  if (!c) return null;
  const meta = (await metaOf([id])).get(id) || null;
  const ids = [c.chairmanId, ...c.programCopies.map((p) => p.chairmanId), ...c.assignments.map((a) => a.chairmanId)].filter((x): x is string => !!x);
  const heads = new Map((await prisma.user.findMany({ where: { id: { in: ids.concat("none") } }, select: { id: true, name: true, instituteName: true } })).map((h) => [h.id, h.instituteName || h.name]));
  const usedBy = await prisma.course.findMany({ where: { masterCourse: { masterCurriculumId: id } }, select: { batch: { select: { id: true, degreeProgram: true, batchName: true, coordinator: { select: { managedById: true } } } } }, distinct: ["batchId"] });
  const bHeads = new Map((await prisma.user.findMany({ where: { id: { in: usedBy.map((u) => u.batch?.coordinator.managedById || "none") } }, select: { id: true, name: true, instituteName: true } })).map((h) => [h.id, h.instituteName || h.name]));
  const colleges = c.chairmanId ? ((await ldb.instituteAffiliation.findMany({ where: { universityId: c.chairmanId, status: "ACTIVE" } }).catch(() => [])) as { collegeId: string }[]) : [];
  const cNames = new Map((await prisma.user.findMany({ where: { id: { in: colleges.map((x) => x.collegeId).concat("none") } }, select: { id: true, name: true, instituteName: true } })).map((h) => [h.id, h.instituteName || h.name]));
  // Other versions of the same program (by standard code fields, else by title).
  const siblings = meta?.programCode
    ? ((await ldb.curriculumMeta.findMany({ where: { programCode: meta.programCode, level: meta.level, curriculumId: { not: id } } })) as Meta[]).map((x) => x.curriculumId)
    : (await prisma.masterCurriculum.findMany({ where: { title: c.title, id: { not: id } }, select: { id: true } })).map((x) => x.id);
  const versions = await prisma.masterCurriculum.findMany({ where: { id: { in: siblings.concat("none") }, chairmanId: c.chairmanId }, select: { id: true, title: true, version: true, status: true } });
  return {
    c, meta, owner: c.chairmanId ? heads.get(c.chairmanId) || "Institute" : c.authority,
    copies: c.programCopies.map((p) => ({ ...p, owner: p.chairmanId ? heads.get(p.chairmanId) || "Institute" : "" })),
    assigned: c.assignments.map((a) => heads.get(a.chairmanId) || "Institute"),
    batches: usedBy.filter((u) => u.batch).map((u) => ({ id: u.batch!.id, label: `${u.batch!.degreeProgram} — ${u.batch!.batchName}`, institute: bHeads.get(u.batch!.coordinator.managedById || "") || "" })),
    colleges: colleges.map((x) => cNames.get(x.collegeId) || "College"),
    versions,
  };
}

/** Courses of two curricula side by side: added, removed, changed. Matched by code, then by title. */
export async function compareCurricula(a: string, b: string) {
  const [A, B] = await Promise.all([a, b].map((id) => prisma.masterCurriculum.findUnique({ where: { id }, select: { id: true, title: true, version: true, authority: true, courses: { select: { code: true, title: true, creditHours: true, semesterNumber: true, category: true } } } })));
  if (!A || !B) return null;
  const key = (x: { title: string }) => x.title.toLowerCase().replace(/[^a-z0-9]/g, "");
  const rows: { code: string; title: string; a: { ch: number; sem: number | null; title: string; code: string } | null; b: { ch: number; sem: number | null; title: string; code: string } | null; change: string }[] = [];
  const usedB = new Set<number>();
  // Versions of one curriculum match on code or title; different curricula (PU vs HEC, …) through course equivalences.
  const sameLine = A.authority === B.authority;
  const kb = B.courses.map((y) => courseKeys(y.title));
  const find = (x: { code: string; title: string }) => {
    const j = B.courses.findIndex((y, i) => !usedB.has(i) && ((sameLine && y.code === x.code) || key(y) === key(x)));
    if (j >= 0) return j;
    for (const k of courseKeys(x.title)) { const i = kb.findIndex((ks, n) => !usedB.has(n) && ks.includes(k)); if (i >= 0) return i; }
    return -1;
  };
  for (const x of A.courses) {
    const j = find(x);
    if (j < 0) { rows.push({ code: x.code, title: x.title + (countsTowardDegree(x.category) ? "" : " (option list)"), a: { ch: x.creditHours, sem: x.semesterNumber, title: x.title, code: x.code }, b: null, change: "Removed" }); continue; }
    usedB.add(j); const y = B.courses[j];
    const ch = [x.creditHours !== y.creditHours ? `credit hours ${x.creditHours} → ${y.creditHours}` : "", x.semesterNumber !== y.semesterNumber ? `semester ${x.semesterNumber ?? "—"} → ${y.semesterNumber ?? "—"}` : "", sameLine && x.code !== y.code ? `code ${x.code} → ${y.code}` : "", key(x) !== key(y) ? (sameLine ? "title changed" : "equivalent") : ""].filter(Boolean).join(", ");
    rows.push({ code: y.code, title: y.title, a: { ch: x.creditHours, sem: x.semesterNumber, title: x.title, code: x.code }, b: { ch: y.creditHours, sem: y.semesterNumber, title: y.title, code: y.code }, change: ch || "Same" });
  }
  B.courses.forEach((y, i) => { if (!usedB.has(i)) rows.push({ code: y.code, title: y.title + (countsTowardDegree(y.category) ? "" : " (option list)"), a: null, b: { ch: y.creditHours, sem: y.semesterNumber, title: y.title, code: y.code }, change: "Added" }); });
  const order = { Added: 0, Removed: 1 } as Record<string, number>;
  rows.sort((p, q) => (order[p.change] ?? (p.change === "Same" ? 3 : 2)) - (order[q.change] ?? (q.change === "Same" ? 3 : 2)) || p.code.localeCompare(q.code));
  const sum = (xs: { creditHours: number; category: string }[]) => countedCredits(xs);
  return { A, B, rows, sameLine, totals: { a: sum(A.courses), b: sum(B.courses) } };
}
