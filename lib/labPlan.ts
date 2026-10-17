import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { norm } from "./teachingAnalysis";
import { loadLabCourse } from "./labAccess";
import { getAuthenticatedUser } from "./session";

// The lab plan of a lab course: each lab task (session) has a week and the theory lecture topics it practises.
// The Lab Engineer names the tasks and uploads the manual and its solution before the semester; the instructor who
// teaches the course (the lab lead) reviews and approves them. When the lecture plan or the lab plan changes in a way
// that matters to the other side (a topic renamed or removed, a lecture moved to another week, a lab moved or relinked),
// the instructor and the Lab Engineer are both told, as with topic prerequisites.

const ldb = prisma as unknown as Record<string, any>;
export const LAB_PLAN_HINT = "Not set up yet — the Super User needs to run prisma/migration_lab_plan.sql.";

export type Lecture = { lectureNumber: number; week: number; topic: string };
export type TopicRef = { lectureNumber: number; topic: string };
export type LabTask = { labNumber: number; title: string; week: number | null; topics: TopicRef[] };
export type LabFile = { versionId: string; version: number; kind: "MANUAL" | "SOLUTION"; fileName: string; fileUrl: string; note: string | null; by: string; at: string; status: string; reviewNote: string | null; reviewedBy: string | null };
export type SyncIssue = { level: "bad" | "warn"; labNumber: number | null; text: string };

const parse = <T,>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };

/** The theory course's lecture plan: the instructor's copy once it exists, else the Subject Expert's. */
export async function theoryLectures(theoryId: string | null): Promise<Lecture[]> {
  if (!theoryId) return [];
  const pick = (source: string) => prisma.lectureRow.findMany({ where: { courseId: theoryId, source }, orderBy: { lectureNumber: "asc" }, select: { lectureNumber: true, week: true, topic: true } });
  const ins = await pick("INSTRUCTOR");
  return ins.length ? ins : pick("SE");
}

/** Where a linked topic sits in the plan now: matched by topic text first (so a move is followed), then by lecture number. */
export function resolveTopic(ref: TopicRef, lectures: Lecture[]): Lecture | null {
  const t = norm(ref.topic);
  return lectures.find((l) => norm(l.topic) === t) || null;
}

export async function labTasks(labId: string): Promise<LabTask[]> {
  const [manuals, plans] = await Promise.all([
    prisma.labManual.findMany({ where: { courseId: labId }, orderBy: { labNumber: "asc" }, select: { labNumber: true, title: true } }),
    ldb.labTaskPlan.findMany({ where: { labCourseId: labId } }).catch(() => []) as Promise<{ labNumber: number; week: number | null; topicsJson: string }[]>,
  ]);
  const nums = Array.from(new Set([...manuals.map((m) => m.labNumber), ...plans.map((p) => p.labNumber)])).sort((a, b) => a - b);
  return nums.map((n) => {
    const p = plans.find((x) => x.labNumber === n);
    return { labNumber: n, title: manuals.find((m) => m.labNumber === n)?.title || `Lab ${n}`, week: p?.week ?? null, topics: parse<TopicRef[]>(p?.topicsJson, []) };
  });
}

export function syncIssues(tasks: LabTask[], lectures: Lecture[], hasTheory: boolean): SyncIssue[] {
  const out: SyncIssue[] = [];
  if (!hasTheory) return [{ level: "warn", labNumber: null, text: "No theory course was found for this lab (its code should be the theory code followed by -L), so lab tasks cannot be matched with lecture topics." }];
  if (!tasks.length) out.push({ level: "bad", labNumber: null, text: "No lab task has been named yet. Name each lab task and link it to the lecture topics it practises before the semester starts." });
  for (const t of tasks) {
    if (t.week == null) out.push({ level: "warn", labNumber: t.labNumber, text: `Lab ${t.labNumber} has no week set.` });
    if (!t.topics.length) { out.push({ level: "warn", labNumber: t.labNumber, text: `Lab ${t.labNumber} is not linked to any lecture topic.` }); continue; }
    for (const r of t.topics) {
      const l = resolveTopic(r, lectures);
      if (!l) out.push({ level: "bad", labNumber: t.labNumber, text: `Lab ${t.labNumber} practises "${r.topic}", which is no longer in the lecture plan (it was lecture ${r.lectureNumber}). Relink it.` });
      else if (t.week != null && t.week < l.week) out.push({ level: "bad", labNumber: t.labNumber, text: `Lab ${t.labNumber} is in week ${t.week}, before lecture ${l.lectureNumber} "${l.topic}" (week ${l.week}) that teaches it.` });
    }
  }
  return out;
}

export async function labFiles(labId: string): Promise<LabFile[]> {
  const manuals = await prisma.labManual.findMany({ where: { courseId: labId }, include: { versions: { orderBy: { version: "desc" } } } });
  const versions = manuals.flatMap((m) => m.versions.map((v) => ({ ...v, labNumber: m.labNumber })));
  const reviews = (await ldb.labFileReview.findMany({ where: { versionId: { in: versions.map((v) => v.id).concat(["none"]) } } }).catch(() => [])) as { versionId: string; kind: string; status: string; note: string | null; reviewedById: string | null }[];
  const ids = Array.from(new Set([...versions.map((v) => v.uploadedById), ...reviews.map((r) => r.reviewedById || "")].filter(Boolean)));
  const names = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return versions.map((v) => {
    const r = reviews.find((x) => x.versionId === v.id);
    return { versionId: v.id, version: v.version, labNumber: v.labNumber, kind: (r?.kind === "SOLUTION" ? "SOLUTION" : "MANUAL") as "MANUAL" | "SOLUTION", fileName: v.fileName, fileUrl: v.fileUrl, note: v.note, by: names.get(v.uploadedById) || "—", at: new Date(v.createdAt).toISOString().slice(0, 10), status: r?.status || "PENDING", reviewNote: r?.note || null, reviewedBy: r?.reviewedById ? names.get(r.reviewedById) || null : null };
  }) as (LabFile & { labNumber: number })[];
}

/** Per lab task: the latest manual and solution and whether each is approved. */
export function fileStatus(tasks: LabTask[], files: (LabFile & { labNumber?: number })[]) {
  return tasks.map((t) => {
    const mine = files.filter((f) => f.labNumber === t.labNumber);
    const manual = mine.find((f) => f.kind === "MANUAL") || null;
    const solution = mine.find((f) => f.kind === "SOLUTION") || null;
    return { labNumber: t.labNumber, manual, solution, ready: !!manual && !!solution, approved: manual?.status === "APPROVED" && solution?.status === "APPROVED" };
  });
}

/** The lab courses that go with a theory course (code + "-L", same program and batch). */
export async function labsOfTheory(theoryId: string) {
  const t = await prisma.course.findUnique({ where: { id: theoryId }, select: { code: true, coordinatorId: true, batchId: true, courseType: true } });
  if (!t || /-L$/i.test(t.code)) return [];
  return prisma.course.findMany({ where: { coordinatorId: t.coordinatorId, batchId: t.batchId, code: `${t.code}-L`, courseType: "Lab" }, select: { id: true } });
}

/** Compare the lecture plan and lab plan with what was last seen; tell the instructor and the Lab Engineer what changed. */
export async function checkLabSync(labId: string, actor?: { id: string; name: string } | null) {
  const loaded = await loadLabCourse(labId);
  if (!loaded) return;
  const { lab, theory, lead } = loaded;
  const [lectures, tasks] = await Promise.all([theoryLectures(theory?.id || null), labTasks(lab.id)]);
  let state: { lectureJson: string; labJson: string } | null;
  try { state = await ldb.labSyncState.findUnique({ where: { labCourseId: lab.id } }); } catch { return; }
  const lecNow = lectures.map((l) => ({ n: l.lectureNumber, w: l.week, t: l.topic }));
  const labNow = tasks.map((t) => ({ n: t.labNumber, w: t.week, t: t.title, k: t.topics.map((x) => x.topic) }));
  const save = () => ldb.labSyncState.upsert({ where: { labCourseId: lab.id }, create: { labCourseId: lab.id, lectureJson: JSON.stringify(lecNow), labJson: JSON.stringify(labNow), updatedAt: new Date() }, update: { lectureJson: JSON.stringify(lecNow), labJson: JSON.stringify(labNow), updatedAt: new Date() } });
  if (!state) { await save(); return; }
  const lecBefore = parse<{ n: number; w: number; t: string }[]>(state.lectureJson, []);
  const labBefore = parse<{ n: number; w: number | null; t: string; k: string[] }[]>(state.labJson, []);
  const lines: string[] = [];

  // Lecture side: only changes to topics a lab practises, plus a plain note when lectures were reordered.
  const linked = new Set(tasks.flatMap((t) => t.topics.map((x) => norm(x.topic))));
  for (const old of lecBefore) {
    if (!linked.has(norm(old.t))) continue;
    const labsOf = tasks.filter((t) => t.topics.some((x) => norm(x.topic) === norm(old.t))).map((t) => `Lab ${t.labNumber}`).join(", ");
    const now = lecNow.find((l) => norm(l.t) === norm(old.t));
    if (!now) {
      const same = lecNow.find((l) => l.n === old.n);
      lines.push(same ? `Lecture ${old.n} "${old.t}" is now "${same.t}" — ${labsOf} practised the old topic.` : `Lecture ${old.n} "${old.t}" was removed from the lecture plan — ${labsOf} practised it.`);
    } else if (now.w !== old.w || now.n !== old.n) lines.push(`"${old.t}" moved from lecture ${old.n} (week ${old.w}) to lecture ${now.n} (week ${now.w}) — ${labsOf} practises it.`);
  }
  const order = (xs: { t: string }[]) => xs.map((x) => norm(x.t)).join("|");
  if (!lines.length && lecBefore.length && order(lecBefore) !== order(lecNow)) lines.push("The order of the lecture plan changed. Check that each lab still comes after the lecture it practises.");

  // Lab side.
  for (const old of labBefore) {
    const now = labNow.find((l) => l.n === old.n);
    if (!now) { lines.push(`Lab ${old.n} "${old.t}" was removed from the lab plan.`); continue; }
    if (now.t !== old.t) lines.push(`Lab ${old.n} was renamed from "${old.t}" to "${now.t}".`);
    if (now.w !== old.w) lines.push(`Lab ${old.n} moved from week ${old.w ?? "—"} to week ${now.w ?? "—"}.`);
    if (old.k.map(norm).sort().join("|") !== now.k.map(norm).sort().join("|")) lines.push(`Lab ${old.n} now practises: ${now.k.join("; ") || "no lecture topic"}.`);
  }
  for (const now of labNow) if (!labBefore.some((o) => o.n === now.n)) lines.push(`Lab ${now.n} "${now.t}" was added to the lab plan.`);

  await save();
  if (!lines.length) return;
  const clash = syncIssues(tasks, lectures, !!theory).filter((i) => i.level === "bad" && i.labNumber != null);
  const body = `${actor ? `${actor.name} made changes` : "Changes were made"} to ${theory?.code || ""} / ${lab.code}:\n• ${lines.slice(0, 12).join("\n• ")}${clash.length ? `\n\nNow out of step:\n• ${clash.slice(0, 6).map((c) => c.text).join("\n• ")}` : ""}`;
  const title = `Lecture and lab plans changed — ${lab.code}`;
  await notifyUsers([lab.labEngineerId], { kind: "LAB_SYNC", title, body, href: `/lab-engineer/labs/${lab.id}`, exceptId: actor?.id || null });
  await notifyUsers([lead?.id], { kind: "LAB_SYNC", title, body, href: `/instructor/labs/${lab.id}`, exceptId: actor?.id || null });
}

/** After a change to a theory course's lecture plan: check each of its labs (capped so a save never waits long). */
export async function afterLecturePlanChange(theoryId: string) {
  try {
    const user = await getAuthenticatedUser().catch(() => null);
    const labs = await labsOfTheory(theoryId);
    const work = Promise.all(labs.map((l) => checkLabSync(l.id, user ? { id: user.id, name: user.name } : null).catch(() => {})));
    await Promise.race([work, new Promise((r) => setTimeout(r, 4000))]);
  } catch { /* never block a lecture plan save */ }
}

/** Wraps a lecture-plan route handler so a successful save checks the course's labs afterwards. */
export function withLabSync<C extends { params: { courseId: string } }>(h: (req: any, ctx: C) => Promise<Response>) {
  return async (req: any, ctx: C) => {
    const res = await h(req, ctx);
    if (res.ok) await afterLecturePlanChange(ctx.params.courseId);
    return res;
  };
}

/** Save one lab task: title, week and the lecture numbers it practises (stored with their topic text). */
export async function saveTask(labId: string, theoryId: string | null, t: { labNumber: number; title: string; week: number | null; lectureNumbers: number[] }, userId: string) {
  const lectures = await theoryLectures(theoryId);
  const topics: TopicRef[] = t.lectureNumbers.map((n) => lectures.find((l) => l.lectureNumber === n)).filter((l): l is Lecture => !!l).map((l) => ({ lectureNumber: l.lectureNumber, topic: l.topic }));
  await prisma.labManual.upsert({ where: { courseId_labNumber: { courseId: labId, labNumber: t.labNumber } }, create: { courseId: labId, labNumber: t.labNumber, title: t.title || `Lab ${t.labNumber}` }, update: { title: t.title || `Lab ${t.labNumber}` } });
  await ldb.labTaskPlan.upsert({
    where: { labCourseId_labNumber: { labCourseId: labId, labNumber: t.labNumber } },
    create: { id: randomUUID(), labCourseId: labId, labNumber: t.labNumber, week: t.week, topicsJson: JSON.stringify(topics), updatedById: userId, updatedAt: new Date() },
    update: { week: t.week, topicsJson: JSON.stringify(topics), updatedById: userId, updatedAt: new Date() },
  });
}

/** Evidence for the semester plan: is every lab of these Lab Engineers planned with manual and solution (key LAB_PLAN),
 *  or every lab these instructors lead approved (key LAB_APPROVE)? Returns the date it became true per person. */
export async function labPlanEvidence(key: "LAB_PLAN" | "LAB_APPROVE", people: string[], since: Date) {
  const by = new Map<string, Date>();
  for (const pid of people.slice(0, 300)) {
    const u = await prisma.user.findUnique({ where: { id: pid }, select: { id: true, role: true } });
    if (!u) continue;
    let labIds: string[] = [];
    if (key === "LAB_PLAN") labIds = (await prisma.course.findMany({ where: { courseType: "Lab", isOffered: true, labEngineerId: pid }, select: { id: true } })).map((c) => c.id);
    else {
      const mine = await prisma.course.findMany({ where: { instructorId: pid, isOffered: true }, select: { id: true, code: true, courseType: true } });
      for (const c of mine) {
        if (c.courseType === "Lab") labIds.push(c.id);
        else labIds.push(...(await labsOfTheory(c.id)).map((l) => l.id));
      }
      labIds = Array.from(new Set(labIds));
    }
    if (!labIds.length) { by.set(pid, since); continue; } // nothing to do for this person
    let latest = since, ok = true;
    for (const id of labIds) {
      const tasks = await labTasks(id);
      if (!tasks.length) { ok = false; break; }
      const files = await labFiles(id);
      const st = fileStatus(tasks, files);
      if (key === "LAB_PLAN") {
        if (tasks.some((t) => t.week == null || !t.topics.length) || st.some((s) => !s.ready)) { ok = false; break; }
        for (const f of files) { const d = new Date(f.at); if (d > latest) latest = d; }
      } else {
        if (st.some((s) => !s.approved)) { ok = false; break; }
        const rv = (await ldb.labFileReview.findMany({ where: { labCourseId: id, status: "APPROVED" }, select: { reviewedAt: true } }).catch(() => [])) as { reviewedAt: Date | null }[];
        for (const r of rv) if (r.reviewedAt && r.reviewedAt > latest) latest = r.reviewedAt;
      }
    }
    if (ok) by.set(pid, latest);
  }
  return by;
}
