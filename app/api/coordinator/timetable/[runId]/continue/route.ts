import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { chairmanIdFor } from "../../../../../../lib/reportScope";
import { runGeneticAlgorithm, Gene } from "../../../../../../lib/timetableGA";
import { buildSlots } from "../../../../../../lib/timetableSlotBuilder";

export const maxDuration = 60;
const CHUNK_MS = 4000; // kept conservative — some hosting plans hard-cap function duration well under the 60s "maxDuration" this route requests, so leave real headroom for the surrounding DB queries

export async function POST(req: Request, { params }: { params: { runId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);

  const run = await prisma.timetableRun.findUnique({ where: { id: params.runId } });
  if (!run || run.chairmanId !== chairmanId) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (run.status !== "RUNNING") return NextResponse.json({ status: run.status, hardViolations: run.hardViolations, generations: run.generations });

  const { slots, rooms, unavailability } = await buildSlots(user);
  const seed: Gene[] | undefined = run.bestChromosomeJson ? JSON.parse(run.bestChromosomeJson) : undefined;

  const timeLeftMs = run.targetEndTime ? run.targetEndTime.getTime() - Date.now() : 0;
  const chunkBudget = Math.min(CHUNK_MS, Math.max(500, timeLeftMs));

  const result = runGeneticAlgorithm(slots, rooms, unavailability, {
    populationSize: Math.min(60, Math.max(20, slots.length)), maxGenerations: 300, timeBudgetMs: chunkBudget, seed,
  });

  const totalGenerations = (run.generations || 0) + result.generations;
  const isPerfect = result.hardViolations === 0;
  const isTimeUp = !run.targetEndTime || Date.now() >= run.targetEndTime.getTime();
  const shouldFinish = isPerfect || isTimeUp;

  await prisma.timetableRun.update({
    where: { id: run.id },
    data: {
      bestChromosomeJson: JSON.stringify(result.chromosome),
      fitnessScore: result.score, hardViolations: result.hardViolations, generations: totalGenerations,
      status: shouldFinish ? "COMPLETED" : "RUNNING",
      notes: shouldFinish
        ? (result.hardViolations > 0 ? `${result.hardViolations} hard constraint violation(s) remain after ${totalGenerations} generations — review flagged entries.` : "No constraint violations.")
        : null,
    },
  });

  if (shouldFinish) {
    await prisma.timetableEntry.deleteMany({ where: { timetableRunId: run.id } });
    await prisma.timetableEntry.createMany({
      data: slots.map((slot, i) => ({
        timetableRunId: run.id, scheduleSectionId: slot.scheduleSectionId, roomId: result.chromosome[i].roomId,
        dayOfWeek: result.chromosome[i].day, startHour: result.chromosome[i].startHour, endHour: result.chromosome[i].startHour + slot.durationHours,
      })),
    });
  }

  const percentTimeUsed = run.targetEndTime
    ? Math.min(100, Math.max(0, Math.round(((run.targetEndTime.getTime() - Date.now()) < 0 ? 100 : (1 - (run.targetEndTime.getTime() - Date.now()) / (run.targetEndTime.getTime() - run.createdAt.getTime())) * 100))))
    : 0;

  return NextResponse.json({
    status: shouldFinish ? "COMPLETED" : "RUNNING",
    hardViolations: result.hardViolations, generations: totalGenerations, score: result.score, percentTimeUsed,
  });
}
