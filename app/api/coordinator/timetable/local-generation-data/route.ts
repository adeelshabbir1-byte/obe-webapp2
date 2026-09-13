import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { chairmanIdFor } from "../../../../../lib/reportScope";
import { buildSlots } from "../../../../../lib/timetableSlotBuilder";

// GET: everything the local script needs to run the GA on the user's own
// machine — the same data buildSlots() would use server-side.
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { slots, rooms, unavailability } = await buildSlots(user);
  return NextResponse.json({ slots, rooms, unavailability });
}

// POST: accepts a chromosome computed locally and saves it as a completed
// TimetableRun, exactly like the server-side generator would.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "no institution on record for this account" }, { status: 400 });

  const body = await req.json();
  const chromosome: { day: string; startHour: number; roomId: string }[] = body.chromosome || [];
  const hardViolations: number = body.hardViolations ?? 0;
  const generations: number = body.generations ?? 0;
  const score: number = body.score ?? 0;

  const { slots } = await buildSlots(user);
  if (chromosome.length !== slots.length) {
    return NextResponse.json({ error: "the fetched data has changed since this chromosome was generated — fetch fresh data and try again" }, { status: 400 });
  }

  const run = await prisma.timetableRun.create({
    data: {
      chairmanId, generatedById: user.id, status: "COMPLETED", fitnessScore: score, hardViolations, generations,
      notes: `Generated locally via the desktop script. ${hardViolations > 0 ? `${hardViolations} hard constraint violation(s) remain.` : "No constraint violations."}`,
    },
  });

  await prisma.timetableEntry.createMany({
    data: slots.map((slot, i) => ({
      timetableRunId: run.id, scheduleSectionId: slot.scheduleSectionId, roomId: chromosome[i].roomId,
      dayOfWeek: chromosome[i].day, startHour: chromosome[i].startHour, endHour: chromosome[i].startHour + slot.durationHours,
    })),
  });

  return NextResponse.json({ runId: run.id, hardViolations, generations });
}
