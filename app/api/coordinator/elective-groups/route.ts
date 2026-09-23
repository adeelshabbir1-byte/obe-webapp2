import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batchId = req.nextUrl.searchParams.get("batchId");
  if (!batchId) return NextResponse.json({ error: "batchId is required" }, { status: 400 });

  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  const groups = await prisma.electiveSlotGroup.findMany({
    where: { batchId },
    include: {
      options: { include: { course: { select: { id: true, code: true, title: true } }, choices: { select: { id: true } } } },
      choices: { select: { id: true, studentId: true, optionId: true, applied: true, student: { select: { name: true, rollNumber: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    groups: groups.map((g) => ({
      id: g.id, label: g.label, semesterNumber: g.semesterNumber, registrationOpen: g.registrationOpen, finalized: g.finalized,
      options: g.options.map((o) => ({ id: o.id, courseId: o.course.id, courseCode: o.course.code, courseTitle: o.course.title, capacity: o.capacity, choiceCount: o.choices.length })),
      choices: g.choices.map((c) => ({ id: c.id, studentName: c.student.name, rollNumber: c.student.rollNumber, optionId: c.optionId, applied: c.applied })),
    })),
  });
}

// Creates a new elective group with 2+ real courses as its options —
// the courses must already exist (e.g. imported via Course
// Repositioning's elective-fill) and belong to this same batch.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.batchId || !body.label || !body.semesterNumber || !Array.isArray(body.courseIds) || body.courseIds.length < 2) {
    return NextResponse.json({ error: "batchId, label, semesterNumber, and at least 2 courseIds are required" }, { status: 400 });
  }

  const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  const courses = await prisma.course.findMany({ where: { id: { in: body.courseIds }, batchId: batch.id } });
  if (courses.length !== body.courseIds.length) {
    return NextResponse.json({ error: "one or more selected courses weren't found in this batch" }, { status: 400 });
  }
  const alreadyAnOption = await prisma.electiveSlotOption.findMany({ where: { courseId: { in: body.courseIds } }, include: { course: { select: { title: true } } } });
  if (alreadyAnOption.length > 0) {
    return NextResponse.json({ error: `already an option in another group: ${alreadyAnOption.map((o) => o.course.title).join(", ")}` }, { status: 400 });
  }

  const capacities: Record<string, number | null> = body.capacities || {};

  const group = await prisma.electiveSlotGroup.create({
    data: {
      batchId: batch.id, label: body.label, semesterNumber: parseInt(body.semesterNumber, 10), coordinatorId: user.id,
      options: { create: body.courseIds.map((courseId: string) => ({ courseId, capacity: capacities[courseId] ? parseInt(String(capacities[courseId]), 10) : null })) },
    },
    include: { options: { include: { course: { select: { code: true, title: true } } } } },
  });

  await writeAuditLog({ actorUserId: user.id, action: "ELECTIVE_GROUP_CREATED", entityType: "Batch", entityId: batch.id, metadata: { groupId: group.id, label: group.label, courseIds: body.courseIds } });

  return NextResponse.json({ group }, { status: 201 });
}
