import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const holidays = await prisma.holiday.findMany({ where: { coordinatorId: user.id }, orderBy: { date: "asc" } });
  return NextResponse.json({ holidays });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.date || !body.label) return NextResponse.json({ error: "date and label are required" }, { status: 400 });

  const holiday = await prisma.holiday.upsert({
    where: { coordinatorId_date: { coordinatorId: user.id, date: new Date(body.date) } },
    create: { coordinatorId: user.id, date: new Date(body.date), label: body.label },
    update: { label: body.label },
  });

  await writeAuditLog({ actorUserId: user.id, action: "HOLIDAY_ADDED", entityType: "Holiday", entityId: holiday.id });
  return NextResponse.json({ holiday }, { status: 201 });
}
