import { NextRequest, NextResponse } from "next/server";
import { savePlans, unmergeLectures, planRows, accessFor } from "../../../../../lib/topicPlan";
import { forbidden, reply, wsUser } from "../../../../../lib/topicApi";
import { layoutHash, freeLabel, splitSubtopics, mergeWarnings, topicKey, type Entry, type Level } from "../../../../../lib/topicPlanCore";
import { prisma } from "../../../../../lib/db";
import { withErrors } from "../../../../../lib/apiHandler";

export const maxDuration = 60;

// Merge, split and unmerge lectures from a course's Lecture Content tab (the same rules as the Topic Workspace: the
// owner's own plan changes at once, anyone else's becomes a proposal to its Subject Expert, an approved plan a request).
//   POST { action: "merge", courseId, plan, rowIds: [a, b] }
//   POST { action: "split", courseId, plan, rowId, second: { topic, subtopic } }
//   POST { action: "unmerge", mergeId }
async function POST_handler(req: NextRequest) {
  const user = await wsUser();
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  if (b.action === "unmerge") return reply(await unmergeLectures(user, String(b.mergeId || "")));
  const a = await accessFor(user, String(b.courseId || ""), b.plan === "INSTRUCTOR" ? "INSTRUCTOR" : b.plan === "SE" ? "SE" : null);
  if (!a) return NextResponse.json({ error: "Course not found." }, { status: 404 });
  const rows = await planRows(a.planCourseId, a.plan);
  const entries: Entry[] = rows.map((r) => ({ id: r.id, topic: r.topic, subtopic: r.subtopic }));
  if (b.action === "merge") {
    const ids: string[] = Array.isArray(b.rowIds) ? b.rowIds.map(String) : [];
    const idx = ids.map((id) => entries.findIndex((e) => e.id === id)).filter((i) => i >= 0).sort((x, y) => x - y);
    if (idx.length !== 2) return NextResponse.json({ error: "Choose two lectures to merge." }, { status: 400 });
    const [i, j] = idx, A = entries[i], B = entries[j];
    // Think twice: both Core, or either usually hard (difficulty votes) — the user can still confirm.
    if (!b.confirm) {
      const db = prisma as unknown as Record<string, any>;
      const meta = (await db.topicMeta.findMany({ where: { lectureRowId: { in: [A.id, B.id] } } }).catch(() => [])) as { lectureRowId: string; importance: string | null }[];
      const votes = (await db.topicDifficultyVote.groupBy({ by: ["topicKey"], where: { courseId: a.planCourseId }, _count: { _all: true } }).catch(() => [])) as { topicKey: string; _count: { _all: number } }[];
      const hard = (t: string) => (votes.find((v) => v.topicKey === topicKey(t))?._count._all || 0) >= 2;
      const w = mergeWarnings({ topic: A.topic, importance: (meta.find((m) => m.lectureRowId === A.id)?.importance as Level) || null, hard: hard(A.topic) }, { topic: B.topic, importance: (meta.find((m) => m.lectureRowId === B.id)?.importance as Level) || null, hard: hard(B.topic) });
      if (w.length) return NextResponse.json({ warnings: w }, { status: 409 });
    }
    entries[i] = { ...A, topic: `${A.topic}; ${B.topic}`.slice(0, 300), subtopic: [A.subtopic, B.subtopic].filter(Boolean).join("; ") || null, mergedFrom: [A.id!, B.id!] };
    entries[j] = { ...B, topic: freeLabel([i + 1, j + 1]), subtopic: null, free: freeLabel([i + 1, j + 1]) };
  } else if (b.action === "split") {
    const i = entries.findIndex((e) => e.id === String(b.rowId || ""));
    if (i < 0) return NextResponse.json({ error: "Lecture not found." }, { status: 400 });
    const [keep, rest] = splitSubtopics(entries[i].subtopic);
    const chosen = typeof b.second?.subtopic === "string";
    const second = { topic: String(b.second?.topic || `${entries[i].topic} (part 2)`).trim().slice(0, 300), subtopic: chosen ? b.second.subtopic.trim() || null : rest };
    if (!chosen) entries[i] = { ...entries[i], subtopic: keep };
    entries.splice(i + 1, 0, { topic: second.topic, subtopic: second.subtopic, splitFrom: entries[i].id });
  } else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  return reply(await savePlans(user, { courses: [{ courseId: String(b.courseId), plan: a.plan, hash: layoutHash(rows), entries } as never] }));
}
export const POST = withErrors(POST_handler);
