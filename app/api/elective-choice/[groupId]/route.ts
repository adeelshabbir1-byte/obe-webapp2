import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";

// Fully public — no login, matching how Feedback Survey links work,
// since students have no account anywhere in this system. Identifies
// the student by roll number (checked against this group's own batch)
// rather than a per-person token.
export async function GET(req: NextRequest, { params }: { params: { groupId: string } }) {
  const group = await prisma.electiveSlotGroup.findUnique({
    where: { id: params.groupId },
    include: {
      batch: { select: { degreeProgram: true, batchName: true } },
      options: { include: { course: { select: { code: true, title: true, catalogDescription: true } }, choices: { select: { id: true } } } },
    },
  });
  if (!group) return NextResponse.json({ error: "invalid link" }, { status: 404 });

  return NextResponse.json({
    label: group.label, batchLabel: `${group.batch.degreeProgram} — ${group.batch.batchName}`,
    registrationOpen: group.registrationOpen, finalized: group.finalized,
    options: group.options.map((o) => ({
      id: o.id, courseCode: o.course.code, courseTitle: o.course.title, description: o.course.catalogDescription,
      capacity: o.capacity, seatsTaken: o.choices.length,
      full: o.capacity !== null && o.choices.length >= o.capacity,
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: { groupId: string } }) {
  const group = await prisma.electiveSlotGroup.findUnique({ where: { id: params.groupId } });
  if (!group) return NextResponse.json({ error: "invalid link" }, { status: 404 });
  if (!group.registrationOpen) return NextResponse.json({ error: "Registration for this elective isn't open right now — check with your Program Coordinator." }, { status: 400 });

  const body = await req.json();
  const rollNumber = String(body.rollNumber || "").trim();
  const optionId = String(body.optionId || "");
  if (!rollNumber || !optionId) return NextResponse.json({ error: "Roll number and a chosen option are required." }, { status: 400 });

  const student = await prisma.student.findFirst({ where: { batchId: group.batchId, rollNumber } });
  if (!student) return NextResponse.json({ error: "That roll number wasn't found in this batch — double check it and try again." }, { status: 404 });

  const option = await prisma.electiveSlotOption.findUnique({ where: { id: optionId }, include: { choices: true, course: { select: { title: true } } } });
  if (!option || option.groupId !== group.id) return NextResponse.json({ error: "invalid option" }, { status: 400 });

  // Re-checked here too (not just client-side) since two students could
  // submit around the same moment — this is a soft, submit-time check;
  // Finalize is the authoritative, first-come-first-served resolution
  // if the margin is genuinely contested.
  const existingChoice = await prisma.electiveChoice.findUnique({ where: { groupId_studentId: { groupId: group.id, studentId: student.id } } });
  if (!existingChoice && option.capacity !== null && option.choices.length >= option.capacity) {
    return NextResponse.json({ error: `${option.course.title} is currently full. Choose a different option, or check back — a Coordinator may adjust capacity.` }, { status: 400 });
  }

  const choice = await prisma.electiveChoice.upsert({
    where: { groupId_studentId: { groupId: group.id, studentId: student.id } },
    update: { optionId: option.id, submittedAt: new Date() },
    create: { groupId: group.id, studentId: student.id, optionId: option.id },
  });

  return NextResponse.json({ ok: true, studentName: student.name, courseTitle: option.course.title, changed: !!existingChoice, choiceId: choice.id });
}
