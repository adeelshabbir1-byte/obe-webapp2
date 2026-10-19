import { prisma } from "./db";
import { loadMatrix, type MatrixUser } from "./assignerMatrix";
import { currentTerm, experienceMap, wishes } from "./autoAllocate";

// The whole academic year at once — Fall, Spring and Summer — before any course is offered:
//  • regular terms: every running batch's courses for the semester it will be in, plus the expected new intake on
//    today's curriculum (students = the average of recent intakes); sections = students / 50.
//  • summer: courses where 5 or more students still need to repeat (failed and not passed since).
//  • teachers proposed per term from priorities and times taught, within each teacher's load; what is left over is
//    the hiring need for the year.

const MAX_CLASS = 50, MIN_SUMMER = 5;
const PREF: Record<number, number> = { 1: 40, 2: 25, 3: 10 };
const regName = (i: number) => (i % 2 === 0 ? { name: "Fall", year: i / 2 } : { name: "Spring", year: (i + 1) / 2 });
const reg = (term: string, year: number) => (/fall/i.test(term) ? 2 * year : 2 * year - 1);
const FAIL = /^(F|FA|W|I)$/i;

export type YearRow = { code: string; title: string; batch: string; students: number; sections: number; projected: boolean; teachers: { name: string; n: number }[]; open: number };
export type YearTerm = { label: string; summer: boolean; rows: YearRow[]; loads: { name: string; n: number; cap: number }[]; open: number };

export async function yearAllocation(user: MatrixUser) {
  const m = await loadMatrix(user);
  const now = await currentTerm(m.coordinatorIds);
  const pool = m.instructors.filter((i) => !i.isVisiting && !i.outOfPool);
  const ids = pool.map((i) => i.id);
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: m.coordinatorIds.concat(["none"]) } }, select: { id: true, degreeProgram: true, batchName: true, startTerm: true, startYear: true, studentCount: true, _count: { select: { students: { where: { status: "ACTIVE" } } } } } });
  const regular = batches.filter((b) => /fall|spring/i.test(b.startTerm));
  const courses = await prisma.course.findMany({ where: { batchId: { in: regular.map((b) => b.id).concat(["none"]) }, semesterNumber: { not: null } }, select: { code: true, title: true, semesterNumber: true, batchId: true } });
  const startOf = new Map(regular.map((b) => [b.id, reg(b.startTerm, b.startYear)]));
  const size = (b: (typeof regular)[number]) => b._count.students || b.studentCount || 0;
  const maxSem = new Map<string, number>();
  for (const c of courses) maxSem.set(c.batchId!, Math.max(maxSem.get(c.batchId!) || 0, c.semesterNumber!));
  const byProgram = new Map<string, typeof regular>();
  for (const b of regular) byProgram.set(b.degreeProgram, [...(byProgram.get(b.degreeProgram) || []), b]);

  // The academic year: Fall, Spring, then Summer.
  const yearRegs = [now, now + 1];

  const demand = (T: number) => {
    const rows: Omit<YearRow, "teachers" | "open">[] = [];
    for (const b of regular) {
      const sem = T - startOf.get(b.id)! + 1;
      if (sem < 1 || sem > (maxSem.get(b.id) || 8)) continue;
      const n = size(b);
      for (const c of courses.filter((x) => x.batchId === b.id && x.semesterNumber === sem)) rows.push({ code: c.code, title: c.title, batch: `${b.degreeProgram} — ${b.batchName}`, students: n, sections: Math.max(1, Math.ceil(n / MAX_CLASS)), projected: false });
    }
    // Expected intake starting in T, on the newest batch's curriculum.
    for (const [prog, bs] of Array.from(byProgram.entries())) {
      if (bs.some((b) => startOf.get(b.id) === T)) continue;
      const sameSeason = bs.filter((b) => (startOf.get(b.id)! - T) % 2 === 0);
      if (!sameSeason.length || T < Math.max(...bs.map((b) => startOf.get(b.id)!))) continue;
      const newest = bs.slice().sort((a, b) => startOf.get(b.id)! - startOf.get(a.id)!)[0];
      const recent = sameSeason.slice().sort((a, b) => startOf.get(b.id)! - startOf.get(a.id)!).slice(0, 3);
      const n = Math.round(recent.reduce((a, b) => a + size(b), 0) / recent.length) || 40;
      const t = regName(T);
      for (const c of courses.filter((x) => x.batchId === newest.id && x.semesterNumber === 1)) rows.push({ code: c.code, title: c.title, batch: `${prog} — ${t.name} ${t.year} intake (expected)`, students: n, sections: Math.max(1, Math.ceil(n / MAX_CLASS)), projected: true });
    }
    return rows;
  };

  // Summer: repeats still outstanding.
  const students = await prisma.student.findMany({ where: { batchId: { in: regular.map((b) => b.id).concat(["none"]) }, status: "ACTIVE" }, select: { id: true } });
  const recs = await prisma.studentTranscriptRecord.findMany({ where: { studentId: { in: students.map((s) => s.id).concat(["none"]) } }, select: { studentId: true, courseCode: true, courseTitle: true, grade: true } });
  const passed = new Set(recs.filter((r) => !FAIL.test((r.grade || "").trim())).map((r) => `${r.studentId}|${r.courseCode.toUpperCase()}`));
  const need = new Map<string, { title: string; who: Set<string> }>();
  for (const r of recs) if (FAIL.test((r.grade || "").trim()) && !passed.has(`${r.studentId}|${r.courseCode.toUpperCase()}`)) { const k = r.courseCode.toUpperCase(); const x = need.get(k) || { title: r.courseTitle || "", who: new Set<string>() }; x.who.add(r.studentId); need.set(k, x); }
  const summerRows = Array.from(need.entries()).filter(([, x]) => x.who.size >= MIN_SUMMER).map(([code, x]) => ({ code, title: x.title, batch: "Repeaters (all batches)", students: x.who.size, sections: Math.ceil(x.who.size / MAX_CLASS), projected: true }));

  const allCodes = Array.from(new Set([...courses.map((c) => c.code), ...summerRows.map((r) => r.code)]));
  const [prefs, exp, wish] = await Promise.all([
    prisma.facultyCoursePreference.findMany({ where: { facultyId: { in: ids.concat(["none"]) }, courseCode: { in: allCodes.concat(["none"]) } }, select: { facultyId: true, courseCode: true, priority: true } }),
    experienceMap(user, m.coordinatorIds, ids), wishes(ids),
  ]);
  const pref = new Map(prefs.map((p) => [`${p.courseCode.toUpperCase()}|${p.facultyId}`, p.priority]));
  const score = (code: string, who: string) => {
    const p = pref.get(`${code.toUpperCase()}|${who}`);
    const e = exp[code]?.[who];
    const times = Math.max(e?.self || 0, e?.system || 0);
    return (p ? PREF[p] || 0 : 0) + Math.min(times, 5) * 4;
  };
  const allocate = (label: string, summer: boolean, rows: Omit<YearRow, "teachers" | "open">[]): YearTerm => {
    const cap = new Map(pool.map((i) => { const w = wish.get(i.id)?.maxSections; const base = w != null ? Math.min(w, i.normalLoad) : i.normalLoad; return [i.id, summer ? 2 : Math.max(0, base - i.externalLoadCount)]; }));
    const used = new Map<string, number>();
    const willing = (code: string) => pool.filter((i) => score(code, i.id) > 0).length;
    const out: YearRow[] = rows.map((r) => ({ ...r, teachers: [], open: 0 }));
    for (const r of out.slice().sort((a, b) => willing(a.code) - willing(b.code))) {
      for (let k = 0; k < r.sections; k++) {
        const pick = pool.filter((i) => (used.get(i.id) || 0) < (cap.get(i.id) || 0) && score(r.code, i.id) > 0).sort((a, b) => score(r.code, b.id) - score(r.code, a.id) || (used.get(a.id) || 0) - (used.get(b.id) || 0))[0];
        if (!pick) { r.open++; continue; }
        used.set(pick.id, (used.get(pick.id) || 0) + 1);
        const t = r.teachers.find((x) => x.name === pick.name);
        if (t) t.n++; else r.teachers.push({ name: pick.name, n: 1 });
      }
    }
    out.sort((a, b) => a.batch.localeCompare(b.batch) || a.code.localeCompare(b.code));
    return { label, summer, rows: out, loads: pool.map((i) => ({ name: i.name, n: used.get(i.id) || 0, cap: cap.get(i.id) || 0 })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)), open: out.reduce((a, r) => a + r.open, 0) };
  };
  const terms: YearTerm[] = [];
  for (const T of yearRegs) { const t = regName(T); terms.push(allocate(`${t.name} ${t.year}`, false, demand(T))); }
  const springYear = regName(yearRegs.find((x) => x % 2 === 1) ?? yearRegs[1]).year;
  terms.push(allocate(`Summer ${springYear}`, true, summerRows));
  // Hiring need for the year: the courses left open, most sections first.
  const openBy = new Map<string, { code: string; title: string; sections: number; terms: string[] }>();
  for (const t of terms) for (const r of t.rows) if (r.open) { const x = openBy.get(r.code) || { code: r.code, title: r.title, sections: 0, terms: [] }; x.sections += r.open; if (!x.terms.includes(t.label)) x.terms.push(t.label); openBy.set(r.code, x); }
  const avgLoad = pool.length ? pool.reduce((a, i) => a + i.normalLoad, 0) / pool.length : 3;
  const regularOpen = terms.filter((t) => !t.summer).map((t) => t.open);
  return { terms, hire: Array.from(openBy.values()).sort((a, b) => b.sections - a.sections), fteNeeded: Math.ceil(Math.max(0, ...regularOpen) / Math.max(1, Math.round(avgLoad))) };
}
