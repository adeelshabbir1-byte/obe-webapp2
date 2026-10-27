import { NextResponse } from "next/server";
import { timetableActor, READ_ONLY } from "../../../../../../lib/timetableAccess";
import { prisma } from "../../../../../../lib/db";
import { chairmanIdFor } from "../../../../../../lib/reportScope";
import { Gene } from "../../../../../../lib/timetableGA";
import { buildSlots } from "../../../../../../lib/timetableSlotBuilder";

export async function POST(req: Request, { params }: { params: { runId: string } }) {
  const actor = await timetableActor();
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!actor.canEdit) return NextResponse.json({ error: READ_ONLY(actor) }, { status: 403 });
  const user = actor.user;
  const chairmanId = await chairmanIdFor(user);

  const run = await prisma.timetableRun.findUnique({ where: { id: params.runId } });
  if (!run || run.chairmanId !== chairmanId) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (run.status !== "RUNNING") return NextResponse.json({ status: run.status });
  if (!run.bestChromosomeJson) return NextResponse.json({ error: "no result yet to stop with" }, { status: 400 });

  const { slots } = await buildSlots(user);
  const chromosome: Gene[] = JSON.parse(run.bestChromosomeJson);

  await prisma.timetableRun.update({
    where: { id: run.id },
    data: { status: "STOPPED", notes: `Stopped early by the Coordinator. ${run.hardViolations || 0} hard constraint violation(s) remained.` },
  });

  await prisma.timetableEntry.deleteMany({ where: { timetableRunId: run.id } });
  await prisma.timetableEntry.createMany({
    data: slots.map((slot, i) => ({
      timetableRunId: run.id, scheduleSectionId: slot.scheduleSectionId, roomId: chromosome[i].roomId,
      dayOfWeek: chromosome[i].day, startHour: chromosome[i].startHour, endHour: chromosome[i].startHour + slot.durationHours,
    })),
  });

  return NextResponse.json({ status: "STOPPED" });
}
