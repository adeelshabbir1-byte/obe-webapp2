import { prisma } from "./db";
import { Slot } from "./timetableGA";

// Timetable generation stays siloed per Coordinator, same as everywhere
// else in this system (their own batches, their own faculty pool, their
// own rooms via the shared chairman). A Course Equivalence Group whose
// members span batches under DIFFERENT coordinators is a known boundary
// this doesn't solve — each coordinator would generate their own slot for
// their own member batches only, with no cross-coordinator conflict check.
// Friday prayer break — no classes in this window (set here if the time ever changes).
export const JUMMAH_BREAK = { day: "Fri", startHour: 13, endHour: 14 };

export async function buildSlots(user: { id: string; managedById: string | null }) {
  const chairmanId = user.managedById;
  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, include: { scheduleConfig: true } });
  const batchIds = batches.map((b) => b.id);
  const configByBatch = new Map(batches.map((b) => [b.id, b.scheduleConfig]));

  // Intersect allowed days and take the tightest hour window across every
  // batch a slot covers — for a standalone course that's just its one
  // batch's own config; for a combined group it's every member batch,
  // since all of them must actually be free at whatever time is picked.
  function resolveWindow(memberBatchIds: string[]) {
    let allowedDays: string[] | null = null;
    let dayStartHour = 8, dayEndHour = 16;
    for (const bId of memberBatchIds) {
      const config = configByBatch.get(bId);
      const days: string[] = config ? JSON.parse(config.workingDaysJson) : ["Mon", "Tue", "Wed", "Thu", "Fri"];
      allowedDays = allowedDays === null ? days : allowedDays.filter((d) => days.includes(d));
      dayStartHour = Math.max(dayStartHour, config?.dailyStartHour ?? 8);
      dayEndHour = Math.min(dayEndHour, config?.dailyEndHour ?? 16);
    }
    return { allowedDays: allowedDays && allowedDays.length > 0 ? allowedDays : ["Mon", "Tue", "Wed", "Thu", "Fri"], dayStartHour, dayEndHour };
  }

  const [courseSections, groupSections, rooms, faculty] = await Promise.all([
    // Only sections of courses that are offered NOW — a course that is no longer offered (an earlier semester of a batch that has moved on)
    // can leave its old sections behind, and those must not take up room hours or be scheduled again.
    prisma.scheduleSection.findMany({ where: { course: { batchId: { in: batchIds }, isOffered: true } }, include: { course: { include: { batch: true } } } }),
    prisma.scheduleSection.findMany({
      where: { group: { members: { some: { course: { batchId: { in: batchIds }, isOffered: true } } } } },
      include: { group: { include: { members: { include: { course: { include: { batch: true } } } } } } },
    }),
    prisma.room.findMany({ where: { chairmanId: chairmanId || "" } }),
    prisma.user.findMany({ where: { managedById: user.id }, select: { id: true, preferredDays: true } }),
  ]);
  const unavailabilityRaw = await prisma.facultyUnavailability.findMany({ where: { facultyId: { in: faculty.map((f) => f.id) } } });

  const slots: Slot[] = [];
  let slotIndex = 0;

  // A batch attends ONE section of a course. Stale/duplicate/parallel sections (a course's own section left over after it was combined,
  // or several sections of one combined group) would otherwise each demand their own time for the same batch and make a clash-free
  // timetable impossible. So: one section per group+type, and a course covered by a group isn't also scheduled on its own.
  const ty = (t: string) => (t === "LAB" ? "LAB" : "TH");
  const byLabel = (a: { sectionLabel: string; id: string }, b: { sectionLabel: string; id: string }) => a.sectionLabel.localeCompare(b.sectionLabel) || a.id.localeCompare(b.id);
  const seenGroup = new Set<string>();
  const keptGroupSections = [...groupSections].sort(byLabel).filter((s) => {
    if (!s.groupId) return false;
    const k = `${s.groupId}|${ty(s.roomTypeNeeded)}`;
    if (seenGroup.has(k)) return false;
    seenGroup.add(k);
    return true;
  });
  const covered = new Set<string>();
  for (const s of keptGroupSections) for (const m of s.group?.members || []) covered.add(`${m.courseId}|${ty(s.roomTypeNeeded)}`);
  const seenCourse = new Set<string>();
  const keptCourseSections = [...courseSections].sort(byLabel).filter((s) => {
    const k = `${s.courseId}|${ty(s.roomTypeNeeded)}`;
    if (covered.has(k) || seenCourse.has(k)) return false;
    seenCourse.add(k);
    return true;
  });

  for (const s of keptCourseSections) {
    if (!s.course?.batch) continue;
    const { allowedDays, dayStartHour, dayEndHour } = resolveWindow([s.course.batch.id]);
    for (let occurrence = 0; occurrence < s.sessionsPerWeek; occurrence++) {
      slots.push({
        slotIndex: slotIndex++, scheduleSectionId: s.id, courseId: s.courseId, batchIds: [s.course.batch.id],
        instructorId: s.instructorId, roomTypeNeeded: s.roomTypeNeeded, durationHours: s.sessionDurationMinutes / 60,
        studentCount: s.course.batch.studentCount, allowedDays, dayStartHour, dayEndHour,
      });
    }
  }

  // A group's combined enrollment is split evenly across however many
  // sections currently exist for it. This is an approximation, not a real
  // roster — nothing yet tracks which specific student is in which
  // section of a combined class — but it keeps the room-capacity check
  // honest instead of assuming every one of N sections holds the group's
  // FULL combined total.
  const sectionsPerGroup = new Map<string, number>();
  for (const s of groupSections) {
    if (!s.groupId) continue;
    sectionsPerGroup.set(s.groupId, (sectionsPerGroup.get(s.groupId) || 0) + 1);
  }

  for (const s of keptGroupSections) {
    if (!s.groupId || !s.group) continue;
    const memberBatches = s.group.members.filter((m) => m.course.isOffered).map((m) => m.course.batch).filter((b): b is NonNullable<typeof b> => !!b);
    const memberBatchIdsInScope = memberBatches.map((b) => b.id).filter((id) => batchIds.includes(id));
    if (memberBatchIdsInScope.length === 0) continue; // none of this group's member batches belong to this coordinator
    const combinedTotal = memberBatches.reduce((sum, b) => sum + b.studentCount, 0);
    const studentCount = combinedTotal; // one scheduled section per group, so it holds the whole combined class
    const { allowedDays, dayStartHour, dayEndHour } = resolveWindow(memberBatches.map((b) => b.id));
    for (let occurrence = 0; occurrence < s.sessionsPerWeek; occurrence++) {
      slots.push({
        slotIndex: slotIndex++, scheduleSectionId: s.id, courseId: null, batchIds: memberBatchIdsInScope,
        instructorId: s.instructorId, roomTypeNeeded: s.roomTypeNeeded, durationHours: s.sessionDurationMinutes / 60,
        studentCount, allowedDays, dayStartHour, dayEndHour,
      });
    }
  }

  const prefByFaculty = new Map<string, string[]>(faculty.map((f): [string, string[]] => [f.id, (f.preferredDays || "").split(",").filter(Boolean)]));
  for (const sl of slots) {
    const pref = prefByFaculty.get(sl.instructorId);
    if (pref && pref.length > 0) sl.preferredDays = pref;
  }

  const unavailability = unavailabilityRaw.map((u) => ({ facultyId: u.facultyId, dayOfWeek: u.dayOfWeek, startHour: u.startHour, endHour: u.endHour }));
  // Jummah break: nobody is scheduled to teach during it, so no class (of any batch) can fall in that hour.
  for (const instructorId of new Set(slots.map((sl) => sl.instructorId).filter(Boolean))) {
    unavailability.push({ facultyId: instructorId, dayOfWeek: JUMMAH_BREAK.day, startHour: JUMMAH_BREAK.startHour, endHour: JUMMAH_BREAK.endHour });
  }
  const roomsForGA = rooms.map((r) => ({ id: r.id, type: r.type, capacity: r.capacity }));

  return { slots, rooms: roomsForGA, unavailability };
}
