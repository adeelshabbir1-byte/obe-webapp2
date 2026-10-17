import { examChairman } from "../../../../../lib/examBranch";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { notifyUsers } from "../../../../../lib/notifications";
import { xdb, loadSession, parse, type ExamPaperRow } from "../../../../../lib/exams";

// POST { publish: boolean } — publish the date sheet (students, instructors and invigilators see it and are notified) or take it back.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  const cid = user ? await examChairman(user) : null;
  if (!user || !cid) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const s = await loadSession(params.id);
  if (!s || s.chairmanId !== cid) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const publish = !!b.publish;
  await xdb.examSession.update({ where: { id: s.id }, data: { status: publish ? "PUBLISHED" : "DRAFT" } });
  await writeAuditLog({ actorUserId: user.id, action: publish ? "EXAM_DATESHEET_PUBLISHED" : "EXAM_DATESHEET_UNPUBLISHED", entityType: "ExamSession", entityId: s.id });
  if (publish) {
    await xdb.examPublishLog.upsert({ where: { sessionId: s.id }, create: { sessionId: s.id, publishedAt: new Date() }, update: { publishedAt: new Date() } }).catch(() => null);
    const papers = (await xdb.examPaper.findMany({ where: { sessionId: s.id } })) as ExamPaperRow[];
    const invigilators = new Set<string>();
    for (const p of papers) for (const r of parse<{ userIds: string[] }[]>(p.invigilatorsJson, [])) r.userIds.forEach((u) => invigilators.add(u));
    const teachers = (await prisma.course.findMany({ where: { id: { in: papers.map((p) => p.courseId) } }, select: { instructorId: true } })).map((c) => c.instructorId);
    await notifyUsers(Array.from(invigilators), { kind: "ASSIGNMENT", title: `${s.name}: your invigilation duties`, body: `The ${s.name} date sheet is published. See your invigilation duties, rooms and times.`, href: `/exams/${s.id}?tab=duties` });
    await notifyUsers(teachers.filter((t) => t && !invigilators.has(t)), { kind: "ASSIGNMENT", title: `${s.name} date sheet published`, body: `See when and where your courses' papers are.`, href: `/exams/${s.id}` });
  }
  return NextResponse.json({ ok: true });
}
