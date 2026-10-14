import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { termIndex, computeCurrentSemesterNumber } from "../../../../lib/termLogic";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const current = await prisma.currentTerm.findUnique({ where: { coordinatorId: user.id } });
  return NextResponse.json({ current });
}

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.termName || !["Fall", "Spring", "Summer"].includes(body.termName) || !body.year) {
    return NextResponse.json({ error: "termName (Fall/Spring/Summer) and year are required" }, { status: 400 });
  }

  const previous = await prisma.currentTerm.findUnique({ where: { coordinatorId: user.id } });

  const current = await prisma.currentTerm.upsert({
    where: { coordinatorId: user.id },
    create: { coordinatorId: user.id, termName: body.termName, year: parseInt(body.year, 10) },
    update: { termName: body.termName, year: parseInt(body.year, 10) },
  });

  // "Rewrite" means the previously-set term was a mistake, not a real
  // semester — clear the offering data that was created under it
  // (rather than just relabeling those courses to the corrected term)
  // so the Coordinator can cleanly redo "Offer This Semester's Courses"
  // from scratch under the now-correct value. Only ever touches courses
  // actually tagged with the OLD term, never anything from a genuinely
  // earlier, already-completed semester.
  let coursesReset = 0;
  if (body.mode === "rewrite" && previous) {
    const result = await prisma.course.updateMany({
      where: { coordinatorId: user.id, isOffered: true, offeredTermName: previous.termName, offeredTermYear: previous.year },
      data: { isOffered: false, offeredTermName: null, offeredTermYear: null },
    });
    coursesReset = result.count;
  }

  if (body.mode !== "rewrite") await prisma.course.updateMany({ where: { coordinatorId: user.id, isOffered: true, offeredTermName: null }, data: { offeredTermName: current.termName, offeredTermYear: current.year } });

  // Moving to a later term moves every student of this program's batches on by the same number of semesters, so a
  // student's "current semester" never stays behind the calendar (it used to stay at 1 until someone pressed
  // "Advance semester"). A student held back keeps their gap; nobody is moved past their batch's own semester.
  let studentsAdvanced = 0;
  if (body.mode !== "rewrite" && previous && body.termName !== "Summer" && previous.termName !== "Summer") {
    const delta = termIndex(current.termName, current.year) - termIndex(previous.termName, previous.year);
    if (delta > 0) {
      const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, select: { id: true, startTerm: true, startYear: true } });
      for (const b of batches) {
        const expected = computeCurrentSemesterNumber(b, current);
        if (expected < 1) continue;
        const students = await prisma.student.findMany({ where: { batchId: b.id, currentSemesterNumber: { lt: expected } }, select: { id: true, currentSemesterNumber: true } });
        for (const st of students) {
          await prisma.student.update({ where: { id: st.id }, data: { currentSemesterNumber: Math.min(expected, st.currentSemesterNumber + delta) } });
          studentsAdvanced++;
        }
      }
    }
  }

  await writeAuditLog({
    actorUserId: user.id, action: body.mode === "rewrite" ? "CURRENT_TERM_REWRITTEN" : "CURRENT_TERM_SET",
    metadata: { termName: body.termName, year: body.year, previousTerm: previous ? `${previous.termName} ${previous.year}` : null, coursesReset, studentsAdvanced },
  });

  return NextResponse.json({ current, coursesReset, studentsAdvanced });
}
