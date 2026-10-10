import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";

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

  // Only the signed-in student can choose, and only for their own batch: nobody can pick on behalf of a classmate.
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "Please sign in with your student login first." }, { status: 401 });
  if (student.batchId !== group.batchId) return NextResponse.json({ error: "This elective is not for your batch." }, { status: 403 });

  const body = await req.json();
  const optionId = String(body.optionId || "");
  if (!optionId) return NextResponse.json({ error: "Choose one of the options." }, { status: 400 });

  const option = await prisma.electiveSlotOption.findUnique({ where: { id: optionId }, include: { choices: true, course: { select: { title: true } } } });
  if (!option || option.groupId !== group.id) return NextResponse.json({ error: "invalid option" }, { status: 400 });

  // Re-checked here too (not just client-side) since two students could
  // submit around the same moment — this is a soft, submit-time check;
  // Finalize is the authoritative, first-come-first-served resolution
  // if the margin is genuinely contested.
  const existingChoice = await prisma.electiveChoice.findUnique({ where: { groupId_studentId: { groupId: group.id, studentId: student.id } } });
  if ((!existingChoice || existingChoice.optionId !== option.id) && option.capacity !== null && option.choices.length >= option.capacity) {
    return NextResponse.json({ error: `${option.course.title} is currently full. Choose a different option, or check back — a Coordinator may adjust capacity.` }, { status: 400 });
  }

  const choice = await prisma.electiveChoice.upsert({
    where: { groupId_studentId: { groupId: group.id, studentId: student.id } },
    update: { optionId: option.id, submittedAt: new Date() },
    create: { groupId: group.id, studentId: student.id, optionId: option.id },
  });

  return NextResponse.json({ ok: true, studentName: student.name.split(" ")[0], courseTitle: option.course.title, changed: !!existingChoice, choiceId: choice.id });
}
