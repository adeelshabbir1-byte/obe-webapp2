import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function GET(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Notes from whoever taught the prerequisite course, AND from whoever
  // taught this same course in the prior batch it was copied from.
  const relevantCourseIds = [course.prerequisiteCourseId, course.benchmarkSourceId].filter((id): id is string => !!id);
  const notes = relevantCourseIds.length > 0
    ? await prisma.feedForwardNote.findMany({
        where: { courseId: { in: relevantCourseIds } },
        include: { course: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  // My own notes (left for whoever comes next), separate list.
  const myNotes = await prisma.feedForwardNote.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "desc" } });

  return NextResponse.json({
    incoming: notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt, fromCourse: `${n.course.code} — ${n.course.title}` })),
    myNotes: myNotes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt })),
  });
}

export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.body) return NextResponse.json({ error: "body is required" }, { status: 400 });

  const note = await prisma.feedForwardNote.create({ data: { courseId: course.id, authorId: user.id, body: body.body } });
  await writeAuditLog({ actorUserId: user.id, action: "FEEDFORWARD_NOTE_ADDED", entityType: "Course", entityId: course.id });
  return NextResponse.json({ note }, { status: 201 });
}
