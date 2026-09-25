import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

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

  await writeAuditLog({
    actorUserId: user.id, action: body.mode === "rewrite" ? "CURRENT_TERM_REWRITTEN" : "CURRENT_TERM_SET",
    metadata: { termName: body.termName, year: body.year, previousTerm: previous ? `${previous.termName} ${previous.year}` : null, coursesReset },
  });

  return NextResponse.json({ current, coursesReset });
}
