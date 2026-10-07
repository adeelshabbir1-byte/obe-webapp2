import { prisma } from "./db";
import { ensureInstructorCopy } from "./instructorCopy";

// Who may name a Course Lead.
export const LEAD_MANAGER_ROLES = ["CHAIRMAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "COURSE_ASSIGNER", "OMC", "DEAN"];

export type TeamTeacher = { id: string; name: string };
export type TeamRow = { courseId: string; batch: string; semester: number | null; teachers: TeamTeacher[]; instructorId: string | null };
export type Team = { key: string; code: string; title: string; term: string; rows: TeamRow[]; teachers: TeamTeacher[]; leadId: string | null };

const termOf = (c: { offeredTermName: string | null; offeredTermYear: number | null }) => `${c.offeredTermName || ""} ${c.offeredTermYear || ""}`.trim();

/** Every "course team" in the institute this term: sections/batches of the same course (same code, or one equivalence group)
 * taught by two or more different teachers. One of them may be named the Course Lead. */
export async function loadTeams(chairmanId: string): Promise<Team[]> {
  const [courses, leads] = await Promise.all([
    prisma.course.findMany({
      where: { isOffered: true, coordinator: { managedById: chairmanId } },
      select: {
        id: true, code: true, title: true, semesterNumber: true, offeredTermName: true, offeredTermYear: true, instructorId: true,
        instructor: { select: { id: true, name: true } },
        batch: { select: { degreeProgram: true, batchName: true } },
        equivalenceMember: { select: { groupId: true } },
        sectionAssignments: { select: { instructor: { select: { id: true, name: true } } } },
      },
    }),
    prisma.courseLead.findMany({ where: { chairmanId } }),
  ]);
  const leadByKey = new Map<string, string>(leads.map((l) => [l.teamKey, l.leadId]));
  const teams: Map<string, Team> = new Map();
  for (const c of courses) {
    const teachers = new Map<string, string>();
    if (c.instructor) teachers.set(c.instructor.id, c.instructor.name);
    for (const a of c.sectionAssignments) teachers.set(a.instructor.id, a.instructor.name);
    if (teachers.size === 0) continue;
    const term = termOf(c);
    const key = (c.equivalenceMember ? `g:${c.equivalenceMember.groupId}` : `c:${c.code.trim().toLowerCase()}`) + `|${term}`;
    const team: Team = teams.get(key) || { key, code: c.code, title: c.title, term, rows: [], teachers: [], leadId: leadByKey.get(key) || null };
    team.rows.push({
      courseId: c.id, batch: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—", semester: c.semesterNumber,
      teachers: Array.from(teachers.entries()).map(([id, name]) => ({ id, name })), instructorId: c.instructorId,
    });
    const all = new Map<string, string>(team.teachers.map((t) => [t.id, t.name]));
    teachers.forEach((n, id) => all.set(id, n));
    team.teachers = Array.from(all.entries()).map(([id, name]) => ({ id, name }));
    teams.set(key, team);
  }
  return Array.from(teams.values()).filter((t) => t.teachers.length >= 2).sort((a, b) => a.code.localeCompare(b.code));
}

/** When everyone has approved the lead's paper, each other section gets the same distribution for that exam
 * (lectures and CLOs are matched by lecture number and CLO code). */
export async function syncApprovedPaper(team: Team, leadCourseId: string, examType: string) {
  const items = await prisma.paperDistributionItem.findMany({
    where: { courseId: leadCourseId, source: "INSTRUCTOR", examType }, orderBy: { orderIndex: "asc" },
    include: { lectureRow: { select: { lectureNumber: true } }, clo: { select: { code: true } } },
  });
  for (const row of team.rows) {
    if (row.courseId === leadCourseId) continue;
    await ensureInstructorCopy(row.courseId);
    const [lectures, clos] = await Promise.all([
      prisma.lectureRow.findMany({ where: { courseId: row.courseId, source: "INSTRUCTOR" }, select: { id: true, lectureNumber: true } }),
      prisma.cLO.findMany({ where: { courseId: row.courseId, source: "INSTRUCTOR" }, select: { id: true, code: true } }),
    ]);
    const lectureId = new Map<number, string>(lectures.map((l) => [l.lectureNumber, l.id]));
    const cloId = new Map<string, string>(clos.map((c) => [c.code, c.id]));
    await prisma.paperDistributionItem.deleteMany({ where: { courseId: row.courseId, source: "INSTRUCTOR", examType } });
    if (items.length === 0) continue;
    await prisma.paperDistributionItem.createMany({
      data: items.map((i, idx) => ({
        courseId: row.courseId, source: "INSTRUCTOR", examType, questionNo: i.questionNo, orderIndex: idx,
        lectureRowId: i.lectureRow ? lectureId.get(i.lectureRow.lectureNumber) || null : null,
        topicText: i.topicText, cloId: i.clo ? cloId.get(i.clo.code) || null : null, cognitiveLevel: i.cognitiveLevel, marks: i.marks,
      })),
    });
  }
}
