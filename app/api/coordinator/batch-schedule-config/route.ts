import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, include: { scheduleConfig: true } });
  return NextResponse.json({
    batches: batches.map((b) => ({
      id: b.id, label: `${b.degreeProgram} — ${b.batchName}`,
      workingDays: b.scheduleConfig ? JSON.parse(b.scheduleConfig.workingDaysJson) : ["Mon", "Tue", "Wed", "Thu", "Fri"],
      dailyStartHour: b.scheduleConfig?.dailyStartHour ?? 8, dailyEndHour: b.scheduleConfig?.dailyEndHour ?? 16,
    })),
  });
}

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.batchId || !Array.isArray(body.workingDays)) return NextResponse.json({ error: "batchId and workingDays are required" }, { status: 400 });

  const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const config = await prisma.batchScheduleConfig.upsert({
    where: { batchId: body.batchId },
    create: { batchId: body.batchId, workingDaysJson: JSON.stringify(body.workingDays), dailyStartHour: parseInt(body.dailyStartHour, 10), dailyEndHour: parseInt(body.dailyEndHour, 10) },
    update: { workingDaysJson: JSON.stringify(body.workingDays), dailyStartHour: parseInt(body.dailyStartHour, 10), dailyEndHour: parseInt(body.dailyEndHour, 10) },
  });
  return NextResponse.json({ config });
}
