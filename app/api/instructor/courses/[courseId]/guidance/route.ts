import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

// Shared by the assigned Instructor, the assigned Subject Expert, and
// any OMC member who can see this course — a running thread between
// whoever planned the course and whoever actually delivered it, not a
// single overwritable comment.
async function canAccess(user: any, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, include: { coordinator: true } });
  if (!course) return null;
  if (user.role === "INSTRUCTOR" && course.instructorId === user.id) return course;
  if (user.role === "SUBJECT_EXPERT" && course.subjectExpertId === user.id) return course;
  if (user.role === "OMC" && course.coordinator.managedById === user.managedById) return course;
  return null;
}

export async function GET(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const course = await canAccess(user, params.courseId);
  if (!course) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const comments = await prisma.instructorGuidanceComment.findMany({ where: { courseId: params.courseId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const course = await canAccess(user, params.courseId);
  if (!course) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.body) return NextResponse.json({ error: "body is required" }, { status: 400 });

  const comment = await prisma.instructorGuidanceComment.create({
    data: { courseId: params.courseId, authorId: user.id, authorRole: user.role, body: body.body },
  });
  await writeAuditLog({ actorUserId: user.id, action: "GUIDANCE_COMMENT_ADDED", entityType: "Course", entityId: params.courseId });
  return NextResponse.json({ comment }, { status: 201 });
}
