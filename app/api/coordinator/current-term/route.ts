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

  const current = await prisma.currentTerm.upsert({
    where: { coordinatorId: user.id },
    create: { coordinatorId: user.id, termName: body.termName, year: parseInt(body.year, 10) },
    update: { termName: body.termName, year: parseInt(body.year, 10) },
  });

  await writeAuditLog({ actorUserId: user.id, action: "CURRENT_TERM_SET", metadata: { termName: body.termName, year: body.year } });

  return NextResponse.json({ current });
}
