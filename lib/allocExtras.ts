import { prisma } from "./db";
import { saveSetting } from "./scopedSettings";
import { notifyUsers } from "./notifications";
import { writeAuditLog } from "./audit";
import { staffOf } from "./registers";
import { selfExperience, wishes } from "./autoAllocate";
import { windowState, whatIfAway, firstTimers, type Window, type Cand } from "./allocExtrasCore";
import type { PRow } from "./yearPlan";

const db = prisma as unknown as Record<string, any>;
const J = <T,>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
async function setting(chairmanId: string, key: string) {
  return ((await db.scopedSetting?.findFirst({ where: { chairmanId, scopeType: "INSTITUTE", scopeId: chairmanId, key } }).catch(() => null)) as { value: string } | null)?.value || null;
}

// ---------------------------------------------------------------- the preference window
const WKEY = "alloc.prefWindow";
export async function prefWindow(chairmanId: string) { return J<Window | null>(await setting(chairmanId, WKEY), null); }
export async function windowNow(chairmanId: string) { return windowState(await prefWindow(chairmanId)); }
/** Blocks saving a preference outside the window (no window set = always open). */
export async function prefBlock(chairmanId: string) { const s = await windowNow(chairmanId); return s.state === "NOT_YET" || s.state === "CLOSED" ? s.text : null; }
export async function setPrefWindow(by: { id: string; name: string }, chairmanId: string, opens: string, closes: string, note: string) {
  const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!opens && !closes) { await saveSetting(chairmanId, "INSTITUTE", chairmanId, WKEY, "null", by.id); return null; }
  if (!ok(opens) || !ok(closes) || closes < opens) throw new Error("Give an opening date and a closing date on or after it.");
  const w: Window = { opens, closes, note: note.slice(0, 300) };
  await saveSetting(chairmanId, "INSTITUTE", chairmanId, WKEY, JSON.stringify(w), by.id);
  const teachers = (await staffOf(chairmanId)).filter((s) => ["INSTRUCTOR", "SUBJECT_EXPERT"].includes(s.role)).map((s) => s.id);
  await notifyUsers(teachers, { kind: "ASSIGNMENT", title: `Course preferences: ${opens} to ${closes}`, body: note || "Tell the Course Assigner which courses you would like to teach next year.", href: "/faculty/course-preferences" }).catch(() => null);
  await writeAuditLog({ actorUserId: by.id, action: "ALLOC_PREF_WINDOW_SET", entityType: "Institute", entityId: chairmanId, metadata: w });
  return w;
}

// ---------------------------------------------------------------- what taught what
async function taughtPairs(ids: string[], codes: string[]): Promise<Map<string, number>> {
  const cs = await prisma.course.findMany({ where: { code: { in: codes }, OR: [{ instructorId: { in: ids } }, { sectionAssignments: { some: { instructorId: { in: ids } } } }] }, select: { code: true, instructorId: true, sectionAssignments: { select: { instructorId: true } } } });
  const out: Map<string, number> = new Map();
  const add = (id: string | null, code: string) => { if (id) out.set(`${id}|${code.toUpperCase()}`, (out.get(`${id}|${code.toUpperCase()}`) || 0) + 1); };
  for (const c of cs) { add(c.instructorId, c.code); for (const s of c.sectionAssignments) add(s.instructorId, c.code); }
  const self = await selfExperience(ids).catch(() => new Map<string, Map<string, number>>());
  for (const [id, m] of self) for (const [code, n] of m) if (n > 0) out.set(`${id}|${code.toUpperCase()}`, Math.max(out.get(`${id}|${code.toUpperCase()}`) || 0, n));
  return out;
}

// ---------------------------------------------------------------- what if
type Inst = { id: string; name: string; isVisiting?: boolean; outOfPool?: boolean; normalLoad?: number; externalLoadCount?: number };
export async function whatIf(rows: PRow[], teacherId: string, instructors: Inst[]) {
  const pool = instructors.filter((i) => !i.isVisiting && !i.outOfPool);
  const ids = pool.map((i) => i.id), codes = Array.from(new Set(rows.map((r) => r.code)));
  const [prefs, wish, taught] = await Promise.all([
    prisma.facultyCoursePreference.findMany({ where: { facultyId: { in: ids.concat("none") } }, select: { facultyId: true, courseCode: true } }),
    wishes(ids).catch(() => new Map()), taughtPairs(ids, codes),
  ]);
  const taughtKeys: string[] = Array.from((taught as Map<string, number>).keys());
  const cands: Cand[] = pool.map((i) => {
    const w = (wish.get(i.id) as { maxSections?: number | null } | undefined)?.maxSections;
    const base = w != null ? Math.min(w, i.normalLoad ?? 3) : i.normalLoad ?? 3;
    return { id: i.id, name: i.name, cap: Math.max(0, base - (i.externalLoadCount || 0)), wants: new Set(prefs.filter((p) => p.facultyId === i.id).map((p) => p.courseCode.toUpperCase())), taught: new Set(taughtKeys.filter((k) => k.startsWith(`${i.id}|`)).map((k) => k.split("|")[1])) };
  });
  return whatIfAway(rows, teacherId, cands);
}

// ---------------------------------------------------------------- mentors for first-time courses
const mkey = (year: string) => `alloc.mentors.${year}`;
export type Mentors = Record<string, { mentorId: string; mentorName: string }>;
export async function mentorsOf(chairmanId: string, year: string) { return J<Mentors>(await setting(chairmanId, mkey(year)), {}); }
/** First-time teacher × course pairs in the plan, each with suggested mentors (who taught it most; the course's SE). */
export async function firstTimeList(chairmanId: string, year: string, rows: PRow[]) {
  const ids = Array.from(new Set(rows.flatMap((r) => r.teachers.map((t) => t.id))));
  const staff = await staffOf(chairmanId);
  const codes = Array.from(new Set(rows.map((r) => r.code)));
  const taught = await taughtPairs(staff.map((s) => s.id), codes);
  const pairs = firstTimers(rows, new Set(Array.from(taught.keys()).filter((k: string) => ids.includes(k.split("|")[0]))));
  const ses = await prisma.course.findMany({ where: { code: { in: codes }, subjectExpertId: { not: null }, coordinator: { managedById: chairmanId } }, select: { code: true, subjectExpertId: true } });
  const name = new Map<string, string>(staff.map((s) => [s.id as string, s.name as string]));
  const set = await mentorsOf(chairmanId, year);
  return pairs.map((p) => {
    const by = Array.from(taught.entries()).filter(([k]) => k.endsWith(`|${p.code}`) && !k.startsWith(`${p.teacherId}|`)).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ id: k.split("|")[0], n }));
    const se = ses.find((c) => c.code.toUpperCase() === p.code)?.subjectExpertId || null;
    const sugg = [...(se && se !== p.teacherId ? [{ id: se, why: "Subject Expert" }] : []), ...by.filter((x) => x.id !== se).map((x) => ({ id: x.id, why: `taught it ${x.n}×` }))].filter((x) => name.has(x.id)).slice(0, 4).map((x) => ({ ...x, name: name.get(x.id)! }));
    return { ...p, suggest: sugg, mentor: set[`${p.teacherId}|${p.code}`] || null };
  });
}
export async function setMentor(by: { id: string; name: string }, chairmanId: string, year: string, teacherId: string, code: string, mentorId: string) {
  const cur = await mentorsOf(chairmanId, year);
  const k = `${teacherId}|${code.toUpperCase()}`;
  if (!mentorId) delete cur[k];
  else {
    const m = await prisma.user.findUnique({ where: { id: mentorId }, select: { id: true, name: true } });
    if (!m) throw new Error("Mentor not found.");
    if (mentorId === teacherId) throw new Error("A teacher can't mentor themselves.");
    cur[k] = { mentorId: m.id, mentorName: m.name };
    const t = await prisma.user.findUnique({ where: { id: teacherId }, select: { name: true } });
    await notifyUsers([teacherId], { kind: "ASSIGNMENT", title: `${m.name} will mentor you for ${code}`, body: "Your first time teaching this course: ask your mentor about the plan, material and assessments.", href: "/allocation/year-card" }).catch(() => null);
    await notifyUsers([mentorId], { kind: "ASSIGNMENT", title: `Please mentor ${t?.name || "a colleague"} for ${code}`, body: "They teach this course for the first time next year.", href: "/allocation/year-card" }).catch(() => null);
  }
  await saveSetting(chairmanId, "INSTITUTE", chairmanId, mkey(year), JSON.stringify(cur), by.id);
  await writeAuditLog({ actorUserId: by.id, action: "ALLOC_MENTOR_SET", entityType: "User", entityId: teacherId, metadata: { code, mentorId: mentorId || null, year } });
}
/** For the year card: the teacher's mentors, and whom they mentor. */
export async function myMentoring(chairmanId: string, year: string, userId: string) {
  const all = await mentorsOf(chairmanId, year);
  const ids = Object.keys(all).map((k) => k.split("|")[0]);
  const names = new Map<string, string>((await prisma.user.findMany({ where: { id: { in: ids.concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id as string, u.name as string]));
  return {
    mentors: Object.entries(all).filter(([k]) => k.startsWith(`${userId}|`)).map(([k, v]) => ({ code: k.split("|")[1], mentor: v.mentorName })),
    mentees: Object.entries(all).filter(([, v]) => v.mentorId === userId).map(([k]) => ({ code: k.split("|")[1], teacher: names.get(k.split("|")[0]) || "" })),
  };
}
