import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { xdb, loadSession, allocate, parse, EXAM_MANAGERS, type ExamPaperRow } from "../../../../../../lib/exams";

// PATCH { date: "YYYY-MM-DD" | null, slot } — move a paper (all sections of its course code) by hand. It stays there
// when the date sheet is generated again. Rooms and invigilators are redone. Returns the clashes the move creates.
export async function PATCH(req: NextRequest, { params }: { params: { id: string; paperId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !EXAM_MANAGERS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const s = await loadSession(params.id);
  if (!s || s.chairmanId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  const paper = (await xdb.examPaper.findUnique({ where: { id: params.paperId } })) as ExamPaperRow | null;
  if (!paper || paper.sessionId !== s.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const slots = parse<string[]>(s.slotsJson, []);
  const date = b.date ? new Date(`${b.date}T00:00:00Z`) : null;
  const slot = b.date ? Number(b.slot) : null;
  if (date && (isNaN(date.getTime()) || !Number.isInteger(slot) || slot! < 0 || slot! >= slots.length)) return NextResponse.json({ error: "Choose a day and a time slot." }, { status: 400 });
  const course = await prisma.course.findUnique({ where: { id: paper.courseId }, select: { code: true } });
  const all = (await xdb.examPaper.findMany({ where: { sessionId: s.id } })) as ExamPaperRow[];
  const sameCode = await prisma.course.findMany({ where: { id: { in: all.map((p) => p.courseId) }, code: course?.code || "" }, select: { id: true } });
  const ids = sameCode.map((c) => c.id);
  await xdb.examPaper.updateMany({ where: { sessionId: s.id, courseId: { in: ids } }, data: { date, slot, pinned: !!date } });
  // Clashes created by this move.
  let clashes: string[] = [];
  if (date) {
    const others = all.filter((p) => !ids.includes(p.courseId) && p.date && new Date(p.date).toISOString().slice(0, 10) === date.toISOString().slice(0, 10) && p.slot === slot);
    if (others.length) {
      const mine = new Set((await prisma.studentEnrollment.findMany({ where: { courseId: { in: ids }, status: { not: "WITHDRAWN" } }, select: { studentId: true } })).map((e) => e.studentId));
      const theirs = await prisma.studentEnrollment.findMany({ where: { courseId: { in: others.map((o) => o.courseId) }, status: { not: "WITHDRAWN" } }, select: { studentId: true, course: { select: { code: true } } } });
      const hit = new Map<string, number>();
      for (const t of theirs) if (mine.has(t.studentId)) hit.set(t.course.code, (hit.get(t.course.code) || 0) + 1);
      clashes = Array.from(hit.entries()).map(([code, n]) => `${n} student(s) also sit ${code} then`);
    }
  }
  await allocate(s.id);
  return NextResponse.json({ ok: true, clashes });
}
