import { randomUUID } from "crypto";
import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { ensureInstructorCopy } from "./instructorCopy";
import { recomputeCourseRows } from "./lectureWeights";
import { syncCourseContentToLinkedCourses } from "./contentSync";
import { cascadeTopicRename } from "./prereqCascade";
import { notifyUsers } from "./notifications";
import { writeAuditLog } from "./audit";
import { norm, similarity } from "./teachingAnalysis";
import { rowsForTopic, sameTopic } from "./topicLinks";
import {
  applyItems, diffPlan, intentItems, dropSafety, itemLine, layoutHash, prefillImportance, suggestImportance, topicKey,
  type Entry, type Item, type Level, type Row, type TopicFacts,
} from "./topicPlanCore";

// The Topic Workspace, database side. Any Subject Expert or Instructor opens any course of the institute; edits are
// saved as a whole: a plan the person owns changes at once, any other plan gets one proposal (per course) to the
// Subject Expert who owns it — the base course's for a course that follows a base course. A topic moved between two
// courses is one linked change: it moves only when every owner involved has agreed, so it is never lost or duplicated.
// An OMC-approved plan changes only through a Template Change Request. Every save keeps a version (compare, undo).

export const db = prisma as unknown as Record<string, any>;
export const MISSING = "The Topic Workspace tables are not in the database yet — run prisma/migration_topic_planning.sql in Supabase.";
export type Who = { id: string; role: string; managedById: string | null; name: string; departmentId?: string | null };
type Src = "SE" | "INSTRUCTOR";
const INBOX = "/faculty/topic-workspace?tab=proposals";

export async function planSettings(chairmanId: string) {
  const s = (await db.topicPlanSetting.findUnique({ where: { chairmanId } }).catch(() => null)) as Record<string, number> | null;
  return { remindDays: s?.remindDays ?? 3, escalateDays: s?.escalateDays ?? 7, minBankQuestions: s?.minBankQuestions ?? 5, minStudents: s?.minStudents ?? 30, minSection: s?.minSection ?? 15 };
}
export async function tablesReady() {
  try { await db.topicMeta.count({ where: { lectureRowId: "none" } }); await db.planProposal.count({ where: { id: "none" } }); return true; } catch { return false; }
}

// ------------------------------------------------------------------------------------------------ picker & access
/** Any course of the institute, by code, title, program or batch. */
export async function pickerCourses(user: Who, q: string, take = 80) {
  const chairmanId = await chairmanIdFor(user);
  const n = q.trim();
  const rows = await prisma.course.findMany({
    where: { coordinator: { managedById: chairmanId }, ...(n ? { OR: [{ code: { contains: n, mode: "insensitive" } }, { title: { contains: n, mode: "insensitive" } }, { batch: { degreeProgram: { contains: n, mode: "insensitive" } } }, { batch: { batchName: { contains: n, mode: "insensitive" } } }] } : {}) },
    select: { id: true, code: true, title: true, semesterNumber: true, isOffered: true, subjectExpertId: true, instructorId: true, batch: { select: { degreeProgram: true, batchName: true } }, subjectExpert: { select: { name: true } }, instructor: { select: { name: true } } },
    orderBy: [{ isOffered: "desc" }, { semesterNumber: "asc" }, { code: "asc" }], take,
  });
  return rows.map((c) => ({
    id: c.id, code: c.code, title: c.title, semester: c.semesterNumber, offered: c.isOffered,
    program: c.batch?.degreeProgram || "", batch: c.batch?.batchName || "",
    se: c.subjectExpert?.name || "", instructor: c.instructor?.name || "",
    mine: c.subjectExpertId === user.id ? "SE" : c.instructorId === user.id ? "INSTRUCTOR" : null,
  }));
}

/**
 * The picker, one row per course (same code and title across batches), each with its versions: first the latest base
 * plan set by any Subject Expert, then the other independent plans (courses that don't follow a base), then
 * Instructors' teaching copies that changed topics ("changed 5 topics"). Courses that follow a base are not versions.
 */
export async function pickerGroups(user: Who, q: string) {
  const flat = await pickerCourses(user, q, 200);
  const keyOf = (c: { code: string; title: string }) => `${c.code}|${norm(c.title)}`;
  const groups = new Map<string, typeof flat>();
  for (const c of flat) groups.set(keyOf(c), (groups.get(keyOf(c)) || []).concat(c));
  const ids = flat.map((c) => c.id).concat("none");
  const [followers, rows, created] = await Promise.all([
    prisma.courseContentSyncMember.findMany({ where: { courseId: { in: ids }, isBase: false }, select: { courseId: true } }),
    prisma.lectureRow.findMany({ where: { courseId: { in: ids } }, select: { courseId: true, source: true, topic: true } }),
    prisma.course.findMany({ where: { id: { in: ids } }, select: { id: true, createdAt: true, offeredTermName: true, offeredTermYear: true } }),
  ]);
  const follower = new Set(followers.map((f) => f.courseId));
  const info = new Map(created.map((c) => [c.id, c]));
  const topics = (id: string, src: string) => rows.filter((r) => r.courseId === id && r.source === src).map((r) => norm(r.topic)).filter(Boolean);
  const changed = (a: string[], b: string[]) => { const A = new Set(a), B = new Set(b); let n = 0; A.forEach((x) => { if (!B.has(x)) n++; }); B.forEach((x) => { if (!A.has(x)) n++; }); return Math.ceil(n / 2) || (a.join("|") !== b.join("|") ? 1 : 0); };
  const term = (id: string) => { const c = info.get(id); return c?.offeredTermName ? `${c.offeredTermName} ${c.offeredTermYear || ""}`.trim() : ""; };
  const out = [];
  for (const list of Array.from(groups.values()).slice(0, 40)) {
    const bases = list.filter((c) => !follower.has(c.id)).sort((a, b) => +new Date(info.get(b.id)!.createdAt) - +new Date(info.get(a.id)!.createdAt));
    const versions: { courseId: string; plan: "SE" | "INSTRUCTOR"; kind: "BASE" | "SE" | "INSTRUCTOR"; label: string; changed?: number; mine?: boolean }[] = [];
    bases.forEach((c, i) => versions.push({ courseId: c.id, plan: "SE", kind: i === 0 ? "BASE" : "SE", label: `${i === 0 ? "Latest base plan" : "SE plan"} · ${c.se || "no SE"} · ${c.program} ${c.batch}${term(c.id) ? ` · ${term(c.id)}` : ""}`, mine: c.mine === "SE" }));
    for (const c of list) {
      const ins = topics(c.id, "INSTRUCTOR");
      if (!ins.length) continue;
      const n = changed(ins, topics(c.id, "SE"));
      if (n > 0 || c.mine === "INSTRUCTOR") versions.push({ courseId: c.id, plan: "INSTRUCTOR", kind: "INSTRUCTOR", label: `Instructor copy · ${c.instructor || "—"} · ${c.program} ${c.batch}${term(c.id) ? ` · ${term(c.id)}` : ""}${n ? ` · changed ${n} topic${n === 1 ? "" : "s"}` : ""}`, changed: n, mine: c.mine === "INSTRUCTOR" });
    }
    const followerCount = list.filter((c) => follower.has(c.id)).length;
    out.push({ key: keyOf(list[0]), code: list[0].code, title: list[0].title, semester: list[0].semester, programs: Array.from(new Set(list.map((c) => c.program))).filter(Boolean), followers: followerCount, versions });
  }
  return out;
}

export type Access = {
  courseId: string; code: string; title: string; semester: number | null; coordinatorId: string; program: string; batch: string;
  plan: Src; planCourseId: string; mode: "APPLY" | "PROPOSE" | "TEMPLATE" | "FOLLOWER" | "VIEW"; toUserId: string | null; toName: string;
  followsBase: string | null; baseCourseId?: string | null; why: string; ownTeaching: boolean; courseType: string; masterCourseId: string | null; textbook: string;
};
async function baseCourseOf(courseId: string): Promise<string | null> {
  const m = await prisma.courseContentSyncMember.findUnique({ where: { courseId }, select: { isBase: true, group: { select: { members: { where: { isBase: true }, select: { courseId: true } } } } } }).catch(() => null);
  if (!m || m.isBase) return null;
  return m.group.members[0]?.courseId || null;
}
/** Which plan this person edits in a column, and whether a save changes it at once or proposes. */
export async function accessFor(user: Who, courseId: string, want?: Src | null): Promise<Access | null> {
  const chairmanId = await chairmanIdFor(user);
  const sel = { id: true, code: true, title: true, semesterNumber: true, coordinatorId: true, subjectExpertId: true, instructorId: true, templateStatus: true, courseType: true, masterCourseId: true, textbook: true, batch: { select: { degreeProgram: true, batchName: true } }, coordinator: { select: { managedById: true } } } as const;
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: sel });
  if (!c || (c.coordinator.managedById !== chairmanId && c.coordinatorId !== chairmanId)) return null;
  const base = { courseId: c.id, code: c.code, title: c.title, semester: c.semesterNumber, coordinatorId: c.coordinatorId, program: c.batch?.degreeProgram || "", batch: c.batch?.batchName || "", courseType: c.courseType, masterCourseId: c.masterCourseId, textbook: c.textbook || "" };
  const ownTeaching = user.role === "INSTRUCTOR" && c.instructorId === user.id;
  if (ownTeaching && want !== "SE") return { ...base, plan: "INSTRUCTOR", planCourseId: c.id, mode: "APPLY", toUserId: user.id, toName: user.name, followsBase: null, why: "Your teaching copy — saves at once", ownTeaching };
  // Another teacher's teaching copy: read-only (topics can be copied out of it).
  if (want === "INSTRUCTOR" && !ownTeaching) {
    const who = c.instructorId ? (await prisma.user.findUnique({ where: { id: c.instructorId }, select: { name: true } }))?.name || "" : "";
    return { ...base, plan: "INSTRUCTOR", planCourseId: c.id, mode: "VIEW", toUserId: c.instructorId, toName: who, followsBase: null, why: `${who || "The Instructor"}'s teaching copy — read only`, ownTeaching: false };
  }
  // A course that follows a base course (content sync) is never edited itself: its plan comes from the base.
  const baseId = await baseCourseOf(c.id);
  if (baseId) {
    const p = await prisma.course.findUnique({ where: { id: baseId }, select: sel });
    const followsBase = p ? `${p.code} — ${p.title}${p.batch ? ` (${p.batch.batchName})` : ""}` : "its base course";
    return { ...base, plan: "SE", planCourseId: c.id, mode: "FOLLOWER", toUserId: null, toName: "", followsBase, baseCourseId: baseId, why: `Follows ${followsBase} — edit the base so the change carries forward`, ownTeaching };
  }
  const planCourse = c;
  const owner = user.role === "SUBJECT_EXPERT" && planCourse.subjectExpertId === user.id;
  const toUserId = planCourse.subjectExpertId || planCourse.coordinatorId;
  const toName = toUserId ? (await prisma.user.findUnique({ where: { id: toUserId }, select: { name: true } }))?.name || "" : "";
  const mode = owner ? (planCourse.templateStatus === "approved" ? "TEMPLATE" : "APPLY") : "PROPOSE";
  const why = mode === "APPLY" ? "Your plan — saves at once"
    : mode === "TEMPLATE" ? "Approved by the OMC — saving sends a Template Change Request"
    : `Saving sends a proposal to ${toName || "the Subject Expert"}`;
  return { ...base, plan: "SE", planCourseId: planCourse.id, mode, toUserId, toName, followsBase: null, why, ownTeaching };
}

// ------------------------------------------------------------------------------------------------ loading columns
const rowSelect = {
  id: true, courseId: true, topic: true, subtopic: true, week: true, lectureNumber: true, cloId: true, bloomLevel: true,
  clo: { select: { code: true, statement: true, mappedPlo: { select: { number: true } } } },
  paperDistributionItems: { select: { examType: true } },
  _count: { select: { instrumentLinks: true, attendanceRecords: true } },
} as const;
export async function planRows(courseId: string, source: Src) {
  if (source === "INSTRUCTOR") await ensureInstructorCopy(courseId);
  return prisma.lectureRow.findMany({ where: { courseId, source }, select: rowSelect, orderBy: { lectureNumber: "asc" } });
}
type PlanRowDb = Awaited<ReturnType<typeof planRows>>[number];

/** Each course's plan in the program, one per course code (the latest course with a plan): for checks and chains. */
export async function programPlans(coordinatorId: string) {
  const courses = await prisma.course.findMany({ where: { coordinatorId }, select: { id: true, code: true, title: true, semesterNumber: true, prerequisiteCourseId: true, courseType: true, createdAt: true, isOffered: true, batchId: true, masterCourseId: true }, orderBy: { createdAt: "desc" } });
  const counts = await prisma.lectureRow.groupBy({ by: ["courseId"], where: { courseId: { in: courses.map((c) => c.id).concat("none") }, source: "SE" }, _count: { _all: true } });
  const has = new Set(counts.filter((c) => c._count._all > 0).map((c) => c.courseId));
  const byCode = new Map<string, (typeof courses)[number]>();
  for (const c of courses) { const cur = byCode.get(c.code); if (!cur || (!has.has(cur.id) && has.has(c.id))) byCode.set(c.code, c); }
  const picked = Array.from(byCode.values());
  const rows = await prisma.lectureRow.findMany({ where: { courseId: { in: picked.map((c) => c.id).concat("none") }, source: "SE" }, select: { id: true, courseId: true, topic: true, bloomLevel: true }, orderBy: { lectureNumber: "asc" } });
  const meta = await db.topicMeta.findMany({ where: { lectureRowId: { in: rows.map((r) => r.id).concat("none") } }, select: { lectureRowId: true, notTaught: true, importance: true } }).catch(() => []) as { lectureRowId: string; notTaught: boolean; importance: string | null }[];
  const nt = new Map(meta.map((m) => [m.lectureRowId, m]));
  const codeOfId = new Map(courses.map((c) => [c.id, c.code]));
  return new Map(picked.map((c) => [c.code, {
    id: c.id, code: c.code, title: c.title, semester: c.semesterNumber, courseType: c.courseType, masterCourseId: c.masterCourseId,
    prereqCode: c.prerequisiteCourseId ? codeOfId.get(c.prerequisiteCourseId) || null : null,
    topics: rows.filter((r) => r.courseId === c.id).map((r) => ({ id: r.id, topic: r.topic, bloom: r.bloomLevel, notTaught: !!nt.get(r.id)?.notTaught, importance: nt.get(r.id)?.importance || null })),
  }]));
}

export type ColumnRow = {
  id: string; topic: string; subtopic: string | null; week: number; lectureNumber: number; cloId: string | null; clo: string | null; bloom: string | null;
  links: number; paperItems: number; midterm: boolean; pinned: boolean;
  importance: Level | null; confirmed: boolean; prefill: Level; suggestion: { level: Level; why: string; confidence: string };
  safety: { mark: string; reason: string };
  dependents: { code: string; topic: string; strength: string }[]; needs: { code: string; topic: string; strength: string }[];
  overlaps: { code: string; topic: string; verdict: string }[];
  industry: string | null; reading: string | null; needsClo: boolean; cloSuggestion: { id: string; code: string; why: string } | null; movedFrom: string | null; notTaught: boolean;
  inCouncil: boolean; gaOnly: number[]; comments: number; difficulty: number; bank: number;
};

export async function loadColumns(user: Who, open: { courseId: string; plan?: Src | null }[]) {
  const out = [];
  for (const o of open.slice(0, 40)) {
    const a = await accessFor(user, o.courseId, o.plan);
    if (!a) continue;
    out.push({ ...a, ...(await columnData(a)) });
  }
  return out;
}

export async function columnData(a: Access) {
  const rows = await planRows(a.planCourseId, a.plan);
  const ids = rows.map((r) => r.id);
  const [meta, links, overlaps, council, clos, comments, votes, bank, sameCode] = await Promise.all([
    db.topicMeta.findMany({ where: { lectureRowId: { in: ids.concat("none") } } }).catch(() => []) as Promise<Record<string, any>[]>,
    prisma.topicPrerequisite.findMany({ where: { coordinatorId: a.coordinatorId, orphanedAt: null, OR: [{ prereqCourseCode: a.code }, { dependentCourseCode: a.code }] } }).catch(() => []),
    prisma.topicOverlapReview.findMany({ where: { coordinatorId: a.coordinatorId, OR: [{ codeA: a.code }, { codeB: a.code }] } }).catch(() => []),
    a.masterCourseId ? prisma.masterCourseTopic.findMany({ where: { masterCourseId: a.masterCourseId }, select: { topic: true } }) : Promise.resolve([] as { topic: string }[]),
    prisma.cLO.findMany({ where: { courseId: a.planCourseId, source: a.plan }, select: { id: true, code: true, statement: true } }),
    db.topicComment.groupBy({ by: ["topicKey"], where: { courseId: a.planCourseId }, _count: { _all: true } }).catch(() => []) as Promise<{ topicKey: string; _count: { _all: number } }[]>,
    db.topicDifficultyVote.groupBy({ by: ["topicKey"], where: { courseId: { in: (await prisma.course.findMany({ where: { coordinatorId: a.coordinatorId, code: a.code }, select: { id: true } })).map((c) => c.id).concat("none") } }, _count: { _all: true } }).catch(() => []) as Promise<{ topicKey: string; _count: { _all: number } }[]>,
    prisma.questionBankItem.findMany({ where: { chairmanId: (await prisma.user.findUnique({ where: { id: a.coordinatorId }, select: { managedById: true } }))?.managedById || "none", courseCode: a.code, active: true }, select: { text: true } }).catch(() => [] as { text: string }[]),
    Promise.resolve(null),
  ]);
  void sameCode;
  // Synced courses take the base course's levels: a follower's own rows look up the base plan's importance by topic.
  const m = new Map(meta.map((x) => [x.lectureRowId as string, x]));
  const councilKeys = new Set(council.map((t) => norm(t.topic)));
  const inCouncil = (t: string) => councilKeys.has(norm(t)) || council.some((c) => similarity(c.topic, t) >= 0.6);
  const perClo = new Map<string, number>();
  for (const r of rows) if (r.cloId) perClo.set(r.cloId, (perClo.get(r.cloId) || 0) + 1);
  const perTopic = new Map<string, number>();
  for (const r of rows) perTopic.set(topicKey(r.topic), (perTopic.get(topicKey(r.topic)) || 0) + 1);
  const ploRows = new Map<number, string[]>();
  for (const r of rows) { const p = r.clo?.mappedPlo?.number; if (p) ploRows.set(p, (ploRows.get(p) || []).concat(r.id)); }
  const commentsOf = new Map(comments.map((c) => [c.topicKey, c._count._all]));
  const votesOf = new Map(votes.map((c) => [c.topicKey, c._count._all]));
  // Which lecture rows a link's topic is: the exact wording first, else the closest (see rowsForTopic).
  const hits = (topic: string) => new Set(rowsForTopic(rows, topic).map((r) => r.id));
  const depOf = new Map<string, { code: string; topic: string; strength: string }[]>(), needOf = new Map<string, { code: string; topic: string; strength: string }[]>(), ovOf = new Map<string, { code: string; topic: string; verdict: string }[]>();
  const push = <T,>(m: Map<string, T[]>, id: string, v: T) => m.set(id, (m.get(id) || []).concat(v));
  for (const l of links) {
    if (l.prereqCourseCode === a.code) for (const id of Array.from(hits(l.prereqTopic))) push(depOf, id, { code: l.dependentCourseCode, topic: l.dependentTopic, strength: l.strength });
    if (l.dependentCourseCode === a.code) for (const id of Array.from(hits(l.dependentTopic))) push(needOf, id, { code: l.prereqCourseCode, topic: l.prereqTopic, strength: l.strength });
  }
  for (const o of overlaps) {
    if (o.codeA === a.code) for (const id of Array.from(hits(o.topicA))) push(ovOf, id, { code: o.codeB, topic: o.topicB, verdict: o.verdict });
    if (o.codeB === a.code) for (const id of Array.from(hits(o.topicB))) push(ovOf, id, { code: o.codeA, topic: o.topicA, verdict: o.verdict });
  }
  const out: ColumnRow[] = rows.map((r) => {
    const mm = m.get(r.id) || {};
    const dependents = depOf.get(r.id) || [], needs = needOf.get(r.id) || [], ov = ovOf.get(r.id) || [];
    const facts: TopicFacts = {
      id: r.id, topic: r.topic, importance: (mm.importance as Level) || null, cloId: r.cloId, links: r._count.instrumentLinks, paperItems: r.paperDistributionItems.length,
      dependents, progressionStart: ov.some((o) => o.verdict === "PROGRESSION"), duplication: ov.some((o) => o.verdict === "DUPLICATION"),
      inCouncil: inCouncil(r.topic), sameTopicLectures: perTopic.get(topicKey(r.topic)), cloLectures: r.cloId ? perClo.get(r.cloId) : undefined,
    };
    const prefill = prefillImportance(facts);
    const level = (mm.importance as Level) || null;
    // Only an importance someone set counts as Core here; a suggested level is just a hint.
    const safety = dropSafety({ ...facts, importance: level });
    let cloSuggestion = null as ColumnRow["cloSuggestion"];
    if (mm.needsClo || !r.cloId) {
      let best = 0, pick: { id: string; code: string } | null = null;
      for (const c of clos) { const s = similarity(c.statement, `${r.topic} ${r.subtopic || ""}`); if (s > best) { best = s; pick = c; } }
      if (pick && best > 0.05) cloSuggestion = { id: pick.id, code: pick.code, why: `Wording closest to ${pick.code} (${Math.round(best * 100)}% match)` };
      else {
        // No wording match: the CLO of the lectures around it (nearest mapped lecture before it, else after it).
        const i = rows.indexOf(r);
        const near = rows.slice(0, i).reverse().find((x) => x.cloId && x.id !== r.id) || rows.slice(i + 1).find((x) => x.cloId);
        const c = near ? clos.find((x) => x.id === near.cloId) : null;
        if (c) cloSuggestion = { id: c.id, code: c.code, why: `Same CLO as the lectures around it (lecture ${near!.lectureNumber})` };
      }
    }
    const p = r.clo?.mappedPlo?.number;
    return {
      id: r.id, topic: r.topic, subtopic: r.subtopic, week: r.week, lectureNumber: r.lectureNumber, cloId: r.cloId, clo: r.clo?.code || null, bloom: r.bloomLevel,
      links: r._count.instrumentLinks, paperItems: r.paperDistributionItems.length, midterm: r.paperDistributionItems.some((x) => x.examType === "Midterm"), pinned: r._count.attendanceRecords > 0,
      importance: level, confirmed: !!mm.importanceConfirmed, prefill, suggestion: suggestImportance(facts), safety,
      dependents, needs, overlaps: ov, industry: mm.industry || null, reading: mm.reading || null, needsClo: !!mm.needsClo, cloSuggestion, movedFrom: mm.movedFrom || null, notTaught: !!mm.notTaught,
      inCouncil: facts.inCouncil!, gaOnly: p && (ploRows.get(p) || []).length === 1 ? [p] : [],
      comments: commentsOf.get(topicKey(r.topic)) || 0, difficulty: votesOf.get(topicKey(r.topic)) || 0,
      bank: bank.filter((b) => norm(b.text).includes(norm(r.topic)) || similarity(b.text, r.topic) >= 0.25).length,
    };
  });
  return { hash: layoutHash(rows), rows: out, lab: /lab/i.test(a.courseType) || /lab/i.test(a.title) };
}

// ------------------------------------------------------------------------------------------------ writing plans
type Change = { courseId: string; source: Src; entries: (Entry & { restore?: Record<string, unknown> | null })[] };
/**
 * Writes one or more plans together. Every lecture row of these plans that is not in any of the new lists is deleted;
 * a row listed under another course moves there (dropping its CLO and assessment links, flagged "map to a CLO").
 * A version of each plan is kept first.
 */
export async function writePlans(changes: Change[], actor: Who, opts: { sessionId?: string | null; label?: string } = {}) {
  if (!changes.length) return { ok: true as const, moved: 0, added: 0, removed: 0 };
  const current = await prisma.lectureRow.findMany({ where: { OR: changes.map((c) => ({ courseId: c.courseId, source: c.source })) }, select: { ...rowSelect, actualDate: true, teachingMethod: true, teachingMaterials: true, weightPct: true, source: true } });
  const byId = new Map(current.map((r) => [r.id, r]));
  const referenced = changes.flatMap((c) => c.entries.filter((e) => e.id).map((e) => e.id!));
  if (new Set(referenced).size !== referenced.length) return { error: "A topic appears twice. Reload the workspace and try again." };
  const unknown = referenced.filter((id) => !byId.has(id));
  if (unknown.length) return { error: "The lecture plans changed since you opened them. Reload and try again." };
  const deleted = current.filter((r) => !referenced.includes(r.id));
  const blocked = deleted.find((r) => r._count.attendanceRecords > 0);
  if (blocked) return { error: `"${blocked.topic}" already has attendance recorded, so it can't be removed.` };
  const moved: { id: string; from: string; to: string; source: Src }[] = [];
  for (const c of changes) for (const e of c.entries) {
    if (!e.id) { if (!e.topic?.trim()) return { error: "A topic has no text." }; continue; }
    const r = byId.get(e.id)!;
    if (r.courseId !== c.courseId || r.source !== c.source) {
      if (r._count.attendanceRecords > 0) return { error: `"${r.topic}" already has attendance recorded, so it can't move to another course.` };
      moved.push({ id: r.id, from: r.courseId, to: c.courseId, source: c.source });
    }
  }
  const codes = new Map((await prisma.course.findMany({ where: { id: { in: Array.from(new Set(changes.map((c) => c.courseId).concat(current.map((r) => r.courseId)))) } }, select: { id: true, code: true, coordinatorId: true } })).map((c) => [c.id, c]));
  // Versions first (compare with last semester, undo).
  for (const c of changes) {
    const before = current.filter((r) => r.courseId === c.courseId && r.source === c.source).sort((x, y) => x.lectureNumber - y.lectureNumber);
    await db.topicPlanVersion.create({ data: { id: randomUUID(), courseId: c.courseId, source: c.source, sessionId: opts.sessionId || null, byUserId: actor.id, label: opts.label || "Saved in the Topic Workspace", rowsJson: JSON.stringify(before.map((r) => ({ id: r.id, topic: r.topic, subtopic: r.subtopic, cloId: r.cloId, bloomLevel: r.bloomLevel, teachingMethod: r.teachingMethod, teachingMaterials: r.teachingMaterials }))) } }).catch(() => null);
  }
  const touched = moved.map((m) => m.id).concat(deleted.map((d) => d.id));
  const created: { courseId: string; source: Src; id: string; importance?: Level | null }[] = [];
  await prisma.$transaction(async (tx) => {
    if (touched.length) {
      await tx.lectureRowInstrument.deleteMany({ where: { lectureRowId: { in: touched } } });
      await tx.paperDistributionItem.updateMany({ where: { lectureRowId: { in: touched } }, data: { lectureRowId: null } });
    }
    if (deleted.length) await tx.lectureRow.deleteMany({ where: { id: { in: deleted.map((d) => d.id) } } });
    let k = 0;
    for (const id of referenced) await tx.lectureRow.update({ where: { id }, data: { lectureNumber: -(++k) - 100000 } });
    for (const c of changes) {
      for (let i = 0; i < c.entries.length; i++) {
        const e = c.entries[i];
        const pos = { lectureNumber: i + 1, week: Math.ceil((i + 1) / 2) };
        if (e.id) {
          const r = byId.get(e.id)!;
          const isMoved = r.courseId !== c.courseId || r.source !== c.source;
          await tx.lectureRow.update({ where: { id: e.id }, data: { courseId: c.courseId, source: c.source, ...pos, topic: e.topic.trim().slice(0, 300), subtopic: e.subtopic ? String(e.subtopic).slice(0, 500) : null, ...(isMoved ? { cloId: null, weightPct: 0, actualDate: null, rescheduledNote: null } : {}) } });
        } else {
          const extra = (e.restore || {}) as Record<string, string | null>;
          const row = await tx.lectureRow.create({ data: { courseId: c.courseId, source: c.source, ...pos, topic: e.topic.trim().slice(0, 300), subtopic: e.subtopic ? String(e.subtopic).slice(0, 500) : null, cloId: extra.cloId || null, bloomLevel: extra.bloomLevel || null, teachingMethod: extra.teachingMethod || null, teachingMaterials: extra.teachingMaterials || null } });
          created.push({ courseId: c.courseId, source: c.source, id: row.id, importance: e.importance });
        }
      }
    }
  }, { timeout: 90000, maxWait: 15000 });

  // Importance, "moved in" flags.
  const metaOf = new Map(((await db.topicMeta.findMany({ where: { lectureRowId: { in: referenced.concat("none") } } }).catch(() => [])) as { lectureRowId: string; importance: string | null }[]).map((x) => [x.lectureRowId, x]));
  for (const c of changes) for (const e of c.entries) {
    if (!e.id || !e.importance || metaOf.get(e.id)?.importance === e.importance) continue;
    await setMeta(e.id, c.courseId, { importance: e.importance, importanceConfirmed: actor.role === "SUBJECT_EXPERT" || c.source === "INSTRUCTOR" }, actor.id);
  }
  for (const n of created) if (n.importance) await setMeta(n.id, n.courseId, { importance: n.importance, importanceConfirmed: true }, actor.id);
  for (const mv of moved) await setMeta(mv.id, mv.to, { needsClo: true, movedFrom: codes.get(mv.from)?.code || null }, actor.id);
  for (const d of deleted) await db.topicMeta.deleteMany({ where: { lectureRowId: d.id } }).catch(() => null);

  // Links follow the topics: renamed topics keep their links; a topic moved to another course takes them along.
  for (const c of changes) {
    if (c.source !== "SE") continue;
    for (const e of c.entries) {
      if (!e.id) continue;
      const r = byId.get(e.id)!;
      if (r.courseId === c.courseId && r.topic.trim() !== e.topic.trim()) await cascadeTopicRename(c.courseId, r.topic, e.topic.trim(), actor).catch(() => 0);
    }
  }
  for (const mv of moved) if (mv.source === "SE") await moveLinks(codes.get(mv.from), codes.get(mv.to), byId.get(mv.id)!.topic);
  for (const c of changes) {
    const after = await prisma.lectureRow.findMany({ where: { courseId: c.courseId, source: c.source }, select: { id: true, topic: true, subtopic: true }, orderBy: { lectureNumber: "asc" } });
    await db.topicPlanVersion.updateMany({ where: { courseId: c.courseId, source: c.source, byUserId: actor.id, afterJson: null }, data: { afterJson: JSON.stringify(after) } }).catch(() => null);
    await recomputeCourseRows(c.courseId, c.source);
    if (c.source === "SE") await syncCourseContentToLinkedCourses(c.courseId).catch(() => {});
  }
  for (const id of Array.from(new Set(moved.map((m) => m.from)))) if (!changes.some((c) => c.courseId === id)) await recomputeCourseRows(id, "SE").catch(() => {});
  return { ok: true as const, moved: moved.length, added: created.length, removed: deleted.length };
}
async function moveLinks(from: { code: string; coordinatorId: string } | undefined, to: { code: string; coordinatorId: string } | undefined, topic: string) {
  if (!from || !to || from.coordinatorId !== to.coordinatorId || from.code === to.code) return;
  const links = await prisma.topicPrerequisite.findMany({ where: { coordinatorId: from.coordinatorId, OR: [{ prereqCourseCode: from.code }, { dependentCourseCode: from.code }] } }).catch(() => []);
  for (const l of links) {
    const data = l.prereqCourseCode === from.code && norm(l.prereqTopic) === norm(topic) ? { prereqCourseCode: to.code } : l.dependentCourseCode === from.code && norm(l.dependentTopic) === norm(topic) ? { dependentCourseCode: to.code } : null;
    if (!data) continue;
    if ((data.prereqCourseCode || l.prereqCourseCode) === (data.dependentCourseCode || l.dependentCourseCode)) continue; // would link a course to itself
    await prisma.topicPrerequisite.update({ where: { id: l.id }, data }).catch(() => null);
  }
}
export async function setMeta(lectureRowId: string, courseId: string, data: Record<string, unknown>, by: string) {
  await db.topicMeta.upsert({ where: { lectureRowId }, create: { lectureRowId, courseId, ...data, updatedById: by }, update: { courseId, ...data, updatedById: by, updatedAt: new Date() } });
}

// ------------------------------------------------------------------------------------------------ saving from the workspace
export type SaveCourse = { courseId: string; plan?: Src | null; hash: string; entries: Entry[] };
const asRow = (r: { id: string; topic: string; subtopic: string | null }, meta: Map<string, string | null>): Row => ({ id: r.id, topic: r.topic, subtopic: r.subtopic, importance: (meta.get(r.id) as Level) || null });

export type LinkDraft = { kind: string; level: string; action?: string; fromCourseId: string; fromTopic: string; toCourseId: string; toTopic: string; note?: string; fromCode?: string; toCode?: string };
export async function savePlans(user: Who, body: { sessionId?: string; note?: string; courses: SaveCourse[]; links?: LinkDraft[] }) {
  if (!(await tablesReady())) return { error: MISSING, status: 500 };
  const chairmanId = await chairmanIdFor(user);
  const plans: { a: Access; c: SaveCourse; rows: PlanRowDb[] }[] = [];
  const conflicts: { courseId: string; code: string; theirs: { id: string; topic: string; subtopic: string | null }[]; by: string }[] = [];
  for (const c of body.courses || []) {
    const a = await accessFor(user, c.courseId, c.plan);
    if (!a) return { error: "One of those courses is not in your institute.", status: 404 };
    if (a.mode === "FOLLOWER") return { error: `${a.code} follows ${a.followsBase}. Open and edit the base course instead — the change carries forward.`, status: 409 };
    if (a.mode === "VIEW") return { error: `${a.code}: ${a.why}.`, status: 403 };
    if (plans.some((p) => p.a.planCourseId === a.planCourseId && p.a.plan === a.plan)) return { error: `${a.code} is open twice (it follows the same base course). Close one of them.`, status: 400 };
    const rows = await planRows(a.planCourseId, a.plan);
    if (layoutHash(rows) !== c.hash) {
      const v = await db.topicPlanVersion.findFirst({ where: { courseId: a.planCourseId, source: a.plan }, orderBy: { at: "desc" } }).catch(() => null);
      const by = v ? (await prisma.user.findUnique({ where: { id: v.byUserId }, select: { name: true } }))?.name || "someone" : "someone";
      conflicts.push({ courseId: c.courseId, code: a.code, theirs: rows.map((r) => ({ id: r.id, topic: r.topic, subtopic: r.subtopic })), by });
    }
    plans.push({ a, c, rows });
  }
  if (conflicts.length) return { conflicts, status: 409 };
  const allIds = new Set(plans.flatMap((p) => p.rows.map((r) => r.id)));
  for (const p of plans) for (const e of p.c.entries) if (e.id && !allIds.has(e.id)) {
    // A topic copied from a column that isn't editable here (copy, not move).
    e.id = undefined;
  }
  const meta = new Map<string, string | null>(((await db.topicMeta.findMany({ where: { lectureRowId: { in: Array.from(allIds).concat("none") } } })) as { lectureRowId: string; importance: string | null }[]).map((m) => [m.lectureRowId, m.importance]));
  const homeOf = new Map<string, string>(); // row -> plan key
  const key = (a: Access) => `${a.planCourseId}|${a.plan}`;
  for (const p of plans) for (const r of p.rows) homeOf.set(r.id, key(p.a));
  const target = new Map<string, string>(); // row -> plan key where it is now listed
  for (const p of plans) for (const e of p.c.entries) if (e.id) target.set(e.id, key(p.a));
  const byKey = new Map(plans.map((p) => [key(p.a), p]));

  // Moves between plans: direct when the person owns both; otherwise one linked change.
  const linked: { rowId: string; from: (typeof plans)[number]; to: (typeof plans)[number]; position: number; linkKey: string }[] = [];
  for (const [rowId, to] of Array.from(target.entries())) {
    const from = homeOf.get(rowId)!;
    if (from === to) continue;
    const pf = byKey.get(from)!, pt = byKey.get(to)!;
    if (pf.a.mode === "APPLY" && pt.a.mode === "APPLY") continue;
    linked.push({ rowId, from: pf, to: pt, position: pt.c.entries.findIndex((e) => e.id === rowId), linkKey: randomUUID() });
  }
  const linkedIds = new Set(linked.map((l) => l.rowId));
  const direct: Change[] = [];
  const proposals: { a: Access; items: Item[]; before: Row[]; after: Entry[] }[] = [];
  const own: { a: Access; items: Item[] }[] = [];
  for (const p of plans) {
    const before = p.rows.map((r) => asRow(r, meta));
    let entries = p.c.entries.map((e) => ({ ...e, topic: (e.topic || "").trim(), subtopic: e.subtopic?.trim() || null }));
    const movedTo = new Map<string, string>();
    for (const [rowId, t] of Array.from(target.entries())) if (homeOf.get(rowId) === key(p.a) && t !== key(p.a)) movedTo.set(rowId, byKey.get(t)!.a.planCourseId);
    if (p.a.mode === "APPLY") {
      // Linked moves wait for the other owner: the row stays where it is (here) or doesn't arrive yet (there).
      const stay = linked.filter((l) => l.from === p);
      for (const l of stay) { const at = p.rows.findIndex((r) => r.id === l.rowId); const r = p.rows[at]; entries.splice(Math.min(at, entries.length), 0, { id: r.id, topic: r.topic, subtopic: r.subtopic, importance: (meta.get(r.id) as Level) || null }); }
      entries = entries.filter((e) => !(e.id && linkedIds.has(e.id) && linked.some((l) => l.rowId === e.id && l.to === p)));
      const items = intentItems(before, entries, movedTo);
      if (items.length || linked.some((l) => l.from === p || l.to === p)) direct.push({ courseId: p.a.planCourseId, source: p.a.plan, entries });
      const mine = linked.filter((l) => l.from === p || l.to === p).map((l): Item => l.from === p
        ? { kind: "MOVE_OUT", lectureRowId: l.rowId, topic: p.rows.find((r) => r.id === l.rowId)!.topic, subtopic: null, position: 0, detail: { toCourseId: l.to.a.planCourseId, toSource: l.to.a.plan }, linkKey: l.linkKey }
        : { kind: "MOVE_IN", lectureRowId: l.rowId, topic: l.from.rows.find((r) => r.id === l.rowId)!.topic, subtopic: l.from.rows.find((r) => r.id === l.rowId)!.subtopic, position: l.position, detail: { fromCourseId: l.from.a.planCourseId }, linkKey: l.linkKey });
      if (mine.length) own.push({ a: p.a, items: mine });
    } else {
      const items = intentItems(before, entries, movedTo).map((it) => {
        const l = linked.find((x) => x.rowId === it.lectureRowId && (it.kind === "MOVE_IN" || it.kind === "MOVE_OUT"));
        return l ? { ...it, linkKey: l.linkKey, detail: { ...it.detail, ...(it.kind === "MOVE_OUT" ? { toCourseId: l.to.a.planCourseId, toSource: l.to.a.plan } : {}) } } : it;
      });
      if (items.length) proposals.push({ a: p.a, items, before, after: entries });
    }
  }
  const applied = direct.length ? await writePlans(direct, user, { sessionId: body.sessionId || null }) : { ok: true as const };
  if ("error" in applied) return { error: applied.error, status: 400 };
  const sent: { code: string; to: string; items: number; template?: boolean }[] = [];
  const proposalOf = new Map<string, string>();
  for (const p of proposals) {
    const id = await createProposal(user, chairmanId, p.a, p.items, p.before, p.after, body.note || null, "EDIT");
    proposalOf.set(p.a.planCourseId, id);
    sent.push({ code: p.a.code, to: p.a.toName, items: p.items.length, template: p.a.mode === "TEMPLATE" });
    void id;
  }
  for (const o of own) {
    // The person's own side of a linked move: agreed already; it happens when the other owner agrees.
    await db.planProposal.create({ data: { id: randomUUID(), chairmanId, courseId: o.a.planCourseId, source: o.a.plan, kind: "EDIT", fromUserId: user.id, toUserId: user.id, status: "ACCEPTED", note: "Your side of a move between courses", respondedById: user.id, respondedAt: new Date() } }).then((pp: { id: string }) =>
      db.planProposalItem.createMany({ data: o.items.map((it, i) => ({ id: randomUUID(), proposalId: pp.id, kind: it.kind, lectureRowId: it.lectureRowId, topic: it.topic, subtopic: it.subtopic, detailJson: JSON.stringify(it.detail), position: it.position ?? i, linkKey: it.linkKey || null, status: "ACCEPTED", decidedAt: new Date() })) }));
  }
  // Topic links drawn in the workspace: each is a link proposal (both SEs, then the PL…) and, in the proposal of each
  // course whose Subject Expert has to agree, a LINK item — so the SE sees it with the other changes.
  const linkErrors: string[] = []; let linksSent = 0;
  for (const l of (body.links || []).slice(0, 100)) {
    const { proposeLink } = await import("./topicLinkPlan");
    const r = await proposeLink(user, l);
    if ("error" in r && r.error) { linkErrors.push(`${l.fromCode || ""} → ${l.toCode || ""}: ${r.error}`); continue; }
    linksSent++;
    const lp = (r as { proposal: { id: string; fromCourseId: string; toCourseId: string; fromCode: string; toCode: string; fromTopic: string; toTopic: string; level: string; action: string; seFromAt: Date | null; seToAt: Date | null } }).proposal;
    for (const [cid, done] of [[lp.fromCourseId, lp.seFromAt], [lp.toCourseId, lp.seToAt]] as const) {
      if (done) continue; // the saver is that course's SE (or it has none)
      const a = await accessFor(user, cid);
      if (!a || a.mode === "FOLLOWER" || a.mode === "VIEW") continue;
      let pid = proposalOf.get(a.planCourseId);
      if (!pid) { pid = randomUUID(); await db.planProposal.create({ data: { id: pid, chairmanId, courseId: a.planCourseId, source: a.plan, kind: "EDIT", fromUserId: user.id, toUserId: a.toUserId, note: body.note?.slice(0, 2000) || null } }); proposalOf.set(a.planCourseId, pid); sent.push({ code: a.code, to: a.toName, items: 0 });
        await notifyUsers([a.toUserId], { kind: "TOPIC_SUGGESTION", title: `${user.name} proposes a topic link with ${a.code}`, body: `${lp.fromCode} "${lp.fromTopic}" → ${lp.toCode} "${lp.toTopic}"`, href: INBOX, exceptId: user.id }); }
      await db.planProposalItem.create({ data: { id: randomUUID(), proposalId: pid, kind: "LINK", topic: cid === lp.toCourseId ? lp.toTopic : lp.fromTopic, detailJson: JSON.stringify({ linkProposalId: lp.id, fromCode: lp.fromCode, toCode: lp.toCode, fromTopic: lp.fromTopic, toTopic: lp.toTopic, level: lp.level, action: lp.action }), position: 9999 } });
      const s2 = sent.find((x) => x.code === a.code); if (s2) s2.items++;
    }
  }
  await db.workspaceState.updateMany({ where: { userId: user.id }, data: { draftJson: null, draftAt: null } }).catch(() => null);
  await writeAuditLog({ actorUserId: user.id, action: "TOPIC_WORKSPACE_SAVED", entityType: "User", entityId: user.id, metadata: { applied: direct.length, proposals: proposals.length, linkedMoves: linked.length } }).catch(() => null);
  return { ok: true, applied: direct.map((d) => plans.find((p) => p.a.planCourseId === d.courseId)?.a.code || ""), proposals: sent, waitingMoves: linked.length, linksSent, linkErrors, status: 200 };
}

export async function createProposal(user: Who, chairmanId: string, a: Access, items: Item[], before: Row[], after: Entry[], note: string | null, kind: "EDIT" | "SHORT_OF_TIME") {
  const id = randomUUID();
  await db.planProposal.create({ data: { id, chairmanId, courseId: a.planCourseId, source: a.plan === "INSTRUCTOR" && kind === "SHORT_OF_TIME" ? "INSTRUCTOR" : a.plan, kind, fromUserId: user.id, toUserId: a.toUserId, note: note?.slice(0, 2000) || null, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(after) } });
  await db.planProposalItem.createMany({ data: items.map((it, i) => ({ id: randomUUID(), proposalId: id, kind: it.kind, lectureRowId: it.lectureRowId, topic: it.topic.slice(0, 300), subtopic: it.subtopic?.slice(0, 500) || null, detailJson: JSON.stringify(it.detail || {}), position: it.position ?? i, linkKey: it.linkKey || null })) });
  if (a.mode === "TEMPLATE" && kind === "EDIT" && a.toUserId === user.id) {
    // Their own approved plan: accepting it is theirs, so the Template Change Request goes to the OMC at once.
    await respondProposal(user, id, { acceptAll: true });
  } else {
    await notifyUsers([a.toUserId], {
      kind: "TOPIC_SUGGESTION", title: `${user.name} proposes ${items.length} change(s) to ${a.code}${kind === "SHORT_OF_TIME" ? " (short of time)" : ""}`,
      body: items.slice(0, 4).map((i) => itemLine(i)).join(" · ") + (items.length > 4 ? " …" : ""), href: INBOX, exceptId: user.id,
    });
  }
  return id;
}

// ------------------------------------------------------------------------------------------------ answering proposals
export type ProposalRow = { id: string; chairmanId: string; courseId: string; source: Src; kind: string; fromUserId: string; toUserId: string | null; note: string | null; status: string; reason: string | null; beforeJson: string; afterJson: string; templateRequestId: string | null; respondedById: string | null; respondedAt: Date | null; createdAt: Date; remindedAt: Date | null; escalatedAt: Date | null };
export type ProposalItemRow = { id: string; proposalId: string; kind: Item["kind"]; lectureRowId: string | null; topic: string; subtopic: string | null; detailJson: string; position: number; linkKey: string | null; status: string; reason: string | null };
const toItem = (r: ProposalItemRow): Item => ({ kind: r.kind, lectureRowId: r.lectureRowId, topic: r.topic, subtopic: r.subtopic, position: r.position, detail: JSON.parse(r.detailJson || "{}"), linkKey: r.linkKey });

export async function canAnswer(user: Who, p: ProposalRow) {
  if (p.toUserId === user.id) return true;
  const c = await prisma.course.findUnique({ where: { id: p.courseId }, select: { subjectExpertId: true, coordinatorId: true } });
  return !!c && (c.subjectExpertId === user.id || (!c.subjectExpertId && c.coordinatorId === user.id));
}

/** Accept all, some items, or reject (with a reason). Linked moves happen once every side has agreed. */
export async function respondProposal(user: Who, id: string, d: { acceptAll?: boolean; accept?: string[]; reject?: string[]; rejectAll?: boolean; reason?: string }) {
  const p = (await db.planProposal.findUnique({ where: { id } }).catch(() => null)) as ProposalRow | null;
  if (!p) return { error: "not found", status: 404 };
  if (!["PENDING", "PARTIAL"].includes(p.status)) return { error: "This proposal has already been answered.", status: 409 };
  if (!(await canAnswer(user, p))) return { error: "Only the Subject Expert who owns this plan answers its proposals.", status: 403 };
  const items = (await db.planProposalItem.findMany({ where: { proposalId: id }, orderBy: { position: "asc" } })) as ProposalItemRow[];
  const open = items.filter((i) => i.status === "PENDING");
  const reason = (d.reason || "").trim().slice(0, 1000);
  const accept = d.rejectAll ? [] : d.acceptAll ? open.map((i) => i.id) : open.filter((i) => (d.accept || []).includes(i.id)).map((i) => i.id);
  const reject = d.rejectAll ? open.map((i) => i.id) : open.filter((i) => (d.reject || []).includes(i.id)).map((i) => i.id);
  if (!accept.length && !reject.length) return { error: "Nothing chosen.", status: 400 };
  if (reject.length && reason.length < 3) return { error: "Give the reason for rejecting.", status: 400 };
  const course = await prisma.course.findUnique({ where: { id: p.courseId }, select: { id: true, code: true, templateStatus: true } });
  if (!course) return { error: "course not found", status: 404 };
  const now = new Date();
  // LINK items are answered on their link proposal (this SE's agreement; the Program Lead and OMC follow).
  const { answerLink } = await import("./topicLinkPlan");
  for (const it of items.filter((i) => i.kind === "LINK" && (accept.includes(i.id) || reject.includes(i.id)))) {
    const lid = JSON.parse(it.detailJson || "{}").linkProposalId;
    const r = await answerLink(user, String(lid || ""), accept.includes(it.id), reason);
    if ("error" in r && r.error && !/already been decided/.test(String(r.error))) return { error: `Topic link: ${r.error}`, status: (r as { status?: number }).status || 400 };
  }
  if (reject.length) await db.planProposalItem.updateMany({ where: { id: { in: reject } }, data: { status: "REJECTED", reason, decidedAt: now } });
  for (const r of items.filter((i) => reject.includes(i.id) && i.linkKey)) await db.planProposalItem.updateMany({ where: { linkKey: r.linkKey, status: { in: ["PENDING", "ACCEPTED"] } }, data: { status: "REJECTED", reason: `The other course's owner declined: ${reason}`, decidedAt: now } });

  const chosen = items.filter((i) => accept.includes(i.id));
  let template: string | null = null;
  if (chosen.length) {
    if (p.kind === "EDIT" && p.source === "SE" && course.templateStatus === "approved") {
      // An OMC-approved plan: accepting raises a Template Change Request; the changes apply once the OMC approves it.
      const tcr = await prisma.templateChangeRequest.create({ data: { courseId: course.id, requestedById: user.id, reason: `Topic Workspace: ${chosen.length} change(s) proposed${p.fromUserId !== user.id ? ` by ${(await prisma.user.findUnique({ where: { id: p.fromUserId }, select: { name: true } }))?.name || "a colleague"}` : ""} — ${chosen.slice(0, 5).map((i) => itemLine(toItem(i))).join("; ")}`.slice(0, 2000), changesJson: JSON.stringify({ planProposalId: p.id, items: chosen.map(toItem) }) } as never });
      template = tcr.id;
      await db.planProposalItem.updateMany({ where: { id: { in: accept } }, data: { status: "ACCEPTED", decidedAt: now } });
      await db.planProposal.update({ where: { id }, data: { status: "AWAITING_OMC", templateRequestId: tcr.id, respondedById: user.id, respondedAt: now } });
      await notifyUsers([p.fromUserId], { kind: "TOPIC_SUGGESTION", title: `${course.code}: your proposal went to the OMC`, body: "The plan is approved by the OMC, so a Template Change Request was raised; the changes apply when the OMC approves it.", href: INBOX, exceptId: user.id });
      return { ok: true, template, status: 200 };
    }
    await db.planProposalItem.updateMany({ where: { id: { in: accept } }, data: { status: "ACCEPTED", decidedAt: now } });
    const res = await applyAccepted(user, p, chosen);
    if (res && "error" in res) {
      await db.planProposalItem.updateMany({ where: { id: { in: accept } }, data: { status: "PENDING", decidedAt: null } });
      return { error: res.error, status: 400 };
    }
  }
  const after = (await db.planProposalItem.findMany({ where: { proposalId: id } })) as ProposalItemRow[];
  const pending = after.filter((i) => i.status === "PENDING").length, acc = after.filter((i) => i.status === "ACCEPTED").length, rej = after.filter((i) => i.status === "REJECTED").length;
  const status = pending ? (acc || rej ? "PARTIAL" : "PENDING") : !acc ? "REJECTED" : rej ? "PARTIAL" : "ACCEPTED";
  await db.planProposal.update({ where: { id }, data: { status: pending ? "PARTIAL" : status, reason: reason || p.reason, respondedById: user.id, respondedAt: now } });
  if (p.fromUserId !== user.id) await notifyUsers([p.fromUserId], {
    kind: "TOPIC_SUGGESTION", title: `${course.code}: ${acc ? `${acc} of ${after.length} change(s) accepted` : "your proposal was rejected"}`,
    body: `${user.name}${rej ? ` rejected ${rej}${reason ? `: ${reason}` : ""}` : " accepted it"}.`, href: INBOX, exceptId: user.id,
  });
  await writeAuditLog({ actorUserId: user.id, action: "PLAN_PROPOSAL_ANSWERED", entityType: "Course", entityId: course.id, metadata: { proposalId: id, accepted: accept.length, rejected: reject.length } }).catch(() => null);
  return { ok: true, status: 200 };
}

/** Applies accepted items: plain ones to the plan now; linked moves when all their sides are agreed. */
export async function applyAccepted(user: Who, p: ProposalRow, chosen: ProposalItemRow[]) {
  const plain = chosen.filter((i) => !i.linkKey && i.kind !== "DROP" && i.kind !== "SHORTEN" && i.kind !== "LINK");
  if (plain.length) {
    const rows = await planRows(p.courseId, p.source);
    const meta = new Map<string, string | null>(((await db.topicMeta.findMany({ where: { lectureRowId: { in: rows.map((r) => r.id).concat("none") } } })) as { lectureRowId: string; importance: string | null }[]).map((m) => [m.lectureRowId, m.importance]));
    const its = plain.map(toItem).filter((it) => it.kind !== "MOVE_IN" || rows.some((r) => r.id === it.lectureRowId) === false);
    const entries = applyItems(rows.map((r) => asRow(r, meta)), its).filter((e) => !e.id || rows.some((r) => r.id === e.id));
    const res = await writePlans([{ courseId: p.courseId, source: p.source, entries }], user, { label: "Proposal accepted" });
    if ("error" in res) return res;
  }
  if (p.kind === "SHORT_OF_TIME") await applyShortOfTime(user, p, chosen.filter((i) => i.kind === "DROP" || i.kind === "SHORTEN"));
  for (const k of Array.from(new Set(chosen.filter((i) => i.linkKey).map((i) => i.linkKey!)))) {
    const r = await executeLinkedMove(user, k);
    if (r && "error" in r) return r;
  }
  return null;
}

/** A move between two courses: done once both sides are accepted — the row leaves one plan and joins the other in one step. */
export async function executeLinkedMove(user: Who, linkKey: string) {
  const items = (await db.planProposalItem.findMany({ where: { linkKey } })) as ProposalItemRow[];
  if (items.some((i) => i.status === "REJECTED") || items.some((i) => i.status !== "ACCEPTED")) return null;
  const moveIn = items.find((i) => i.kind === "MOVE_IN"), moveOut = items.find((i) => i.kind === "MOVE_OUT");
  if (!moveIn || !moveOut || JSON.parse(moveIn.detailJson || "{}").done) return null;
  const pin = (await db.planProposal.findUnique({ where: { id: moveIn.proposalId } })) as ProposalRow;
  const pout = (await db.planProposal.findUnique({ where: { id: moveOut.proposalId } })) as ProposalRow;
  const row = await prisma.lectureRow.findUnique({ where: { id: moveIn.lectureRowId || "none" }, select: { id: true, courseId: true, source: true, topic: true, subtopic: true } });
  if (!row) return { error: "The topic of that move no longer exists." };
  if (row.courseId !== pout.courseId) return null; // already moved
  const [src, dst] = await Promise.all([planRows(pout.courseId, pout.source), planRows(pin.courseId, pin.source)]);
  const dstEntries: Entry[] = dst.map((r) => ({ id: r.id, topic: r.topic, subtopic: r.subtopic }));
  dstEntries.splice(Math.max(0, Math.min(moveIn.position, dstEntries.length)), 0, { id: row.id, topic: row.topic, subtopic: row.subtopic });
  const res = await writePlans([
    { courseId: pout.courseId, source: pout.source, entries: src.filter((r) => r.id !== row.id).map((r) => ({ id: r.id, topic: r.topic, subtopic: r.subtopic })) },
    { courseId: pin.courseId, source: pin.source, entries: dstEntries },
  ], user, { label: "Move between courses agreed" });
  if ("error" in res) return res;
  await db.planProposalItem.update({ where: { id: moveIn.id }, data: { detailJson: JSON.stringify({ ...JSON.parse(moveIn.detailJson || "{}"), done: true }) } });
  await notifyUsers([pin.fromUserId, pout.fromUserId, pin.toUserId, pout.toUserId], { kind: "TOPIC_SUGGESTION", title: `"${row.topic}" moved`, body: "Both courses' owners agreed; the topic is in its new course and needs to be mapped to a CLO there.", href: INBOX, exceptId: user.id });
  return null;
}

/** Changes accepted on an approved plan apply once the OMC approves the Template Change Request. */
export async function applyAfterTemplateApproval(templateRequestId: string, actor: Who) {
  const ps = (await db.planProposal.findMany({ where: { templateRequestId, status: "AWAITING_OMC" } }).catch(() => [])) as ProposalRow[];
  for (const p of ps) {
    const chosen = ((await db.planProposalItem.findMany({ where: { proposalId: p.id, status: "ACCEPTED" } })) as ProposalItemRow[]);
    const res = await applyAccepted(actor, p, chosen);
    await db.planProposal.update({ where: { id: p.id }, data: { status: res && "error" in res ? "PARTIAL" : "ACCEPTED", reason: res && "error" in res ? res.error : p.reason } });
    await notifyUsers([p.fromUserId, p.toUserId], { kind: "TOPIC_SUGGESTION", title: "The OMC approved the plan change", body: res && "error" in res ? `Some changes could not be applied: ${res.error}` : "The accepted topic changes are now in the plan.", href: INBOX });
  }
  return ps.length;
}

// ------------------------------------------------------------------------------------------------ short of time
async function applyShortOfTime(user: Who, p: ProposalRow, chosen: ProposalItemRow[]) {
  const course = await prisma.course.findUnique({ where: { id: p.courseId }, select: { id: true, code: true, coordinatorId: true } });
  if (!course) return;
  const chairmanId = p.chairmanId;
  const key = await import("./courseKeys").then((m) => m.keyOf(course.id));
  const links = key ? await prisma.topicPrerequisite.findMany({ where: { coordinatorId: key.coordinatorId, prereqCourseCode: key.code, orphanedAt: null } }).catch(() => []) : [];
  const taught = new Set((await prisma.lectureRow.findMany({ where: { courseId: course.id }, select: { topic: true } })).map((r) => norm(r.topic)));
  for (const it of chosen) {
    if (!it.lectureRowId) continue;
    await setMeta(it.lectureRowId, course.id, { notTaught: true, notTaughtNote: it.kind === "SHORTEN" ? "Shortened (one lecture less)" : "Dropped — short of time" }, user.id);
    if (it.kind !== "DROP") continue;
    // A dropped prerequisite topic: the teacher of the dependent course is told what to do about it.
    // The links of this topic: its exact wording; a looser match only for a link whose exact wording isn't taught
    // anywhere in the plan (so a similar-looking topic never takes another topic's link).
    const exact = links.filter((x) => norm(x.prereqTopic) === norm(it.topic));
    const loose = links.filter((x) => !taught.has(norm(x.prereqTopic)) && sameTopic(x.prereqTopic, it.topic));
    for (const l of exact.length ? exact : loose) {
      const target = await prisma.course.findFirst({ where: { coordinatorId: l.coordinatorId, code: l.dependentCourseCode }, orderBy: [{ isOffered: "desc" }, { createdAt: "desc" }], select: { id: true, instructorId: true, subjectExpertId: true } });
      const action = l.strength === "STRONG" ? "remediation" : l.strength === "MILD" ? "full review" : "recap";
      const recommendation = `"${it.topic}" was planned but not taught in ${course.code} (the instructor was short of time; approved by the Subject Expert). It is a ${l.strength.toLowerCase()} prerequisite for "${l.dependentTopic}" — plan a ${action} before teaching it.`;
      await prisma.topicFollowUp.upsert({
        where: { sourceCourseId_kind_topic_targetCourseCode: { sourceCourseId: course.id, kind: "MISSED", topic: it.topic, targetCourseCode: l.dependentCourseCode } },
        create: { chairmanId, coordinatorId: l.coordinatorId, sourceCourseId: course.id, sourceCourseCode: course.code, topic: it.topic, kind: "MISSED", targetCourseId: target?.id || null, targetCourseCode: l.dependentCourseCode, targetTopic: l.dependentTopic, recommendation, assignedToId: target?.instructorId || target?.subjectExpertId || null, createdById: user.id },
        update: { recommendation, status: "OPEN", targetTopic: l.dependentTopic },
      }).catch(() => null);
      await notifyUsers([target?.instructorId, target?.subjectExpertId], { kind: "FOLLOW_UP", title: `${l.dependentCourseCode}: plan a ${action} of "${it.topic}"`, body: recommendation, href: "/follow-ups", exceptId: user.id });
    }
  }
}

// ------------------------------------------------------------------------------------------------ state, draft, presence, undo
export async function getState(userId: string) {
  const s = await db.workspaceState.findUnique({ where: { userId } }).catch(() => null);
  return { open: s ? JSON.parse(s.openJson || "[]") : [], draft: s?.draftJson ? JSON.parse(s.draftJson) : null, draftAt: s?.draftAt || null };
}
export async function saveState(userId: string, open: unknown) {
  const openJson = JSON.stringify(Array.isArray(open) ? open.slice(0, 40) : []);
  await db.workspaceState.upsert({ where: { userId }, create: { userId, openJson }, update: { openJson, updatedAt: new Date() } });
}
export async function saveDraft(userId: string, draft: unknown) {
  const draftJson = draft ? JSON.stringify(draft).slice(0, 2_000_000) : null;
  await db.workspaceState.upsert({ where: { userId }, create: { userId, draftJson, draftAt: draftJson ? new Date() : null }, update: { draftJson, draftAt: draftJson ? new Date() : null, updatedAt: new Date() } });
}
export async function touchPresence(user: Who, courseIds: string[]) {
  for (const courseId of courseIds.slice(0, 40)) await db.workspacePresence.upsert({ where: { userId_courseId: { userId: user.id, courseId } }, create: { userId: user.id, courseId }, update: { at: new Date() } }).catch(() => null);
  const since = new Date(Date.now() - 2 * 60000);
  const rows = (await db.workspacePresence.findMany({ where: { courseId: { in: courseIds.concat("none") }, at: { gte: since }, userId: { not: user.id } } }).catch(() => [])) as { userId: string; courseId: string }[];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId).concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return rows.map((r) => ({ courseId: r.courseId, name: names.get(r.userId) || "someone" }));
}

/** Undo everything this person saved in one workspace session (each plan back to how it was before), if nobody changed it since. */
export async function undoSession(user: Who, sessionId: string) {
  const vs = (await db.topicPlanVersion.findMany({ where: { byUserId: user.id, sessionId, undone: false }, orderBy: { at: "asc" } }).catch(() => [])) as { id: string; courseId: string; source: Src; rowsJson: string; afterJson: string | null }[];
  if (!vs.length) return { error: "Nothing to undo in this session.", status: 400 };
  const first = new Map<string, (typeof vs)[number]>(), last = new Map<string, (typeof vs)[number]>();
  for (const v of vs) { const k = `${v.courseId}|${v.source}`; if (!first.has(k)) first.set(k, v); last.set(k, v); }
  const changes: Change[] = []; const skipped: string[] = [];
  for (const [k, v] of Array.from(first.entries())) {
    const now = await prisma.lectureRow.findMany({ where: { courseId: v.courseId, source: v.source }, select: { id: true, topic: true, subtopic: true }, orderBy: { lectureNumber: "asc" } });
    const lv = last.get(k)!;
    if (lv.afterJson && layoutHash(JSON.parse(lv.afterJson)) !== layoutHash(now)) { skipped.push(v.courseId); continue; }
    const snap = JSON.parse(v.rowsJson) as { id: string; topic: string; subtopic: string | null; cloId: string | null; bloomLevel: string | null; teachingMethod: string | null; teachingMaterials: string | null }[];
    const exists = new Set((await prisma.lectureRow.findMany({ where: { id: { in: snap.map((s) => s.id).concat("none") } }, select: { id: true, courseId: true, source: true } })).filter((r) => r.courseId === v.courseId && r.source === v.source).map((r) => r.id));
    changes.push({ courseId: v.courseId, source: v.source, entries: snap.map((s) => exists.has(s.id) ? { id: s.id, topic: s.topic, subtopic: s.subtopic } : { topic: s.topic, subtopic: s.subtopic, restore: { cloId: s.cloId, bloomLevel: s.bloomLevel, teachingMethod: s.teachingMethod, teachingMaterials: s.teachingMaterials } }) });
  }
  if (!changes.length) return { error: "Someone changed these plans since; nothing was undone.", status: 409 };
  // A row moved out of one plan and back must be listed only once: the earliest plan that had it keeps it.
  const seen = new Set<string>();
  for (const c of changes) c.entries = c.entries.map((e) => (e.id && seen.has(e.id) ? { topic: e.topic, subtopic: e.subtopic } : (e.id && seen.add(e.id), e)));
  const res = await writePlans(changes, user, { label: "Undo of a workspace session" });
  if ("error" in res) return { error: res.error, status: 400 };
  await db.topicPlanVersion.updateMany({ where: { id: { in: vs.map((v) => v.id) } }, data: { undone: true } });
  const codes = await prisma.course.findMany({ where: { id: { in: skipped.concat("none") } }, select: { code: true } });
  return { ok: true, restored: changes.length, skipped: codes.map((c) => c.code), status: 200 };
}

/** The plan of the same course in the previous offering, and what changed since. */
export async function compareWithLast(courseId: string, source: Src) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true, coordinatorId: true, createdAt: true } });
  if (!c) return null;
  const prev = await prisma.course.findFirst({ where: { coordinatorId: c.coordinatorId, code: c.code, id: { not: courseId }, createdAt: { lt: c.createdAt }, lectureRows: { some: { source: "INSTRUCTOR" } } }, orderBy: { createdAt: "desc" }, select: { id: true, offeredTermName: true, offeredTermYear: true, batch: { select: { batchName: true } } } })
    || await prisma.course.findFirst({ where: { coordinatorId: c.coordinatorId, code: c.code, id: { not: courseId }, createdAt: { lt: c.createdAt } }, orderBy: { createdAt: "desc" }, select: { id: true, offeredTermName: true, offeredTermYear: true, batch: { select: { batchName: true } } } });
  const now = await prisma.lectureRow.findMany({ where: { courseId, source }, select: { topic: true }, orderBy: { lectureNumber: "asc" } });
  const versions = ((await db.topicPlanVersion.findMany({ where: { courseId, source }, orderBy: { at: "desc" }, take: 20 }).catch(() => [])) as { id: string; at: Date; byUserId: string; label: string | null; undone: boolean; sessionId: string | null }[]);
  const people = new Map((await prisma.user.findMany({ where: { id: { in: versions.map((v) => v.byUserId).concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const history = versions.map((v) => ({ id: v.id, at: v.at, by: people.get(v.byUserId) || "", label: v.label || "", undone: v.undone, sessionId: v.sessionId }));
  if (!prev) return { previous: null, added: [], removed: [], moved: [], history };
  let then = await prisma.lectureRow.findMany({ where: { courseId: prev.id, source: "INSTRUCTOR" }, select: { topic: true }, orderBy: { lectureNumber: "asc" } });
  if (!then.length) then = await prisma.lectureRow.findMany({ where: { courseId: prev.id, source: "SE" }, select: { topic: true }, orderBy: { lectureNumber: "asc" } });
  const has = (list: { topic: string }[], t: string) => { const i = list.findIndex((x) => norm(x.topic) === norm(t)); return i >= 0 ? i : list.findIndex((x) => sameTopic(x.topic, t)); };
  return {
    previous: `${prev.offeredTermName || ""} ${prev.offeredTermYear || ""} ${prev.batch?.batchName || ""}`.trim() || "previous offering",
    added: now.filter((x) => has(then, x.topic) < 0).map((x) => x.topic),
    removed: then.filter((x) => has(now, x.topic) < 0).map((x) => x.topic),
    moved: now.map((x, i) => ({ topic: x.topic, now: i + 1, then: has(then, x.topic) + 1 })).filter((x) => x.then > 0 && Math.abs(x.then - x.now) >= 3),
    history,
  };
}

// ------------------------------------------------------------------------------------------------ the proposals inbox
export async function proposalsFor(user: Who) {
  try {
    const [received, sent] = await Promise.all([
      db.planProposal.findMany({ where: { toUserId: user.id, NOT: { fromUserId: user.id, status: "ACCEPTED" } }, orderBy: { createdAt: "desc" }, take: 150 }) as Promise<ProposalRow[]>,
      db.planProposal.findMany({ where: { fromUserId: user.id, NOT: { toUserId: user.id } }, orderBy: { createdAt: "desc" }, take: 150 }) as Promise<ProposalRow[]>,
    ]);
    const all = received.concat(sent);
    const items = (await db.planProposalItem.findMany({ where: { proposalId: { in: all.map((p) => p.id).concat("none") } }, orderBy: { position: "asc" } })) as ProposalItemRow[];
    const courseIds = Array.from(new Set(all.map((p) => p.courseId).concat(items.flatMap((i) => { const d = JSON.parse(i.detailJson || "{}"); return [d.fromCourseId, d.toCourseId].filter(Boolean); }))));
    const courses = new Map((await prisma.course.findMany({ where: { id: { in: courseIds.concat("none") } }, select: { id: true, code: true, title: true, templateStatus: true } })).map((c) => [c.id, c]));
    const people = new Map((await prisma.user.findMany({ where: { id: { in: all.flatMap((p) => [p.fromUserId, p.toUserId || ""]).concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    const linkState = new Map<string, string>();
    for (const k of Array.from(new Set(items.map((i) => i.linkKey).filter(Boolean)))) {
      const sib = (await db.planProposalItem.findMany({ where: { linkKey: k } })) as ProposalItemRow[];
      linkState.set(k!, sib.some((s) => s.status === "REJECTED") ? "declined by the other side" : sib.every((s) => s.status === "ACCEPTED") ? "both agreed" : "waiting for the other course's owner");
    }
    const shape = (p: ProposalRow) => {
      const c = courses.get(p.courseId);
      return {
        id: p.id, course: c ? `${c.code} — ${c.title}` : "", courseId: p.courseId, kind: p.kind, status: p.status, note: p.note, reason: p.reason, from: people.get(p.fromUserId) || "", to: people.get(p.toUserId || "") || "",
        createdAt: p.createdAt, approved: c?.templateStatus === "approved", template: p.templateRequestId,
        before: JSON.parse(p.beforeJson || "[]") as Row[], after: JSON.parse(p.afterJson || "[]") as Entry[],
        items: items.filter((i) => i.proposalId === p.id).map((i) => ({ id: i.id, kind: i.kind, status: i.status, reason: i.reason, lectureRowId: i.lectureRowId, line: itemLine(toItem(i), (cid) => courses.get(cid)?.code || "another course"), linked: i.linkKey ? linkState.get(i.linkKey) || "" : "" })),
        days: Math.floor((Date.now() - +new Date(p.createdAt)) / 864e5),
      };
    };
    return { received: received.map(shape), sent: sent.map(shape), missingTable: false };
  } catch {
    return { received: [], sent: [], missingTable: true };
  }
}

/** Daily: reminders for proposals unanswered for `remindDays`; after `escalateDays` the Program Lead is told. */
export async function proposalReminders(now = new Date()) {
  const open = ((await db.planProposal.findMany({ where: { status: { in: ["PENDING", "PARTIAL"] } }, take: 2000 }).catch(() => [])) as ProposalRow[]).filter((p) => p.toUserId !== p.fromUserId);
  let reminded = 0, escalated = 0;
  const settings = new Map<string, Awaited<ReturnType<typeof planSettings>>>();
  for (const p of open) {
    if (!settings.has(p.chairmanId)) settings.set(p.chairmanId, await planSettings(p.chairmanId));
    const s = settings.get(p.chairmanId)!;
    const days = (+now - +new Date(p.createdAt)) / 864e5;
    const c = await prisma.course.findUnique({ where: { id: p.courseId }, select: { code: true, coordinatorId: true } });
    if (days >= s.escalateDays && !p.escalatedAt) {
      await notifyUsers([c?.coordinatorId], { kind: "TOPIC_SUGGESTION", title: `${c?.code}: a topic proposal has waited ${Math.floor(days)} days`, body: "Nobody has answered it yet. Please follow up with the course's Subject Expert.", href: "/topic-prerequisites" });
      await db.planProposal.update({ where: { id: p.id }, data: { escalatedAt: now } }); escalated++;
    } else if (days >= s.remindDays && (!p.remindedAt || (+now - +new Date(p.remindedAt)) / 864e5 >= s.remindDays)) {
      await notifyUsers([p.toUserId], { kind: "TOPIC_SUGGESTION", title: `Reminder: a topic proposal for ${c?.code} is waiting (${Math.floor(days)} days)`, body: "Accept it, accept some of it, or reject it with a reason.", href: INBOX });
      await db.planProposal.update({ where: { id: p.id }, data: { remindedAt: now } }); reminded++;
    }
  }
  return { reminded, escalated };
}

export { diffPlan, applyItems };
