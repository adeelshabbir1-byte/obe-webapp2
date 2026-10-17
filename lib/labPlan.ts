import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { norm } from "./teachingAnalysis";
import { loadLabCourse } from "./labAccess";
import { labFiles, labTasks, labsOfTheory, syncIssues, theoryLectures, type Lecture, type TopicRef } from "./labPlanCore";
export * from "./labPlanCore";

// The lab plan of a lab course: each lab task (session) has a week and the theory lecture topics it practises.
// The Lab Engineer names the tasks and uploads the manual and its solution before the semester; the instructor who
// teaches the course (the lab lead) reviews and approves them. When the lecture plan or the lab plan changes in a way
// that matters to the other side (a topic renamed or removed, a lecture moved to another week, a lab moved or relinked),
// the instructor and the Lab Engineer are both told, as with topic prerequisites.

const ldb = prisma as unknown as Record<string, any>;
export const LAB_PLAN_HINT = "Not set up yet — the Super User needs to run prisma/migration_lab_plan.sql.";


const parse = <T,>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };








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



/** Save one lab task: title, week and the lecture numbers it practises (stored with their topic text). */
export async function saveTask(labId: string, theoryId: string | null, t: { labNumber: number; title: string; week: number | null; lectureNumbers: number[]; openEnded?: boolean; oelBrief?: string | null }, userId: string) {
  const lectures = await theoryLectures(theoryId);
  const topics: TopicRef[] = t.lectureNumbers.map((n) => lectures.find((l) => l.lectureNumber === n)).filter((l): l is Lecture => !!l).map((l) => ({ lectureNumber: l.lectureNumber, topic: l.topic }));
  // Open-ended flag needs migration_quality_gaps.sql; leave it out until that column exists.
  const oel = t.openEnded === undefined ? {} : { openEnded: !!t.openEnded, oelBrief: t.oelBrief || null };
  await prisma.labManual.upsert({ where: { courseId_labNumber: { courseId: labId, labNumber: t.labNumber } }, create: { courseId: labId, labNumber: t.labNumber, title: t.title || `Lab ${t.labNumber}` }, update: { title: t.title || `Lab ${t.labNumber}` } });
  const up = (extra: Record<string, unknown>) => ldb.labTaskPlan.upsert({
    where: { labCourseId_labNumber: { labCourseId: labId, labNumber: t.labNumber } },
    create: { id: randomUUID(), labCourseId: labId, labNumber: t.labNumber, week: t.week, topicsJson: JSON.stringify(topics), updatedById: userId, updatedAt: new Date(), ...extra },
    update: { week: t.week, topicsJson: JSON.stringify(topics), updatedById: userId, updatedAt: new Date(), ...extra },
    select: { id: true },
  });
  try { await up(oel); } catch (e) { if (Object.keys(oel).length) await up({}); else throw e; } // openEnded column not added yet
}

