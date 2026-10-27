import { chairmanIdFor } from "./reportScope";
import { accessFor, columnData, createProposal, planSettings, type Who } from "./topicPlan";
import { performanceOf } from "./topicPerformance";
import { shortOfTime, type Item, type Level, type TopicFacts } from "./topicPlanCore";

// "I'm short of time" (Instructor): "I lost N lectures" → which topics to drop or shorten, safest first, with what each
// costs. Sending it makes one proposal to the course's Subject Expert; on approval the topics are marked "planned but
// not taught" and a dropped prerequisite topic raises a follow-up for the dependent course's teacher (lib/topicPlan.ts).

async function teachingColumn(user: Who, courseId: string) {
  const a = await accessFor(user, courseId, "INSTRUCTOR");
  if (!a || a.plan !== "INSTRUCTOR") return null;
  return { a, data: await columnData(a) };
}

export async function shortOfTimePlan(user: Who, courseId: string, lost: number) {
  const col = await teachingColumn(user, courseId);
  if (!col) return { error: "Only the course's Instructor plans this (their own teaching copy).", status: 403 };
  const settings = await planSettings(await chairmanIdFor(user));
  const perf = await performanceOf(col.a.planCourseId, col.data.rows.map((r) => ({ id: r.id, topic: r.topic, movedFrom: r.movedFrom })), settings.minStudents);
  const facts: TopicFacts[] = col.data.rows.filter((r) => !r.notTaught).map((r) => ({
    id: r.id, topic: r.topic, importance: r.importance as Level | null, cloId: r.cloId, links: r.links, paperItems: r.paperItems, dependents: r.dependents,
    progressionStart: r.overlaps.some((o) => o.verdict === "PROGRESSION"), duplication: r.overlaps.some((o) => o.verdict === "DUPLICATION"),
    cloLectures: r.cloId ? col.data.rows.filter((x) => x.cloId === r.cloId).length : undefined,
    avgPct: perf[r.id] && !perf[r.id].overall.tooLittle ? perf[r.id].overall.shown?.avg ?? null : null,
  }));
  const n = Math.max(1, Math.min(20, Math.floor(lost) || 1));
  return { ...shortOfTime(facts, n), lost: n, course: `${col.a.code} — ${col.a.title}`, to: col.a.toName, status: 200 };
}

export async function sendShortOfTime(user: Who, courseId: string, picks: { id: string; action: "DROP" | "SHORTEN" }[], note: string) {
  const col = await teachingColumn(user, courseId);
  if (!col) return { error: "Only the course's Instructor sends this.", status: 403 };
  if (!picks.length) return { error: "Choose at least one topic.", status: 400 };
  // The proposal goes to the Subject Expert of the course (the owner of the plan), not to the Instructor.
  const se = await accessFor(user, courseId, "SE");
  if (!se?.toUserId) return { error: "This course has no Subject Expert or Program Lead to approve it.", status: 400 };
  const rows = new Map(col.data.rows.map((r) => [r.id, r]));
  const items: Item[] = picks.filter((p) => rows.has(p.id)).map((p, i) => ({ kind: p.action === "SHORTEN" ? "SHORTEN" : "DROP", lectureRowId: p.id, topic: rows.get(p.id)!.topic, subtopic: null, position: i, detail: { safety: rows.get(p.id)!.safety.mark, reason: rows.get(p.id)!.safety.reason } }));
  if (rows.size && items.some((i) => rows.get(i.lectureRowId!)!.safety.mark === "⛔" && i.kind === "DROP")) return { error: "A topic marked ⛔ can't be dropped; shorten it instead or pick another.", status: 400 };
  const id = await createProposal(user, await chairmanIdFor(user), { ...col.a, toUserId: se.toUserId, toName: se.toName, mode: "PROPOSE" }, items, [], [], note || `Lost lectures: ${items.length}`, "SHORT_OF_TIME");
  return { ok: true, id, to: se.toName, status: 200 };
}
