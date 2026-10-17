import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";
import { evdb, EVAL } from "../../../../lib/evaluations";

export async function POST(req: Request) {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const kind = b.kind === "TEACHER" ? "TEACHER" : "COURSE";
  const courseId = String(b.courseId || "");
  if (!(await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId: st.id, courseId } } }))) return NextResponse.json({ error: "You are not enrolled in this course." }, { status: 403 });
  const ans: Record<string, number> = {};
  for (const [k] of EVAL[kind].items) { const v = Math.round(Number(b.answers?.[k])); if (v >= 1 && v <= 5) ans[k] = v; }
  if (Object.keys(ans).length < EVAL[kind].items.length - 1) return NextResponse.json({ error: "Please answer every question." }, { status: 400 });
  const data = { answersJson: JSON.stringify(ans), comment: typeof b.comment === "string" && b.comment.trim() ? b.comment.trim().slice(0, 2000) : null };
  try { await evdb.courseEvaluation.upsert({ where: { courseId_studentId_kind: { courseId, studentId: st.id, kind } }, create: { courseId, studentId: st.id, kind, ...data }, update: data }); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Evaluations are not set up yet." }, { status: 500 }); }
}
