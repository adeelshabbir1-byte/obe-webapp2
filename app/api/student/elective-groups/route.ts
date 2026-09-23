import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";

// Every elective group for this student's own batch — open ones they
// can still choose or change, and finalized ones so they can see the
// outcome of a past choice. A student only ever sees their own batch's
// groups; there's no way to browse or choose for anyone else.
export async function GET() {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const groups = await prisma.electiveSlotGroup.findMany({
    where: { batchId: student.batchId },
    include: {
      options: { include: { course: { select: { code: true, title: true, catalogDescription: true } }, choices: { select: { id: true } } } },
      choices: { where: { studentId: student.id } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    groups: groups.map((g) => ({
      id: g.id, label: g.label, semesterNumber: g.semesterNumber, registrationOpen: g.registrationOpen, finalized: g.finalized,
      myChoiceOptionId: g.choices[0]?.optionId || null, myChoiceApplied: g.choices[0]?.applied || false,
      options: g.options.map((o) => ({
        id: o.id, courseCode: o.course.code, courseTitle: o.course.title, description: o.course.catalogDescription,
        capacity: o.capacity, seatsTaken: o.choices.length, full: o.capacity !== null && o.choices.length >= o.capacity,
      })),
    })),
  });
}
