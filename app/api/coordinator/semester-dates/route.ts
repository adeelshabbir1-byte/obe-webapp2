import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const dates = await prisma.semesterDates.findMany({ where: { coordinatorId: user.id }, orderBy: [{ termYear: "desc" }, { degreeProgram: "asc" }] });
  return NextResponse.json({ dates });
}

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.degreeProgram || !body.termName || !body.termYear) {
    return NextResponse.json({ error: "degreeProgram, termName, and termYear are required" }, { status: 400 });
  }

  const record = await prisma.semesterDates.upsert({
    where: { coordinatorId_degreeProgram_termName_termYear: { coordinatorId: user.id, degreeProgram: body.degreeProgram, termName: body.termName, termYear: parseInt(body.termYear, 10) } },
    create: {
      coordinatorId: user.id, degreeProgram: body.degreeProgram, termName: body.termName, termYear: parseInt(body.termYear, 10),
      semesterStartDate: body.semesterStartDate ? new Date(body.semesterStartDate) : null,
      midtermStartDate: body.midtermStartDate ? new Date(body.midtermStartDate) : null,
      midtermEndDate: body.midtermEndDate ? new Date(body.midtermEndDate) : null,
      finalStartDate: body.finalStartDate ? new Date(body.finalStartDate) : null,
      finalEndDate: body.finalEndDate ? new Date(body.finalEndDate) : null,
    },
    update: {
      semesterStartDate: body.semesterStartDate ? new Date(body.semesterStartDate) : null,
      midtermStartDate: body.midtermStartDate ? new Date(body.midtermStartDate) : null,
      midtermEndDate: body.midtermEndDate ? new Date(body.midtermEndDate) : null,
      finalStartDate: body.finalStartDate ? new Date(body.finalStartDate) : null,
      finalEndDate: body.finalEndDate ? new Date(body.finalEndDate) : null,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "SEMESTER_DATES_SET", entityType: "SemesterDates", entityId: record.id, metadata: { degreeProgram: body.degreeProgram } });

  return NextResponse.json({ record });
}
