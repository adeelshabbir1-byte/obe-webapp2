import { NextRequest, NextResponse } from "next/server";
import { timetableActor, READ_ONLY } from "../../../../lib/timetableAccess";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const actor = await timetableActor();
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = actor.user;

  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: actor.scope.coordinatorIds.concat("none") } }, include: { scheduleConfig: true } });
  return NextResponse.json({
    batches: batches.map((b) => ({
      id: b.id, label: `${b.degreeProgram} — ${b.batchName}`,
      workingDays: b.scheduleConfig ? JSON.parse(b.scheduleConfig.workingDaysJson) : ["Mon", "Tue", "Wed", "Thu", "Fri"],
      dailyStartHour: b.scheduleConfig?.dailyStartHour ?? 8, dailyEndHour: b.scheduleConfig?.dailyEndHour ?? 16,
    })),
  });
}

export async function PUT(req: NextRequest) {
  const actor = await timetableActor();
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!actor.canEdit) return NextResponse.json({ error: READ_ONLY(actor) }, { status: 403 });
  const user = actor.user;

  const body = await req.json();
  if (!body.batchId || !Array.isArray(body.workingDays)) return NextResponse.json({ error: "batchId and workingDays are required" }, { status: 400 });

  const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
  if (!batch || !actor.scope.coordinatorIds.includes(batch.coordinatorId)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const config = await prisma.batchScheduleConfig.upsert({
    where: { batchId: body.batchId },
    create: { batchId: body.batchId, workingDaysJson: JSON.stringify(body.workingDays), dailyStartHour: parseInt(body.dailyStartHour, 10), dailyEndHour: parseInt(body.dailyEndHour, 10) },
    update: { workingDaysJson: JSON.stringify(body.workingDays), dailyStartHour: parseInt(body.dailyStartHour, 10), dailyEndHour: parseInt(body.dailyEndHour, 10) },
  });
  return NextResponse.json({ config });
}
