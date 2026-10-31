import { prisma } from "./db";
import { Slot } from "./timetableGA";
import { timetableScopeFor, busyElsewhere } from "./timetableScope";
import { coversOf, retiredSectionIds, sectionKey, getMaxSection } from "./studentSections";

// One run covers one "scope" (see timetableScope.ts): every department on the shared timetable together, or a single
// department that keeps its own timetable and rooms. Teachers lent across scopes are kept free at the times they already
// teach in another scope's current timetable.
// Friday prayer break — no classes in this window (set here if the time ever changes).
export const JUMMAH_BREAK = { day: "Fri", startHour: 13, endHour: 14 };

// A slot's batchIds are STUDENT SECTIONS ("batchId#A"): Section A and Section B of one batch are different students and
// may run at the same time; one student section is never in two places at once; a combined class lists every student
// section it covers. StudentCount is the real size of what the section covers.
export async function buildSlots(user: { id: string; managedById: string | null }) {
  const chairmanId = user.managedById;
  const scope = await timetableScopeFor(user);
  const max = await getMaxSection(chairmanId || "", scope.key);
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: scope.coordinatorIds } }, include: { scheduleConfig: true } });
  const batchIds = batches.map((b) => b.id);
  const configByBatch = new Map(batches.map((b) => [b.id, b.scheduleConfig]));
  const batchLabel = new Map(batches.map((b) => [b.id, `${b.degreeProgram} — ${b.batchName}`]));

  // Intersect allowed days and take the tightest hour window across every batch a slot covers.
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

  const [courseSections, groupSections, roomsAll] = await Promise.all([
    // Only sections of courses that are offered NOW — an earlier semester's leftover sections are not scheduled again.
    prisma.scheduleSection.findMany({ where: { course: { batchId: { in: batchIds }, isOffered: true } }, include: { course: { select: { id: true, batchId: true, isOffered: true } } } }),
    prisma.scheduleSection.findMany({
      where: { group: { members: { some: { course: { batchId: { in: batchIds }, isOffered: true } } } } },
      include: { group: { include: { members: { include: { course: { select: { id: true, batchId: true, isOffered: true } } } } } } },
    }),
    prisma.room.findMany({ where: scope.roomWhere }),
  ]);
  // Multi-campus: batches are timetabled only into rooms of their own campus.
  const rooms = await (await import("./campus")).campusRooms(roomsAll, batchIds);

  const all = [...courseSections, ...groupSections];
  const retired = await retiredSectionIds(all.map((s) => s.id));
  const live = all.filter((s) => !retired.has(s.id));
  const covers = await coversOf(live as never, max);
  const explicit = new Set(((await (prisma as unknown as Record<string, any>).scheduleSectionCover.findMany({ where: { scheduleSectionId: { in: live.map((s) => s.id).concat("none") } }, select: { scheduleSectionId: true } }).catch(() => [])) as { scheduleSectionId: string }[]).map((r) => r.scheduleSectionId));

  // "Visiting Faculty (to be decided)" is a placeholder, not one person: every visiting section gets its own virtual teacher.
  const visitingIds = new Set<string>((await prisma.user.findMany({ where: { isVisitingPlaceholder: true, managedById: chairmanId || "" }, select: { id: true } })).map((u) => u.id));
  const teacherOf = (sectionId: string, instructorId: string) => (visitingIds.has(instructorId) ? `visiting:${sectionId}` : instructorId);

  // Only GENUINE duplicates are left out: two sections covering the same student section of the same course and room type
  // (e.g. a course's own section left over after it was combined). Sections made with student sections come first, then
  // older ones; within that by label.
  const ty = (t: string) => (t === "LAB" ? "LAB" : "TH");
  const order = live.slice().sort((a, b) => Number(explicit.has(b.id)) - Number(explicit.has(a.id)) || a.sectionLabel.localeCompare(b.sectionLabel) || a.id.localeCompare(b.id));
  const claimed = new Set<string>();
  const kept: typeof live = [];
  const duplicates: string[] = [];
  for (const s of order) {
    const cv = (covers.get(s.id) || []).filter((c) => batchIds.includes(c.batchId));
    if (!cv.length) continue;
    const courseFor = (bId: string) => ("course" in s && s.course ? [s.course.id] : (("group" in s && s.group?.members) || []).filter((m) => m.course.batchId === bId && m.course.isOffered).map((m) => m.course.id));
    const keys = cv.flatMap((c) => courseFor(c.batchId).map((cid) => `${cid}|${ty(s.roomTypeNeeded)}|${sectionKey(c.batchId, c.label)}`));
    if (keys.some((k) => claimed.has(k))) { duplicates.push(s.id); continue; }
    keys.forEach((k) => claimed.add(k));
    kept.push(s);
  }

  const slots: Slot[] = [];
  let slotIndex = 0;
  for (const s of kept) {
    const cv = (covers.get(s.id) || []).filter((c) => batchIds.includes(c.batchId));
    const keys = cv.map((c) => sectionKey(c.batchId, c.label));
    const labels = cv.map((c) => `${batchLabel.get(c.batchId) || c.batchId} — Section ${c.label}`);
    const { allowedDays, dayStartHour, dayEndHour } = resolveWindow(Array.from(new Set(cv.map((c) => c.batchId))));
    const studentCount = cv.reduce((a, c) => a + c.size, 0);
    for (let occurrence = 0; occurrence < s.sessionsPerWeek; occurrence++) {
      slots.push({
        slotIndex: slotIndex++, scheduleSectionId: s.id, courseId: s.courseId, batchIds: keys, batchLabels: labels,
        instructorId: teacherOf(s.id, s.instructorId), roomTypeNeeded: s.roomTypeNeeded, durationHours: s.sessionDurationMinutes / 60,
        studentCount, allowedDays, dayStartHour, dayEndHour,
      });
    }
  }

  // Everyone who actually teaches in this run - including a teacher borrowed from another department.
  const teacherIds = Array.from(new Set(slots.map((sl) => sl.instructorId).filter((id) => id && !id.startsWith("visiting:"))));
  const faculty = await prisma.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, preferredDays: true } });
  const unavailabilityRaw = await prisma.facultyUnavailability.findMany({ where: { facultyId: { in: teacherIds } } });
  const prefByFaculty = new Map<string, string[]>(faculty.map((f): [string, string[]] => [f.id, (f.preferredDays || "").split(",").filter(Boolean)]));
  for (const sl of slots) {
    const pref = prefByFaculty.get(sl.instructorId);
    if (pref && pref.length > 0) sl.preferredDays = pref;
  }

  // Already teaching in another department's own timetable -> not free here.
  const elsewhere = await busyElsewhere(chairmanId || "", scope.key, teacherIds);
  const unavailability: { facultyId: string; dayOfWeek: string; startHour: number; endHour: number; batchIds?: string[] }[] = [...unavailabilityRaw, ...elsewhere].map((u) => ({ facultyId: u.facultyId, dayOfWeek: u.dayOfWeek, startHour: u.startHour, endHour: u.endHour }));
  // Jummah break: nobody is scheduled to teach during it, so no class (of any batch) can fall in that hour.
  for (const instructorId of new Set(slots.map((sl) => sl.instructorId).filter(Boolean))) {
    unavailability.push({ facultyId: instructorId, dayOfWeek: JUMMAH_BREAK.day, startHour: JUMMAH_BREAK.startHour, endHour: JUMMAH_BREAK.endHour });
  }
  // Events planned before the timetable is published hold their slot: no class of the batches they involve is put there.
  const events = (await (prisma as unknown as Record<string, any>).plannedEvent.findMany({ where: { chairmanId: chairmanId || "", beforePublication: true, date: { gte: new Date(Date.now() - 864e5) } } }).catch(() => [])) as { date: Date; startHour: number; endHour: number; batchIdsJson: string }[];
  for (const e of events) unavailability.push({ facultyId: "", dayOfWeek: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(e.date).getUTCDay()], startHour: e.startHour, endHour: e.endHour, batchIds: JSON.parse(e.batchIdsJson || "[]") });
  const roomsForGA = rooms.map((r) => ({ id: r.id, type: r.type, capacity: r.capacity }));

  return { slots, rooms: roomsForGA, unavailability, scope, max, duplicates };
}
