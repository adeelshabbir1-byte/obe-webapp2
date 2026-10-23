import { randomUUID } from "crypto";
import { prisma } from "./db";
import { termIndex } from "./termLogic";
import { loadMatrix, type MatrixRow, type MatrixUser } from "./assignerMatrix";
import { isHeadFaculty } from "./departments";
import { writeAuditLog } from "./audit";

// Suggested course allocation for the Course Assigner. For every offered course (or combined class) and every section
// still to be given, it weighs each teacher on:
//   • their stated priority for the course (1 top, 2 good, 3 fifty-fifty)
//   • how many times they have taught it — what they told us, or what OBEHUB has on record, whichever is more
//   • whether they taught it last semester, and in the same term last year (continuity)
//   • fewer different preparations: a teacher who already has a section of the course is preferred for the next one
// and fills courses in order of how few willing teachers they have, never past a teacher's load (their wished number of
// sections this semester if they gave one, else their normal load, less outside load). Sections nobody can take go to
// "Visiting Faculty (to be decided)". The assigner reviews the suggestion, applies what they like and edits the matrix.

const xdb = prisma as unknown as Record<string, any>;
export const ALLOC_HINT = "Times-taught and load wishes need prisma/migration_allocation.sql — run it in Supabase.";

export type Wish = { maxSections: number | null; remarks: string; updatedAt: string };
export type Exp = { self: number | null; system: number; prev: boolean; lastYear: boolean };

const termOf = (i: number) => (i % 2 === 0 ? { name: "Fall", year: i / 2 } : { name: "Spring", year: (i + 1) / 2 });
const codeOfLabel = (label: string) => label.split(" — ")[0].trim();

/* ---------------- Faculty inputs ---------------- */

export async function selfExperience(facultyIds: string[]): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  try {
    const rows = (await xdb.facultyCourseExperience.findMany({ where: { facultyId: { in: facultyIds.concat(["none"]) } } })) as { facultyId: string; courseCode: string; timesTaught: number }[];
    for (const r of rows) { if (!out.has(r.facultyId)) out.set(r.facultyId, new Map()); out.get(r.facultyId)!.set(r.courseCode, r.timesTaught); }
  } catch { /* not migrated */ }
  return out;
}

export async function wishes(facultyIds: string[]): Promise<Map<string, Wish>> {
  try {
    const rows = (await xdb.facultyAllocationWish.findMany({ where: { facultyId: { in: facultyIds.concat(["none"]) } } })) as { facultyId: string; maxSections: number | null; remarks: string | null; updatedAt: Date }[];
    return new Map(rows.map((r) => [r.facultyId, { maxSections: r.maxSections, remarks: r.remarks || "", updatedAt: new Date(r.updatedAt).toISOString().slice(0, 10) }]));
  } catch { return new Map(); }
}

export async function saveTimesTaught(facultyId: string, courseCode: string, n: number | null) {
  if (n === null) { await xdb.facultyCourseExperience.deleteMany({ where: { facultyId, courseCode } }); return; }
  await xdb.facultyCourseExperience.upsert({
    where: { facultyId_courseCode: { facultyId, courseCode } },
    create: { id: randomUUID(), facultyId, courseCode, timesTaught: n, updatedAt: new Date() },
    update: { timesTaught: n, updatedAt: new Date() },
  });
}

export async function saveWish(facultyId: string, maxSections: number | null, remarks: string) {
  await xdb.facultyAllocationWish.upsert({
    where: { facultyId },
    create: { id: randomUUID(), facultyId, maxSections, remarks: remarks || null, updatedAt: new Date() },
    update: { maxSections, remarks: remarks || null, updatedAt: new Date() },
  });
}

/* ---------------- Teaching history ---------------- */

/** The term now being allocated: the one most offered courses are stamped with. */
export async function currentTerm(coordinatorIds: string[]) {
  const offered = await prisma.course.findMany({ where: { coordinatorId: { in: coordinatorIds.concat(["none"]) }, isOffered: true, offeredTermName: { in: ["Fall", "Spring"] } }, select: { offeredTermName: true, offeredTermYear: true } });
  const count = new Map<number, number>();
  for (const c of offered) if (c.offeredTermName && c.offeredTermYear) { const i = termIndex(c.offeredTermName, c.offeredTermYear); count.set(i, (count.get(i) || 0) + 1); }
  const best = Array.from(count.entries()).sort((a, b) => b[1] - a[1])[0];
  if (best) return best[0];
  const now = new Date();
  return now.getMonth() >= 7 ? termIndex("Fall", now.getFullYear()) : termIndex("Spring", now.getFullYear());
}

/** Who taught which course code in which past term: snapshots of earlier offerings plus courses still carrying their last term. */
async function history(coordinatorIds: string[], people: { id: string; name: string }[], now: number) {
  const ids = coordinatorIds.concat(["none"]);
  const idByName = new Map(people.map((p) => [p.name.trim().toLowerCase(), p.id]));
  const seen = new Set<string>();
  const recs: { code: string; who: string; term: number }[] = [];
  const add = (code: string, who: string | undefined, term: number) => { if (!who || term >= now) return; const k = `${code}|${who}|${term}`; if (!seen.has(k)) { seen.add(k); recs.push({ code, who, term }); } };
  const [snaps, past] = await Promise.all([
    prisma.assignmentSnapshot.findMany({ where: { coordinatorId: { in: ids }, termName: { in: ["Fall", "Spring"] } }, select: { courseLabel: true, termName: true, termYear: true, instructorName: true } }),
    prisma.course.findMany({ where: { coordinatorId: { in: ids }, offeredTermName: { in: ["Fall", "Spring"] }, offeredTermYear: { not: null } }, select: { code: true, offeredTermName: true, offeredTermYear: true, instructorId: true, sectionAssignments: { select: { instructorId: true } } } }),
  ]);
  for (const s of snaps) add(codeOfLabel(s.courseLabel), idByName.get(s.instructorName.trim().toLowerCase()), termIndex(s.termName, s.termYear));
  for (const c of past) {
    const t = termIndex(c.offeredTermName!, c.offeredTermYear!);
    for (const a of c.sectionAssignments) add(c.code, a.instructorId, t);
    if (c.instructorId) add(c.code, c.instructorId, t);
  }
  return recs;
}

/** Per course code and teacher: times taught (stated / on record) and whether last semester or the same term last year. */
export async function experienceMap(user: MatrixUser, coordinatorIds: string[], instructorIds: string[]): Promise<Record<string, Record<string, Exp>>> {
  const people = await prisma.user.findMany({ where: { id: { in: instructorIds.concat(["none"]) } }, select: { id: true, name: true } });
  const now = await currentTerm(coordinatorIds);
  const [recs, self] = await Promise.all([history(coordinatorIds, people, now), selfExperience(instructorIds)]);
  const out: Record<string, Record<string, Exp>> = {};
  const get = (code: string, who: string) => ((out[code] ||= {})[who] ||= { self: null, system: 0, prev: false, lastYear: false });
  for (const r of recs) {
    const e = get(r.code, r.who);
    e.system++;
    if (r.term === now - 1) e.prev = true;
    if (r.term === now - 2) e.lastYear = true;
  }
  for (const [who, m] of Array.from(self.entries())) for (const [code, n] of Array.from(m.entries())) get(code, who).self = n;
  return out;
}

/* ---------------- The suggestion ---------------- */

export type Proposal = { key: string; kind: "course" | "group"; rowId: string; label: string; batchLabel: string; instructorId: string; instructorName: string; sections: number; score: number; reasons: string[] };

const PREF_POINTS: Record<number, number> = { 1: 40, 2: 25, 3: 10 };
const RANK: Record<string, number> = { "professor": 5, "associate professor": 4, "assistant professor": 3, "senior lecturer": 2, "lecturer": 1 };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK_HOURS = DAYS.length * 12; // the availability grid: 8:00–20:00, Monday to Saturday
const HOURS_PER_SECTION = 3;

/** Students' teacher rating (1–5, adjusted for how strictly each batch rates) per course code and teacher. When several teachers shared a course, each student's
 * answer goes to the teacher who marked most of that student's attendance (their section's teacher). */
async function ratings(coordinatorIds: string[]): Promise<Map<string, Map<string, { avg: number; n: number }>>> {
  const out = new Map<string, Map<string, { avg: number; n: number }>>();
  const ev = (prisma as unknown as Record<string, any>).courseEvaluation;
  const courses = await prisma.course.findMany({ where: { coordinatorId: { in: coordinatorIds.concat(["none"]) } }, select: { id: true, code: true, instructorId: true, batchId: true, offeredTermName: true, offeredTermYear: true, sectionAssignments: { select: { instructorId: true } } } });
  let rows: { courseId: string; studentId: string; answersJson: string }[] = [];
  try { rows = await ev.findMany({ where: { kind: "TEACHER", courseId: { in: courses.map((c) => c.id).concat(["none"]) } }, select: { courseId: true, studentId: true, answersJson: true } }); } catch { return out; }
  if (!rows.length) return out;
  const teachersOf = new Map(courses.map((c) => [c.id, Array.from(new Set([...c.sectionAssignments.map((a) => a.instructorId), ...(c.instructorId ? [c.instructorId] : [])]))]));
  // Shared courses: whose section each student was in, from who marked their attendance.
  const shared = courses.filter((c) => (teachersOf.get(c.id) || []).length > 1 && rows.some((r) => r.courseId === c.id)).map((c) => c.id);
  const marks = shared.length ? await prisma.attendanceRecord.groupBy({ by: ["courseId", "studentId", "markedById"], where: { courseId: { in: shared } }, _count: { _all: true } }).catch(() => []) : [];
  const sectionTeacher = new Map<string, string>(); // courseId|studentId -> teacher
  const bestCount = new Map<string, number>();
  for (const m of marks) {
    if (!(teachersOf.get(m.courseId) || []).includes(m.markedById)) continue; // marked by someone who isn't one of its teachers
    const k = `${m.courseId}|${m.studentId}`, n = m._count._all;
    if (n > (bestCount.get(k) || 0)) { bestCount.set(k, n); sectionTeacher.set(k, m.markedById); }
  }
  const codeOf = new Map(courses.map((c) => [c.id, c.code]));
  // How generously each batch rated in each term, against the whole term: answers are adjusted to the batch's norm
  // (the same adjusted score the evaluation reports show), so a strict batch does not count against a teacher.
  const cOf = new Map(courses.map((c) => [c.id, c]));
  const answerAvg = (j: string) => { try { const v = Object.values(JSON.parse(j) as Record<string, number>).map(Number).filter((x) => x > 0 && x <= 5); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; } catch { return null; } };
  const normSum = new Map<string, { t: number; n: number }>(), termSum = new Map<string, { t: number; n: number }>();
  for (const r of rows) {
    const c = cOf.get(r.courseId), v = answerAvg(r.answersJson);
    if (!c || v === null || !c.offeredTermName) continue;
    const tk = `${c.offeredTermName}-${c.offeredTermYear}`, bk = `${c.batchId}|${tk}`;
    const b = normSum.get(bk) || { t: 0, n: 0 }; b.t += v; b.n++; normSum.set(bk, b);
    const t = termSum.get(tk) || { t: 0, n: 0 }; t.t += v; t.n++; termSum.set(tk, t);
  }
  const adjust = (courseId: string, v: number) => {
    const c = cOf.get(courseId); if (!c?.offeredTermName) return v;
    const tk = `${c.offeredTermName}-${c.offeredTermYear}`, b = normSum.get(`${c.batchId}|${tk}`), t = termSum.get(tk);
    return b && t && b.n >= 5 ? Math.max(1, Math.min(5, v - b.t / b.n + t.t / t.n)) : v;
  };
  const sum = new Map<string, { t: number; n: number }>();
  for (const r of rows) {
    const ts = teachersOf.get(r.courseId) || [];
    const who = ts.length === 1 ? ts[0] : sectionTeacher.get(`${r.courseId}|${r.studentId}`);
    if (!who) continue; // shared course and no attendance for this student: can't tell whose section
    let a: Record<string, number> = {};
    try { a = JSON.parse(r.answersJson); } catch { continue; }
    const v = Object.values(a).map(Number).filter((x) => x > 0 && x <= 5);
    if (!v.length) continue;
    const k = `${codeOf.get(r.courseId)}|${who}`;
    const cur = sum.get(k) || { t: 0, n: 0 };
    cur.t += adjust(r.courseId, v.reduce((x, y) => x + y, 0) / v.length); cur.n++; sum.set(k, cur);
  }
  for (const [k, { t, n }] of Array.from(sum.entries())) {
    if (n < 5) continue; // too few answers to count (as on the evaluation reports)
    const [code, who] = k.split("|");
    if (!out.has(code)) out.set(code, new Map());
    out.get(code)!.set(who, { avg: Math.round((10 * t) / n) / 10, n });
  }
  return out;
}

/** Hours a week each teacher has marked unavailable (My Availability) and on which days. */
async function unavailable(ids: string[]) {
  const rows = await prisma.facultyUnavailability.findMany({ where: { facultyId: { in: ids.concat(["none"]) } }, select: { facultyId: true, dayOfWeek: true, startHour: true, endHour: true } }).catch(() => []);
  const out = new Map<string, { hours: number; days: string[] }>();
  for (const r of rows) {
    const x = out.get(r.facultyId) || { hours: 0, days: [] };
    x.hours += Math.max(0, r.endHour - r.startHour);
    if (!x.days.includes(r.dayOfWeek)) x.days.push(r.dayOfWeek);
    out.set(r.facultyId, x);
  }
  for (const x of Array.from(out.values())) x.days.sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b));
  return out;
}

const specMatch = (spec: string | null | undefined, domain: string | null | undefined, title: string) => {
  const sp = (spec || "").toLowerCase().trim();
  if (sp.length < 3) return false;
  const d = (domain || "").toLowerCase().trim(), t = title.toLowerCase();
  return (!!d && (d === sp || d.includes(sp) || sp.includes(d))) || t.includes(sp);
};

export async function suggestAllocation(user: MatrixUser, opts: { keepExisting: boolean }) {
  const m = await loadMatrix(user);
  const ids = m.instructors.map((i) => i.id);
  const codes = Array.from(new Set(m.rows.flatMap((r) => r.interestCodes)));
  const [exp, wish, rate, away, profiles, domains] = await Promise.all([
    experienceMap(user, m.coordinatorIds, ids), wishes(ids), ratings(m.coordinatorIds), unavailable(ids),
    prisma.facultyProfile.findMany({ where: { userId: { in: ids.concat(["none"]) } }, select: { userId: true, designation: true, specialization: true } }).catch(() => []),
    prisma.course.findMany({ where: { coordinatorId: { in: m.coordinatorIds.concat(["none"]) }, code: { in: codes.concat(["none"]) } }, select: { code: true, masterCourse: { select: { domain: true } } } }),
  ]);
  const now = await currentTerm(m.coordinatorIds);
  const rankOf = new Map(profiles.map((p) => [p.userId, p.designation || ""]));
  const specOf = (i: { id: string; specialization: string | null }) => i.specialization || profiles.find((p) => p.userId === i.id)?.specialization || "";
  const domainOf = new Map<string, string>();
  for (const d of domains) if (d.masterCourse?.domain && !domainOf.has(d.code)) domainOf.set(d.code, d.masterCourse.domain);
  const visiting = m.instructors.find((i) => i.isVisiting) || null;
  const pool = m.instructors.filter((i) => !i.isVisiting && !i.outOfPool);

  // Load already taken (kept allocations) and the room left.
  const used = new Map<string, number>();
  const has = new Map<string, Set<string>>(); // teacher -> row ids they already teach
  if (opts.keepExisting) for (const r of m.rows) for (const [who, n] of Object.entries(r.assignments)) { used.set(who, (used.get(who) || 0) + n); if (!has.has(who)) has.set(who, new Set()); has.get(who)!.add(r.id); }
  // Room: the wished number of sections (never above the normal load), less outside load, and no more sections than
  // their free hours a week can hold.
  const byHours = (id: string) => Math.floor(Math.max(0, WEEK_HOURS - (away.get(id)?.hours || 0)) / HOURS_PER_SECTION);
  const cap = (i: (typeof pool)[number]) => { const w = wish.get(i.id)?.maxSections; const base = w != null ? Math.min(w, i.normalLoad) : i.normalLoad; return Math.max(0, Math.min(base - i.externalLoadCount, byHours(i.id))); };
  const room = (i: (typeof pool)[number]) => cap(i) - (used.get(i.id) || 0);

  const best = (r: MatrixRow, who: string) => {
    let pref: number | undefined, e: Exp | undefined;
    for (const code of r.interestCodes) {
      const p = m.priorities[code]?.[who];
      if (p !== undefined && (pref === undefined || p < pref)) pref = p;
      const x = exp[code]?.[who];
      if (x) e = !e ? { ...x } : { self: Math.max(e.self || 0, x.self || 0) || null, system: e.system + x.system, prev: e.prev || x.prev, lastYear: e.lastYear || x.lastYear };
    }
    return { pref, e };
  };
  const score = (r: MatrixRow, i: (typeof pool)[number]) => {
    const { pref, e } = best(r, i.id);
    const times = Math.max(e?.self || 0, e?.system || 0);
    const reasons: string[] = [];
    let s = 0;
    if (pref !== undefined) { s += PREF_POINTS[pref] || 0; reasons.push(pref === 1 ? "top priority" : pref === 2 ? "priority 2 (good)" : "priority 3 (fifty-fifty)"); }
    if (times) { s += Math.min(times, 5) * 4; reasons.push(`taught ${times}×${e?.self && e.self >= (e?.system || 0) ? " (stated)" : ""}`); }
    if (e?.prev) { s += 15; reasons.push("taught it last semester"); }
    if (e?.lastYear) { s += 20; reasons.push("taught it this term last year"); }
    // Students' rating of this teacher on this course before (5+ answers, taught alone).
    let rating: { avg: number; n: number } | undefined;
    for (const code of r.interestCodes) { const x = rate.get(code)?.get(i.id); if (x && (!rating || x.avg > rating.avg)) rating = x; }
    if (rating && (s > 0)) {
      if (rating.avg >= 4) { s += 10; reasons.push(`students rated ${rating.avg}/5`); }
      else if (rating.avg >= 3.5) { s += 5; reasons.push(`students rated ${rating.avg}/5`); }
      else if (rating.avg < 3) { s -= 10; reasons.push(`students rated only ${rating.avg}/5`); }
    }
    // Specialization: the course's track (or title) matches the teacher's specialization.
    if (r.interestCodes.some((code) => specMatch(specOf(i), domainOf.get(code), r.title))) { s += r.courseType === "Elective" ? 12 : 6; reasons.push(`specialization: ${specOf(i)}`); }
    // Seniority settles close calls between teachers who want the course.
    const rk = RANK[(rankOf.get(i.id) || "").toLowerCase().trim()] || 0;
    if (s > 0 && pref !== undefined && rk) { s += rk; reasons.push(rankOf.get(i.id)!); }
    if (s > 0 && has.get(i.id)?.has(r.id)) { s += 8; reasons.push("already has a section"); }
    if (s > 0) s = Math.max(1, s - Math.max(0, (has.get(i.id)?.size || 0) - (has.get(i.id)?.has(r.id) ? 1 : 0)) * 2); // spread preparations, but a willing teacher stays willing
    return { s, reasons };
  };

  const need = m.rows.map((r) => ({ r, left: Math.max(0, r.sectionsNeeded - (opts.keepExisting ? Object.values(r.assignments).reduce((a, b) => a + b, 0) : 0)) })).filter((x) => x.left > 0);
  const willing = (r: MatrixRow) => pool.filter((i) => score(r, i).s > 0).length;
  need.sort((a, b) => willing(a.r) - willing(b.r) || b.left - a.left);

  const out = new Map<string, Proposal>();
  const give = (r: MatrixRow, who: { id: string; name: string }, sc: number, reasons: string[]) => {
    const key = `${r.kind}:${r.id}:${who.id}`;
    const p = out.get(key) || { key, kind: r.kind, rowId: r.id, label: r.label, batchLabel: r.batchLabel, instructorId: who.id, instructorName: who.name, sections: 0, score: sc, reasons };
    p.sections++; out.set(key, p);
    used.set(who.id, (used.get(who.id) || 0) + 1);
    if (!has.has(who.id)) has.set(who.id, new Set());
    has.get(who.id)!.add(r.id);
  };
  for (const { r, left } of need) {
    for (let k = 0; k < left; k++) {
      const ranked = pool.filter((i) => room(i) > 0).map((i) => ({ i, ...score(r, i) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || room(b.i) - room(a.i));
      const pick = ranked[0];
      if (pick) give(r, pick.i, pick.s, pick.reasons);
      else if (visiting) give(r, visiting, 0, ["no willing teacher with room left"]);
    }
  }
  const proposals = Array.from(out.values()).sort((a, b) => a.label.localeCompare(b.label) || b.sections - a.sections);
  const loads = pool.map((i) => ({ id: i.id, name: i.name, capacity: cap(i), assigned: used.get(i.id) || 0, wish: wish.get(i.id) || null, designation: rankOf.get(i.id) || "", specialization: specOf(i), unavailable: away.get(i.id) ? `${away.get(i.id)!.hours} h/week (${away.get(i.id)!.days.join(", ")})` : "" })).sort((a, b) => a.name.localeCompare(b.name));
  // Hiring gaps: what nobody in the pool can or will take, courses resting on one willing teacher, and by area.
  const unfilledBy = new Map<string, number>();
  for (const p of proposals) if (visiting && p.instructorId === visiting.id) unfilledBy.set(p.rowId, (unfilledBy.get(p.rowId) || 0) + p.sections);
  const areaOf = (r: MatrixRow) => r.interestCodes.map((c) => domainOf.get(c)).find(Boolean) || r.courseType || "General";
  const gapRows = m.rows.filter((r) => unfilledBy.has(r.id)).map((r) => ({ label: r.label, batch: r.batchLabel, sections: unfilledBy.get(r.id)!, area: areaOf(r), willing: willing(r) }));
  const thin = m.rows.filter((r) => r.sectionsNeeded > 0 && willing(r) === 1 && !unfilledBy.has(r.id)).map((r) => ({ label: r.label, area: areaOf(r), only: pool.find((i) => score(r, i).s > 0)?.name || "" }));
  const areas = new Map<string, { area: string; sections: number; courses: number; thin: number; experts: number }>();
  for (const g of gapRows) { const a = areas.get(g.area) || { area: g.area, sections: 0, courses: 0, thin: 0, experts: 0 }; a.sections += g.sections; a.courses++; areas.set(g.area, a); }
  for (const g of thin) { const a = areas.get(g.area) || { area: g.area, sections: 0, courses: 0, thin: 0, experts: 0 }; a.thin++; areas.set(g.area, a); }
  for (const a of Array.from(areas.values())) a.experts = pool.filter((i) => specMatch(specOf(i), a.area, a.area)).length;
  const unfilledTotal = gapRows.reduce((a, g) => a + g.sections, 0);
  const loadsAvg = pool.length ? pool.reduce((a, i) => a + i.normalLoad, 0) / pool.length : 3;
  const spare = loads.reduce((a, l) => a + Math.max(0, l.capacity - l.assigned), 0);
  const hiring = {
    unfilledSections: unfilledTotal, spareSections: spare,
    fteNeeded: unfilledTotal ? Math.ceil(unfilledTotal / Math.max(1, Math.round(loadsAvg))) : 0,
    rows: gapRows, thin,
    areas: Array.from(areas.values()).sort((a, b) => b.sections - a.sections || b.thin - a.thin),
    advice: [
      ...Array.from(areas.values()).filter((a) => a.sections > 0).sort((a, b) => b.sections - a.sections).map((a) => `Hire in ${a.area}: ${a.sections} section(s) of ${a.courses} course(s) have no willing teacher${a.experts ? ` (only ${a.experts} faculty with this specialization)` : " (no faculty with this specialization)"}.`),
      ...(spare > 0 && unfilledTotal > 0 ? [`${spare} section(s) of room is left with teachers who did not mark these courses — ask them to add priorities before hiring.`] : []),
      ...(thin.length ? [`${thin.length} course(s) rest on a single willing teacher — train a second teacher or hire to cover leave.`] : []),
    ],
  };
  const t = termOf(now);
  return { hiring, term: `${t.name} ${t.year}`, prev: `${termOf(now - 1).name} ${termOf(now - 1).year}`, lastYear: `${t.name} ${t.year - 1}`, keepExisting: opts.keepExisting, proposals, loads, unfilled: proposals.filter((p) => visiting && p.instructorId === visiting.id).reduce((a, p) => a + p.sections, 0) };
}

/** Apply the chosen suggestions: section counts added to (or, with keepExisting off, replacing) the matrix. */
export async function applyAllocation(user: MatrixUser & { name?: string }, keys: string[], keepExisting: boolean) {
  const s = await suggestAllocation(user, { keepExisting });
  const chosen = s.proposals.filter((p) => keys.includes(p.key));
  const chairmanId = user.managedById || "";
  if (!keepExisting) {
    // Start the chosen rows over: clear their current section counts first.
    const rows = Array.from(new Set(chosen.map((p) => `${p.kind}:${p.rowId}`)));
    for (const k of rows) {
      const [kind, id] = k.split(":");
      if (kind === "course") await prisma.courseSectionAssignment.deleteMany({ where: { courseId: id } });
      else await prisma.groupSectionAssignment.deleteMany({ where: { groupId: id } });
    }
  }
  let n = 0;
  for (const p of chosen) {
    const inst = await prisma.user.findUnique({ where: { id: p.instructorId } });
    if (!inst) continue;
    if (p.kind === "course") {
      const course = await prisma.course.findUnique({ where: { id: p.rowId }, include: { coordinator: true } });
      const ok = course && course.coordinator.managedById === chairmanId && (!user.departmentId || course.coordinator.departmentId === user.departmentId)
        && ((inst.isVisitingPlaceholder && inst.managedById === chairmanId) || isHeadFaculty(inst, chairmanId) || inst.managedById === course.coordinatorId);
      if (!ok) continue;
      const cur = await prisma.courseSectionAssignment.findUnique({ where: { courseId_instructorId: { courseId: p.rowId, instructorId: p.instructorId } } });
      await prisma.courseSectionAssignment.upsert({ where: { courseId_instructorId: { courseId: p.rowId, instructorId: p.instructorId } }, create: { courseId: p.rowId, instructorId: p.instructorId, sectionCount: p.sections }, update: { sectionCount: (cur?.sectionCount || 0) + p.sections } });
    } else {
      const g = await prisma.courseEquivalenceGroup.findUnique({ where: { id: p.rowId } });
      if (!g || g.chairmanId !== chairmanId) continue;
      const cur = await prisma.groupSectionAssignment.findUnique({ where: { groupId_instructorId: { groupId: p.rowId, instructorId: p.instructorId } } });
      await prisma.groupSectionAssignment.upsert({ where: { groupId_instructorId: { groupId: p.rowId, instructorId: p.instructorId } }, create: { groupId: p.rowId, instructorId: p.instructorId, sectionCount: p.sections }, update: { sectionCount: (cur?.sectionCount || 0) + p.sections } });
    }
    n++;
  }
  await writeAuditLog({ actorUserId: user.id, action: "AUTO_ALLOCATION_APPLIED", entityType: "User", entityId: user.id, metadata: { applied: n, keepExisting } });
  return n;
}
