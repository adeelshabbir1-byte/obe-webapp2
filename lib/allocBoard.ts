import { randomUUID } from "crypto";
import { prisma } from "./db";
import { loadMatrix, type MatrixUser } from "./assignerMatrix";

// Allocation preferences board (Adeel prompt §25.2–6, 14): each course with the teachers interested in it (rank,
// sections and times they picked, load, times taught, points) marked uncontested / contested; each teacher with his
// courses; subject areas from the teachers' and courses' categories; HOD rules; and the fairness report.
const db = prisma as unknown as Record<string, any>;
export type Interest = { id: string; name: string; rank: number; sections: string | null; times: string | null; taught: number; load: number; cap: number; points: number; category: string | null; rule?: string };
export type CourseLine = { code: string; title: string; category: string | null; specialisation: boolean; sections: number; interested: Interest[]; state: "UNCONTESTED" | "CONTESTED" | "NOBODY"; ruleNotes: string[] };

export async function board(user: MatrixUser, chairmanId: string) {
  const m = await loadMatrix(user) as unknown as { instructors: { id: string; name: string; normalLoad: number; isVisiting?: boolean; customCategoryName?: string | null }[]; rows: { code: string; title: string; courseType?: string; sectionsNeeded?: number; customCategoryName?: string | null }[] };
  const teachers = (m.instructors || []).filter((t) => !t.isVisiting);
  const ids = teachers.map((t) => t.id);
  const [prefs, details, rules, taughtRows, cats] = await Promise.all([
    prisma.facultyCoursePreference.findMany({ where: { facultyId: { in: ids.concat("none") } } }),
    (db.allocPrefDetail?.findMany({ where: { facultyId: { in: ids.concat("none") } } }).catch(() => []) || []) as Promise<{ facultyId: string; courseCode: string; sections: string | null; times: string | null }[]>,
    (db.allocRule?.findMany({ where: { chairmanId } }).catch(() => []) || []) as Promise<{ id: string; kind: string; facultyId: string | null; courseCode: string | null; n: number | null; reason: string | null }[]>,
    prisma.course.groupBy({ by: ["instructorId", "code"], where: { instructorId: { in: ids.concat("none") } }, _count: { _all: true } }).catch(() => []),
    prisma.user.findMany({ where: { id: { in: ids.concat("none") } }, select: { id: true, customCategory: { select: { name: true } } } }).catch(() => []),
  ]);
  const catOf = new Map((cats as { id: string; customCategory: { name: string } | null }[]).map((c) => [c.id, c.customCategory?.name || null]));
  const taught = new Map((taughtRows as { instructorId: string | null; code: string; _count: { _all: number } }[]).map((t) => [`${t.instructorId}|${t.code.toUpperCase()}`, t._count._all]));
  const load = new Map<string, number>();
  const courses = await prisma.course.findMany({ where: { isOffered: true, coordinator: { managedById: chairmanId } }, select: { code: true, title: true, courseType: true, customCategory: { select: { name: true } }, sectionAssignments: { select: { instructorId: true, sectionCount: true } }, instructorId: true } });
  for (const c of courses) { for (const a of c.sectionAssignments) load.set(a.instructorId, (load.get(a.instructorId) || 0) + a.sectionCount); if (!c.sectionAssignments.length && c.instructorId) load.set(c.instructorId, (load.get(c.instructorId) || 0) + 1); }
  const det = new Map(details.map((d) => [`${d.facultyId}|${d.courseCode.toUpperCase()}`, d]));
  const byCode = new Map<string, { code: string; title: string; category: string | null; specialisation: boolean; sections: number }>();
  for (const c of courses) { const k = c.code.toUpperCase(); const o = byCode.get(k) || { code: c.code, title: c.title, category: c.customCategory?.name || null, specialisation: /elective|speciali/i.test(c.courseType), sections: 0 }; o.sections += Math.max(1, c.sectionAssignments.reduce((a, x) => a + x.sectionCount, 0)); byCode.set(k, o); }
  for (const p of prefs) if (!byCode.has(p.courseCode.toUpperCase())) byCode.set(p.courseCode.toUpperCase(), { code: p.courseCode, title: p.courseCode, category: null, specialisation: false, sections: 1 });
  const lines: CourseLine[] = [];
  for (const [k, c] of Array.from(byCode.entries())) {
    const interested: Interest[] = prefs.filter((p) => p.courseCode.toUpperCase() === k).map((p) => {
      const t = teachers.find((x) => x.id === p.facultyId);
      const d = det.get(`${p.facultyId}|${k}`);
      const n = taught.get(`${p.facultyId}|${k}`) || 0;
      const ld = load.get(p.facultyId) || 0, cap = t?.normalLoad || 3;
      const cat = catOf.get(p.facultyId) || null;
      const spec = c.specialisation && c.category && cat !== c.category ? "no specialisation match" : undefined;
      const points = (4 - Math.min(3, p.priority)) * 10 + Math.min(n, 5) * 4 + (c.category && cat === c.category ? 10 : 0) - Math.max(0, ld - cap) * 5;
      return { id: p.facultyId, name: t?.name || "teacher", rank: p.priority, sections: d?.sections || null, times: d?.times || null, taught: n, load: ld, cap, points, category: cat, rule: spec };
    }).sort((a, b) => b.points - a.points);
    const ruleNotes = rules.filter((r) => r.courseCode && r.courseCode.toUpperCase() === k).map((r) => `${r.kind === "MUST" ? "Must teach" : "Must not teach"}: ${teachers.find((t) => t.id === r.facultyId)?.name || "?"}${r.reason ? ` (${r.reason})` : ""}`);
    for (const i of interested) { const bad = rules.find((r) => r.kind === "MUST_NOT" && r.facultyId === i.id && r.courseCode?.toUpperCase() === k); if (bad) i.rule = "HOD rule: must not teach"; }
    const ok = interested.filter((i) => !i.rule);
    lines.push({ ...c, interested, state: ok.length === 0 ? "NOBODY" : ok.length === 1 ? "UNCONTESTED" : "CONTESTED", ruleNotes });
  }
  const maxNew = rules.find((r) => r.kind === "MAX_NEW")?.n ?? 1;
  return { lines: lines.sort((a, b) => a.code.localeCompare(b.code)), teachers: teachers.map((t) => ({ id: t.id, name: t.name, category: catOf.get(t.id) || null, load: load.get(t.id) || 0, cap: t.normalLoad, courses: prefs.filter((p) => p.facultyId === t.id).sort((a, b) => a.priority - b.priority).map((p) => p.courseCode) })), rules, maxNew, categories: Array.from(new Set([...Array.from(catOf.values()), ...lines.map((l) => l.category)].filter((x): x is string => !!x))).sort() };
}

export async function savePrefDetail(facultyId: string, courseCode: string, sections: string, times: string) {
  if (!db.allocPrefDetail) throw new Error("Run prisma/migration_adeel_p8.sql in Supabase first.");
  await db.allocPrefDetail.upsert({ where: { facultyId_courseCode: { facultyId, courseCode } }, create: { facultyId, courseCode, sections: sections.slice(0, 200) || null, times: times.slice(0, 200) || null }, update: { sections: sections.slice(0, 200) || null, times: times.slice(0, 200) || null, updatedAt: new Date() } });
}
export async function addRule(byId: string, chairmanId: string, r: { kind: string; facultyId?: string; courseCode?: string; n?: number; reason?: string }) {
  if (!["MUST", "MUST_NOT", "MAX_NEW"].includes(r.kind)) throw new Error("Unknown rule.");
  await db.allocRule.create({ data: { id: randomUUID(), chairmanId, kind: r.kind, facultyId: r.facultyId || null, courseCode: r.courseCode || null, n: r.n ?? null, reason: r.reason || null, byId } });
}
export async function removeRule(chairmanId: string, id: string) { await db.allocRule.deleteMany({ where: { id, chairmanId } }); }

/** Fairness (§25.14): per teacher over the last terms — sections, different courses, repeats, large classes. */
export async function fairness(chairmanId: string) {
  const rows = await prisma.course.findMany({ where: { coordinator: { managedById: chairmanId }, offeredTermYear: { not: null } }, select: { code: true, offeredTermName: true, offeredTermYear: true, instructorId: true, instructor: { select: { name: true } }, _count: { select: { studentEnrollments: true } } }, take: 5000 });
  const by = new Map<string, { name: string; sections: number; courses: Set<string>; repeats: number; large: number; terms: Set<string> }>();
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (!r.instructorId) continue;
    const o = by.get(r.instructorId) || { name: r.instructor?.name || "", sections: 0, courses: new Set<string>(), repeats: 0, large: 0, terms: new Set<string>() };
    o.sections++; o.terms.add(`${r.offeredTermName} ${r.offeredTermYear}`);
    const k = `${r.instructorId}|${r.code}`; seen.set(k, (seen.get(k) || 0) + 1); if (seen.get(k)! > 1) o.repeats++;
    o.courses.add(r.code); if (r._count.studentEnrollments > 45) o.large++;
    by.set(r.instructorId, o);
  }
  return Array.from(by.values()).map((o) => ({ name: o.name, sections: o.sections, courses: o.courses.size, repeats: o.repeats, large: o.large, terms: o.terms.size, perTerm: Math.round((10 * o.sections) / Math.max(1, o.terms.size)) / 10 })).sort((a, b) => b.perTerm - a.perTerm);
}
