import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../../lib/studentSession";
import { prisma } from "../../../../../lib/db";

export async function POST(req: NextRequest, { params }: { params: { groupId: string } }) {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const group = await prisma.electiveSlotGroup.findUnique({ where: { id: params.groupId } });
  if (!group || group.batchId !== student.batchId) return NextResponse.json({ error: "invalid group" }, { status: 404 });
  if (!group.registrationOpen) return NextResponse.json({ error: "Registration for this elective isn't open right now." }, { status: 400 });

  const body = await req.json();
  const optionId = String(body.optionId || "");
  if (!optionId) return NextResponse.json({ error: "Choose one of the options." }, { status: 400 });

  const option = await prisma.electiveSlotOption.findUnique({ where: { id: optionId }, include: { choices: true, course: { select: { title: true } } } });
  if (!option || option.groupId !== group.id) return NextResponse.json({ error: "invalid option" }, { status: 400 });

  const existingChoice = await prisma.electiveChoice.findUnique({ where: { groupId_studentId: { groupId: group.id, studentId: student.id } } });
  if ((!existingChoice || existingChoice.optionId !== option.id) && option.capacity !== null && option.choices.length >= option.capacity) {
    return NextResponse.json({ error: `${option.course.title} is currently full. Choose a different option.` }, { status: 400 });
  }

  await prisma.electiveChoice.upsert({
    where: { groupId_studentId: { groupId: group.id, studentId: student.id } },
    update: { optionId: option.id, submittedAt: new Date() },
    create: { groupId: group.id, studentId: student.id, optionId: option.id },
  });

  return NextResponse.json({ ok: true, courseTitle: option.course.title, changed: !!existingChoice });
}
