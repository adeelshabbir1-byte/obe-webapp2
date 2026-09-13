import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { chairmanIdFor } from "../../../../../lib/reportScope";
import { buildSlots } from "../../../../../lib/timetableSlotBuilder";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "no institution on record for this account" }, { status: 400 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const sheet = workbook.getWorksheet("Solution");
  if (!sheet) return NextResponse.json({ error: 'this file has no "Solution" sheet — make sure the desktop tool actually finished and wrote its output file' }, { status: 400 });

  const solutionBySlotIndex = new Map<number, { day: string; startHour: number; roomId: string }>();
  let hardViolations = 0, generations = 0, score = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const slotIndex = Number(row.getCell(1).value);
    const day = String(row.getCell(2).value || "");
    const startHour = Number(row.getCell(3).value);
    const roomId = String(row.getCell(4).value || "");
    if (!isNaN(slotIndex) && day && !isNaN(startHour) && roomId) {
      solutionBySlotIndex.set(slotIndex, { day, startHour, roomId });
    }
  });

  const summarySheet = workbook.getWorksheet("Summary");
  if (summarySheet) {
    hardViolations = Number(summarySheet.getCell("B1").value) || 0;
    generations = Number(summarySheet.getCell("B2").value) || 0;
    score = Number(summarySheet.getCell("B3").value) || 0;
  }

  const { slots } = await buildSlots(user);
  if (solutionBySlotIndex.size !== slots.length) {
    return NextResponse.json({
      error: `this solution has ${solutionBySlotIndex.size} entries, but your current setup needs ${slots.length} — your rooms/sections may have changed since you downloaded the constraints file. Download a fresh copy and regenerate.`,
    }, { status: 400 });
  }

  const run = await prisma.timetableRun.create({
    data: {
      chairmanId, generatedById: user.id, status: "COMPLETED", fitnessScore: score, hardViolations, generations,
      notes: `Generated locally via the desktop tool. ${hardViolations > 0 ? `${hardViolations} hard constraint violation(s) remain.` : "No constraint violations."}`,
    },
  });

  await prisma.timetableEntry.createMany({
    data: slots.map((slot) => {
      const sol = solutionBySlotIndex.get(slot.slotIndex)!;
      return {
        timetableRunId: run.id, scheduleSectionId: slot.scheduleSectionId, roomId: sol.roomId,
        dayOfWeek: sol.day, startHour: sol.startHour, endHour: sol.startHour + slot.durationHours,
      };
    }),
  });

  return NextResponse.json({ runId: run.id, hardViolations, generations });
}
