import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { timetableActor } from "../../../../lib/timetableAccess";
import { coversOf, getMaxSection, retiredSectionIds } from "../../../../lib/studentSections";
import { withErrors } from "../../../../lib/apiHandler";

// Every timetable section of the department timetable (offered courses only), with the student sections it covers and
// its size. A Program Lead without edit rights gets the same list (the page shows it read-only, their batches first).
async function GET_handler() {
  const actor = await timetableActor();
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const max = await getMaxSection(actor.chairmanId, actor.scope.key);
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: actor.scope.coordinatorIds.concat("none") } }, select: { id: true, degreeProgram: true, batchName: true } });
  const batchIds = batches.map((b) => b.id).concat("none");
  const bl = new Map(batches.map((b) => [b.id, `${b.degreeProgram} — ${b.batchName}`]));

  const [courseSections, groupSections] = await Promise.all([
    prisma.scheduleSection.findMany({
      where: { course: { batchId: { in: batchIds }, isOffered: true } }, // only what is offered now — old semesters' leftover sections stay hidden and unscheduled
      include: { course: { include: { batch: true } }, instructor: true },
      orderBy: [{ course: { code: "asc" } }],
    }),
    prisma.scheduleSection.findMany({
      where: { group: { members: { some: { course: { batchId: { in: batchIds }, isOffered: true } } } } },
      include: { group: { include: { members: { include: { course: { include: { batch: true } } } } } }, instructor: true },
    }),
  ]);
  const all = [...courseSections, ...groupSections];
  const retired = await retiredSectionIds(all.map((s) => s.id));
  const live = all.filter((s) => !retired.has(s.id));
  const covers = await coversOf(live.map((s) => ({ id: s.id, course: "course" in s && s.course ? { batchId: s.course.batchId } : null, group: "group" in s && s.group ? { members: s.group.members.map((m) => ({ course: { batchId: m.course.batchId, isOffered: m.course.isOffered } })) } : null })), max);
  const own = new Set(actor.ownBatchIds || []);

  const row = (s: (typeof live)[number], code: string, title: string) => {
    const cv = covers.get(s.id) || [];
    const size = cv.reduce((a, c) => a + c.size, 0);
    return {
      id: s.id, courseId: s.courseId, courseCode: code, courseTitle: title,
      batchLabel: cv.map((c) => `${bl.get(c.batchId) || "—"} · Section ${c.label} (${c.size})`).join("; ") || "—",
      batchIds: Array.from(new Set(cv.map((c) => c.batchId))), sectionKeys: cv.map((c) => `${c.batchId}#${c.label}`),
      instructorId: s.instructorId, instructorName: s.instructor.name, toAssign: !!s.instructor.isVisitingPlaceholder, sectionLabel: s.sectionLabel,
      sessionsPerWeek: s.sessionsPerWeek, sessionDurationMinutes: s.sessionDurationMinutes, roomTypeNeeded: s.roomTypeNeeded,
      size, overLimit: size > max, mine: !actor.ownBatchIds || cv.some((c) => own.has(c.batchId)),
    };
  };
  const sections = live.map((s) => ("course" in s && s.course
    ? row(s, s.course.code, s.course.title)
    : row(s, ("group" in s && s.group?.members[0]?.course.code) || ("group" in s ? s.group!.name : "—"), `${"group" in s ? s.group!.name : ""} (combined)`)))
    .sort((a, b) => a.courseCode.localeCompare(b.courseCode) || a.sectionLabel.localeCompare(b.sectionLabel));

  return NextResponse.json({ sections, max, canEdit: actor.canEdit });
}
export const GET = withErrors(GET_handler);
