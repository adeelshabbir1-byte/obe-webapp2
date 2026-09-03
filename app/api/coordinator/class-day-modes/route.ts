import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const modes = await prisma.classDayMode.findMany({ where: { coordinatorId: user.id }, orderBy: { date: "asc" } });
  return NextResponse.json({ modes });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.date || !body.mode || !["Online", "OnCampus"].includes(body.mode)) {
    return NextResponse.json({ error: "date and mode (Online/OnCampus) are required" }, { status: 400 });
  }

  const mode = await prisma.classDayMode.upsert({
    where: { coordinatorId_date: { coordinatorId: user.id, date: new Date(body.date) } },
    create: { coordinatorId: user.id, date: new Date(body.date), mode: body.mode },
    update: { mode: body.mode },
  });

  await writeAuditLog({ actorUserId: user.id, action: "CLASS_DAY_MODE_SET", entityType: "ClassDayMode", entityId: mode.id });
  return NextResponse.json({ mode }, { status: 201 });
}
