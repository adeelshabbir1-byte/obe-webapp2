import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../lib/contentSync";
import { writeAuditLog } from "../../../../../../lib/audit";
import { withErrors } from "../../../../../../lib/apiHandler";

async function GET_handler(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const items = await prisma.paperDistributionItem.findMany({ where: { courseId: course.id, source: "SE" }, orderBy: { orderIndex: "asc" } });
  return NextResponse.json({ items });
}

async function POST_handler(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const body = await req.json();
  if (!body.topicText || body.marks === undefined || body.marks === null) {
    return NextResponse.json({ error: "topicText and marks are required" }, { status: 400 });
  }
  const examType = body.examType === "Midterm" || body.examType === "Final" ? body.examType : null;

  const count = await prisma.paperDistributionItem.count({ where: { courseId: course.id, source: "SE", examType } });

  const item = await prisma.paperDistributionItem.create({
    data: {
      courseId: course.id, source: "SE", examType, questionNo: count + 1, orderIndex: count,
      lectureRowId: body.lectureRowId || null, topicText: body.topicText,
      cloId: body.cloId || null, cognitiveLevel: body.cognitiveLevel || null,
      marks: parseFloat(body.marks),
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "PAPER_DISTRIBUTION_ITEM_ADDED", entityType: "PaperDistributionItem", entityId: item.id });
  await syncCourseContentToLinkedCourses(course.id);

  return NextResponse.json({ item }, { status: 201 });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
