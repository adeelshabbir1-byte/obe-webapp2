import { prisma } from "./db";
import { sessionNow } from "./studentActivities";

// Co-curricular engagement. Office bearers propose events from the student portal; the Student Activities coordinator
// (Student Affairs) approves them with a room, equipment and a budget. Attendance and roles at events, and holding a
// society office, earn engagement points that build each student's co-curricular record (accreditation bodies ask
// for students' non-academic development).

export const AWARD_KINDS: Record<string, { label: string; points: number }> = {
  ATTENDED: { label: "Attended", points: 2 },
  PARTICIPATED: { label: "Took part / competed", points: 5 },
  ORGANIZED: { label: "Organised", points: 10 },
  WON: { label: "Won / placed", points: 15 },
};
const LEADERSHIP: Record<string, number> = { President: 20, "Vice President": 15, "General Secretary": 15, "Joint Secretary": 10, Treasurer: 12, "Media / PR": 8, "Event Manager": 10, "Executive Member": 6, Member: 3 };
export const leadershipPoints = (position: string) => LEADERSHIP[position] ?? 6;
export const EVENT_STATUS: Record<string, [string, string]> = {
  PROPOSED: ["Waiting for approval", "badge-warn"], APPROVED: ["Approved", "badge-ok"], REJECTED: ["Not approved", "badge-no"], COMPLETED: ["Held", "badge-neutral"], CANCELLED: ["Cancelled", "badge-neutral"],
};

/** Societies in which the student holds an office this session (members can't propose events). */
export async function officesOf(studentId: string) {
  return prisma.societyMember.findMany({ where: { studentId, term: sessionNow(), NOT: { position: "Member" } }, select: { societyId: true, position: true } });
}

const minutes = (t: string | null | undefined) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
export const validTime = (t: unknown) => typeof t === "string" && minutes(t) !== null && minutes(t)! < 24 * 60;

/** Other approved events in the same room on the same day whose times overlap (no times = the whole day). */
export async function roomClashes(chairmanId: string, roomId: string, eventDate: Date, start: string | null, end: string | null, exceptId?: string) {
  const day = eventDate.toISOString().slice(0, 10);
  const same = await prisma.societyEvent.findMany({ where: { chairmanId, roomId, status: { in: ["APPROVED", "COMPLETED"] }, eventDate: { gte: new Date(day + "T00:00:00Z"), lt: new Date(new Date(day + "T00:00:00Z").getTime() + 86400000) }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true, title: true, startTime: true, endTime: true } });
  const s = minutes(start) ?? 0, e = minutes(end) ?? 24 * 60;
  return same.filter((x) => (minutes(x.startTime) ?? 0) < e && s < (minutes(x.endTime) ?? 24 * 60));
}

/** Gives points to students (by roll number) for an event; each student gets each kind of award once per event. */
export async function awardEvent(event: { id: string; societyId: string; chairmanId: string; title: string }, rollNumbers: string[], kind: string, actorId: string) {
  const award = AWARD_KINDS[kind];
  if (!award) return { error: "Choose what the students did." };
  const rolls = Array.from(new Set(rollNumbers.map((r) => r.trim()).filter(Boolean))).slice(0, 1000);
  const students = await prisma.student.findMany({ where: { rollNumber: { in: rolls }, batch: { coordinator: { managedById: event.chairmanId } } }, select: { id: true, rollNumber: true } });
  const unknown = rolls.filter((r) => !students.some((s) => s.rollNumber === r));
  let added = 0;
  for (const s of students) {
    const dedupeKey = `${s.id}|${event.id}|${kind}`;
    const exists = await prisma.engagementRecord.findUnique({ where: { dedupeKey } });
    if (exists) continue;
    await prisma.engagementRecord.create({ data: { chairmanId: event.chairmanId, studentId: s.id, societyId: event.societyId, eventId: event.id, kind, points: award.points, term: sessionNow(), note: event.title, dedupeKey, awardedById: actorId } });
    added++;
  }
  // The event's head-count follows the attendance taken.
  const attendees = await prisma.engagementRecord.findMany({ where: { eventId: event.id }, select: { studentId: true }, distinct: ["studentId"] });
  await prisma.societyEvent.update({ where: { id: event.id }, data: { participants: attendees.length, status: "COMPLETED" } });
  return { added, unknown };
}

/** Points for holding a society office in a session (once per student, society and session). */
export async function awardLeadership(chairmanId: string, societyId: string, term: string, actorId: string) {
  const bearers = await prisma.societyMember.findMany({ where: { societyId, term, studentId: { not: null } } });
  let added = 0;
  for (const m of bearers) {
    const dedupeKey = `${m.studentId}|lead|${societyId}|${term}`;
    if (await prisma.engagementRecord.findUnique({ where: { dedupeKey } })) continue;
    await prisma.engagementRecord.create({ data: { chairmanId, studentId: m.studentId!, societyId, kind: "LEADERSHIP", points: leadershipPoints(m.position), term, note: m.position, dedupeKey, awardedById: actorId } });
    added++;
  }
  return { added, bearers: bearers.length };
}

/** A student's engagement record, newest first, with the total. */
export async function pointsFor(studentId: string) {
  const rows = await prisma.engagementRecord.findMany({ where: { studentId }, orderBy: { createdAt: "desc" } });
  const societies = new Map((await prisma.studentSociety.findMany({ where: { id: { in: rows.map((r) => r.societyId).filter((x): x is string => !!x).concat(["none"]) } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
  return { total: rows.reduce((n, r) => n + r.points, 0), rows: rows.map((r) => ({ ...r, society: r.societyId ? societies.get(r.societyId) || "" : "" })) };
}

/** The most engaged students of the institute in a session, and how many students took part at all. */
export async function engagementSummary(chairmanId: string, term: string) {
  const grouped = await prisma.engagementRecord.groupBy({ by: ["studentId"], where: { chairmanId, term }, _sum: { points: true }, orderBy: { _sum: { points: "desc" } } });
  const top = grouped.slice(0, 15);
  const students = new Map((await prisma.student.findMany({ where: { id: { in: top.map((g) => g.studentId).concat(["none"]) } }, select: { id: true, name: true, rollNumber: true, batch: { select: { degreeProgram: true } } } })).map((s) => [s.id, s]));
  const enrolled = await prisma.student.count({ where: { batch: { coordinator: { managedById: chairmanId } } } });
  return { engaged: grouped.length, enrolled, top: top.map((g) => ({ ...students.get(g.studentId), points: g._sum.points || 0 })) };
}
