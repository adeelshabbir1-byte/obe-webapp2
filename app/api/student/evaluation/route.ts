import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";
import { evdb } from "../../../../lib/evaluations";
import { questionsFor, settingsFor, windowOf } from "../../../../lib/questionnaires";
import { instituteOfBatch } from "../../../../lib/moduleLocks";

export async function POST(req: Request) {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const kind = b.kind === "TEACHER" ? "TEACHER" : "COURSE";
  const courseId = String(b.courseId || "");
  if (!(await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId: st.id, courseId } } }))) return NextResponse.json({ error: "You are not enrolled in this course." }, { status: 403 });
  // The institute's questionnaire (QEC In-charge), and only while its feedback window is open.
  const chairmanId = await instituteOfBatch(st.batchId).catch(() => null);
  const [qs, fs] = await Promise.all([questionsFor(chairmanId, kind), settingsFor(chairmanId)]);
  const win = await windowOf(courseId, fs);
  if (!win.open) return NextResponse.json({ error: `Feedback for this course is open from week ${fs.fromWeek} to week ${fs.toWeek} of the semester.` }, { status: 400 });
  const ans: Record<string, number> = {};
  for (const q of qs) { const v = Math.round(Number(b.answers?.[q.key])); if (v >= 1 && v <= 5) ans[q.key] = v; }
  if (Object.keys(ans).length < qs.length - 1) return NextResponse.json({ error: "Please answer every question." }, { status: 400 });
  const data = { answersJson: JSON.stringify(ans), comment: typeof b.comment === "string" && b.comment.trim() ? b.comment.trim().slice(0, 2000) : null };
  // "Which topics were hardest?" (course feedback only): up to 3 of the course's topics; shown to its teachers per topic.
  if (kind === "COURSE" && Array.isArray(b.hardest)) {
    const { topicKey } = await import("../../../../lib/topicPlanCore");
    const rows = await prisma.lectureRow.findMany({ where: { courseId }, select: { topic: true } });
    const ok = Array.from(new Set((b.hardest as unknown[]).filter((t): t is string => typeof t === "string" && rows.some((r) => r.topic.trim() === t.trim())))).slice(0, 3);
    const vdb = prisma as unknown as Record<string, any>;
    await vdb.topicDifficultyVote.deleteMany({ where: { courseId, studentId: st.id } }).catch(() => null);
    for (const t of ok) await vdb.topicDifficultyVote.create({ data: { courseId, studentId: st.id, topicKey: topicKey(t), topic: t.trim().slice(0, 300) } }).catch(() => null);
  }
  try { await evdb.courseEvaluation.upsert({ where: { courseId_studentId_kind: { courseId, studentId: st.id, kind } }, create: { courseId, studentId: st.id, kind, ...data }, update: data }); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Evaluations are not set up yet." }, { status: 500 }); }
}
