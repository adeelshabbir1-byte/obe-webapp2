import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { buildSlots } from "../../../../../lib/timetableSlotBuilder";
import { buildExcelResponse } from "../../../../../lib/excelExport";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { slots, rooms, unavailability } = await buildSlots(user);

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
      ],
      rows: slots.map((s) => ({ ...s, allowedDays: s.allowedDays.join(",") })),
    },
    {
      name: "Rooms",
      columns: [
        { header: "RoomId", key: "id", width: 26 },
        { header: "Type", key: "type", width: 14 },
        { header: "Capacity", key: "capacity", width: 12 },
      ],
      rows: rooms,
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
