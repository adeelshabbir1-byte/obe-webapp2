import { prisma } from "./db";
import { Slot } from "./timetableGA";

export async function buildSlots(user: { id: string; managedById: string | null }) {
  const chairmanId = user.managedById;
  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, include: { scheduleConfig: true } });
  const batchIds = batches.map((b) => b.id);

  const [sections, rooms, faculty] = await Promise.all([
    prisma.scheduleSection.findMany({ where: { course: { batchId: { in: batchIds } } }, include: { course: { include: { batch: true } } } }),
    prisma.room.findMany({ where: { chairmanId: chairmanId || "" } }),
    prisma.user.findMany({ where: { managedById: user.id }, select: { id: true } }),
  ]);
  const unavailabilityRaw = await prisma.facultyUnavailability.findMany({ where: { facultyId: { in: faculty.map((f) => f.id) } } });

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

  return { slots, rooms: roomsForGA, unavailability };
}
