import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { chairmanIdFor } from "../../../../../lib/reportScope";
import { runGeneticAlgorithm } from "../../../../../lib/timetableGA";
import { buildSlots } from "../../../../../lib/timetableSlotBuilder";

export const maxDuration = 60;

// Starts a new background run: creates the TimetableRun row (status
// RUNNING) and immediately runs the first short chunk of the GA, so the
// very first poll already has a result. The client then repeatedly calls
// the /continue endpoint until status flips to COMPLETED or the user stops.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "no institution on record for this account" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const maxMinutes = Math.min(30, Math.max(1, parseInt(body.maxMinutes, 10) || 30));

  const { slots, rooms } = await buildSlots(user);
  if (rooms.length === 0) return NextResponse.json({ error: "add at least one room before generating a timetable" }, { status: 400 });
  if (slots.length === 0) return NextResponse.json({ error: "no schedule sections found — auto-generate them from your offered courses first" }, { status: 400 });

  const targetEndTime = new Date(Date.now() + maxMinutes * 60 * 1000);

  const run = await prisma.timetableRun.create({
    data: { chairmanId, generatedById: user.id, status: "RUNNING", targetEndTime, generations: 0 },
  });

  return NextResponse.json({ runId: run.id, status: "RUNNING" });
}
