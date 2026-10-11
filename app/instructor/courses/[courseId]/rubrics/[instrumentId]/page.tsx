import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import Shell from "../../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../../components/InstructorCourseSubNav";
import { navForRole } from "../../../../../../components/reportNav";
import RubricWorkspace from "../../../../../../components/RubricWorkspace";
import { rdb, parseCriteria, templateCriteria, type RubricRow, type RubricScoreRow } from "../../../../../../lib/rubrics";
import { getCourseResult } from "../../../../../../lib/resultApproval";

export default async function RubricPage({ params }: { params: { courseId: string; instrumentId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");
  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.instructorId !== user.id) notFound();
  const inst = await prisma.assessmentInstrument.findUnique({ where: { id: params.instrumentId } });
  if (!inst || inst.courseId !== course.id || inst.source !== "INSTRUCTOR") notFound();

  const [clos, enrollments, marks, result] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: { orderIndex: "asc" }, select: { id: true, code: true, statement: true } }),
    prisma.studentEnrollment.findMany({ where: { courseId: course.id, status: { not: "WITHDRAWN" } }, include: { student: { select: { id: true, name: true, rollNumber: true } } } }),
    prisma.studentMark.findMany({ where: { courseId: course.id, instrumentId: inst.id }, select: { studentId: true, score: true } }),
    getCourseResult(course.id),
  ]);
  // The CLOs this item is linked to through the lecture plan — suggested for its criteria.
  const linked = await prisma.lectureRowInstrument.findMany({ where: { instrumentId: inst.id }, select: { lectureRow: { select: { cloId: true } } } });
  const linkedClos = Array.from(new Set(linked.map((l) => l.lectureRow.cloId).filter((x): x is string => !!x)));
  let rubric: RubricRow | null = null, scores: RubricScoreRow[] = [], missing = false;
  try {
    rubric = (await rdb.rubric.findUnique({ where: { instrumentId: inst.id } })) as RubricRow | null;
    if (rubric) scores = (await rdb.rubricScore.findMany({ where: { rubricId: rubric.id } })) as RubricScoreRow[];
  } catch { missing = true; }
  const kind = inst.type === "Project" ? "Project" : inst.type === "Lab" ? "Lab" : "Assignment";
  const starting = rubric ? parseCriteria(rubric.criteriaJson) : templateCriteria(kind).map((c, i) => ({ ...c, cloId: linkedClos.length ? linkedClos[i % linkedClos.length] : null }));
  const markOf = new Map(marks.map((m) => [m.studentId, m.score]));
  const scoreOf = new Map(scores.map((s) => [s.studentId, s]));

  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={navForRole(user.role)}>
      <InstructorCourseSubNav courseId={course.id} active="rubrics" code={course.code} title={course.title} />
      <p style={{ marginBottom: 10 }}><Link href={`/instructor/courses/${course.id}/rubrics`}>← All rubrics</Link></p>
      {missing && <div className="err">The rubric tables are not in the database yet — run prisma/migration_rubrics.sql in Supabase.</div>}
      <RubricWorkspace
        courseId={course.id} courseLabel={`${course.code} ${course.title}`}
        instrument={{ id: inst.id, label: inst.label, type: inst.type, maxScore: inst.maxScore, marksPct: inst.marksPct }}
        saved={!!rubric} title={rubric?.title || `${inst.label} rubric`} criteria={starting}
        clos={clos} linkedClos={linkedClos}
        locked={result?.status === "SUBMITTED" || result?.status === "APPROVED"}
        students={enrollments.map((e) => e.student).sort((a, b) => a.rollNumber.localeCompare(b.rollNumber)).map((s) => ({
          id: s.id, name: s.name, roll: s.rollNumber, mark: markOf.get(s.id) ?? null,
          levels: (() => { try { return JSON.parse(scoreOf.get(s.id)?.levelsJson || "{}") as Record<string, number>; } catch { return {}; } })(),
          comment: scoreOf.get(s.id)?.comment || "",
        }))}
      />
    </Shell>
  );
}
