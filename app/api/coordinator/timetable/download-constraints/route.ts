import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { buildSlots } from "../../../../../lib/timetableSlotBuilder";
import { buildExcelResponse } from "../../../../../lib/excelExport";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { slots, rooms, unavailability } = await buildSlots(user);

  // Human-readable names, appended as EXTRA columns after the existing ones
  // (the existing columns/order are unchanged). The local solver program
  // uses them so its report can say "CS-101 Section A (Dr Khan)" instead of
  // an opaque id; anything that doesn't know about them just ignores them.
  const sectionIds = Array.from(new Set(slots.map((s) => s.scheduleSectionId)));
  const allBatchIds = Array.from(new Set(slots.flatMap((s) => s.batchIds)));
  const [sectionRows, roomRows, batchRows] = await Promise.all([
    prisma.scheduleSection.findMany({
      where: { id: { in: sectionIds } },
      include: { course: true, instructor: true, group: { include: { members: { include: { course: true } } } } },
    }),
    prisma.room.findMany({ where: { id: { in: rooms.map((r) => r.id) } } }),
    prisma.batch.findMany({ where: { id: { in: allBatchIds } } }),
  ]);
  const sectionById = new Map(sectionRows.map((r: any) => [r.id, r]));
  const roomNameById = new Map(roomRows.map((r: any) => [r.id, r.name]));
  const batchLabelById = new Map(batchRows.map((b: any) => [b.id, `${b.degreeProgram} — ${b.batchName}`]));
  function labelFor(sectionId: string): { label: string; instructorName: string } {
    const sec: any = sectionById.get(sectionId);
    if (!sec) return { label: "", instructorName: "" };
    const code = sec.course ? sec.course.code : (sec.group?.members?.[0]?.course?.code || sec.group?.name || "");
    const suffix = sec.group ? " (combined)" : "";
    return { label: `${code} ${sec.sectionLabel}${suffix}`.trim(), instructorName: sec.instructor?.name || "" };
  }

  const sheets = [
    {
      name: "Sections",
      columns: [
        { header: "SlotIndex", key: "slotIndex", width: 12 },
        { header: "ScheduleSectionId", key: "scheduleSectionId", width: 26 },
        { header: "BatchId", key: "batchId", width: 26 },
        { header: "InstructorId", key: "instructorId", width: 26 },
        { header: "RoomTypeNeeded", key: "roomTypeNeeded", width: 16 },
        { header: "DurationHours", key: "durationHours", width: 14 },
        { header: "StudentCount", key: "studentCount", width: 14 },
        { header: "AllowedDays", key: "allowedDays", width: 26 },
        { header: "DayStartHour", key: "dayStartHour", width: 14 },
        { header: "DayEndHour", key: "dayEndHour", width: 14 },
        // Added for readability / the local solver's report (extra, optional):
        { header: "Label", key: "label", width: 28 },
        { header: "InstructorName", key: "instructorName", width: 24 },
        { header: "BatchLabels", key: "batchLabels", width: 40 },
        { header: "PreferredDays", key: "preferredDays", width: 20 }, // instructor's preferred days (soft), comma list; blank = no preference
      ],
      // batchId stays a single joined column here for continuity with this
      // sheet's existing shape — a combined-group slot lists every member
      // batch it covers, joined, rather than getting its own column shape.
      rows: slots.map((s) => ({
        ...s, allowedDays: s.allowedDays.join(","), preferredDays: (s.preferredDays || []).join(","), batchId: s.batchIds.join(","),
        ...labelFor(s.scheduleSectionId),
        batchLabels: s.batchIds.map((b) => batchLabelById.get(b) || b).join("; "),
      })),
    },
    {
      name: "Rooms",
      columns: [
        { header: "RoomId", key: "id", width: 26 },
        { header: "Type", key: "type", width: 14 },
        { header: "Capacity", key: "capacity", width: 12 },
        { header: "RoomName", key: "roomName", width: 22 }, // extra, optional
      ],
      rows: rooms.map((r) => ({ ...r, roomName: roomNameById.get(r.id) || "" })),
    },
    {
      name: "Unavailability",
      columns: [
        { header: "FacultyId", key: "facultyId", width: 26 },
        { header: "DayOfWeek", key: "dayOfWeek", width: 14 },
        { header: "StartHour", key: "startHour", width: 12 },
        { header: "EndHour", key: "endHour", width: 12 },
      ],
      rows: unavailability,
    },
  ];

  return buildExcelResponse("timetable-constraints.xlsx", sheets);
}
