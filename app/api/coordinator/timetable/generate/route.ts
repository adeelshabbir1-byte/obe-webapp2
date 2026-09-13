import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { chairmanIdFor } from "../../../../../lib/reportScope";
import { runGeneticAlgorithm, Slot } from "../../../../../lib/timetableGA";

export const maxDuration = 60;

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "no institution on record for this account" }, { status: 400 });

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, include: { scheduleConfig: true } });
  const batchIds = batches.map((b) => b.id);

  const [sections, rooms, faculty] = await Promise.all([
    prisma.scheduleSection.findMany({ where: { course: { batchId: { in: batchIds } } }, include: { course: { include: { batch: true } } } }),
    prisma.room.findMany({ where: { chairmanId } }),
    prisma.user.findMany({ where: { managedById: user.id }, select: { id: true } }),
  ]);
  const unavailabilityRaw = await prisma.facultyUnavailability.findMany({ where: { facultyId: { in: faculty.map((f) => f.id) } } });

  if (rooms.length === 0) return NextResponse.json({ error: "add at least one room before generating a timetable" }, { status: 400 });
  if (sections.length === 0) return NextResponse.json({ error: "no schedule sections found — auto-generate them from your offered courses first" }, { status: 400 });

  const configByBatch = new Map(batches.map((b) => [b.id, b.scheduleConfig]));

  const slots: Slot[] = [];
  let slotIndex = 0;
  for (const s of sections) {
    if (!s.course.batch) continue;
    const config = configByBatch.get(s.course.batch.id);
    const allowedDays: string[] = config ? JSON.parse(config.workingDaysJson) : ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const dayStartHour = config?.dailyStartHour ?? 8;
    const dayEndHour = config?.dailyEndHour ?? 16;

    for (let occurrence = 0; occurrence < s.sessionsPerWeek; occurrence++) {
      slots.push({
        slotIndex: slotIndex++, scheduleSectionId: s.id, courseId: s.courseId, batchId: s.course.batch.id,
        instructorId: s.instructorId, roomTypeNeeded: s.roomTypeNeeded, durationHours: s.sessionDurationMinutes / 60,
        studentCount: s.course.batch.studentCount, allowedDays, dayStartHour, dayEndHour,
      });
    }
  }

  const unavailability = unavailabilityRaw.map((u) => ({ facultyId: u.facultyId, dayOfWeek: u.dayOfWeek, startHour: u.startHour, endHour: u.endHour }));
  const roomsForGA = rooms.map((r) => ({ id: r.id, type: r.type, capacity: r.capacity }));

  const result = runGeneticAlgorithm(slots, roomsForGA, unavailability, { populationSize: Math.min(60, Math.max(20, slots.length)), maxGenerations: 200, timeBudgetMs: 45000 });

  const run = await prisma.timetableRun.create({
    data: {
      chairmanId, generatedById: user.id, status: "COMPLETED",
      fitnessScore: result.score, hardViolations: result.hardViolations, generations: result.generations,
      notes: result.hardViolations > 0 ? `${result.hardViolations} hard constraint violation(s) remain — review flagged entries.` : "No constraint violations.",
    },
  });

  await prisma.timetableEntry.createMany({
    data: slots.map((slot, i) => ({
      timetableRunId: run.id, scheduleSectionId: slot.scheduleSectionId, roomId: result.chromosome[i].roomId,
      dayOfWeek: result.chromosome[i].day, startHour: result.chromosome[i].startHour, endHour: result.chromosome[i].startHour + slot.durationHours,
    })),
  });

  return NextResponse.json({ runId: run.id, hardViolations: result.hardViolations, generations: result.generations, score: result.score });
}
