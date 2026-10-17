import { prisma } from "./db";
import { norm } from "./teachingAnalysis";

// Read-only parts of the lab plan (no notifications, no session), safe to use from the semester plan's auto-ticks.
const ldb = prisma as unknown as Record<string, any>;
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
