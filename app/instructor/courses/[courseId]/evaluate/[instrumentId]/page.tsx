import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import Shell from "../../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../../components/InstructorCourseSubNav";
import EvaluateWindow from "../../../../../../components/EvaluateWindow";
import { navForRole } from "../../../../../../components/reportNav";
import { rdb, parseCriteria, type RubricRow, type RubricScoreRow } from "../../../../../../lib/rubrics";
import { canEvaluate, groupsOf } from "../../../../../../lib/workGroups";

export const dynamic = "force-dynamic";

// Evaluate a project (or any rubric item) by group, with individual changes.
export default async function EvaluatePage({ params }: { params: { courseId: string; instrumentId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!(await canEvaluate(user, params.courseId))) redirect("/dashboard");
  const [course, inst] = await Promise.all([
    prisma.course.findUnique({ where: { id: params.courseId }, select: { id: true, code: true, title: true } }),
    prisma.assessmentInstrument.findUnique({ where: { id: params.instrumentId } }),
  ]);
  if (!course || !inst || inst.courseId !== course.id) notFound();
  const rubric = (await rdb.rubric.findUnique({ where: { instrumentId: inst.id } }).catch(() => null)) as RubricRow | null;
  const [enrol, scores, groups, clos] = await Promise.all([
    prisma.studentEnrollment.findMany({ where: { courseId: course.id, status: { not: "WITHDRAWN" } }, select: { student: { select: { id: true, name: true, rollNumber: true } } } }),
    rubric ? (rdb.rubricScore.findMany({ where: { rubricId: rubric.id } }) as Promise<RubricScoreRow[]>) : Promise.resolve([] as RubricScoreRow[]),
    groupsOf(course.id),
    prisma.cLO.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, select: { id: true, code: true } }),
  ]);
  return (
    <Shell roleLabel="Instructor" userName={user.name} navLinks={navForRole(user.role)}>
      <InstructorCourseSubNav courseId={course.id} active="marks" code={course.code} title={course.title} />
      <h2 style={{ fontSize: 18 }}>Evaluate: {inst.label}</h2>
      {!rubric ? (
        <div className="card">This item has no rubric yet. <Link href={`/instructor/courses/${course.id}/rubrics/${inst.id}`}>Make its rubric →</Link> (give each criterion its CLO; a project measuring several CLOs is then split into parts automatically from the Assessments page).</div>
      ) : (
        <>
          <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Pick the rubric levels once for a group and press Save — every member gets them. Open a member to change their levels individually. Marks go to Marks Entry (and to each CLO part, if the item is split).</p>
          <EvaluateWindow courseId={course.id} criteria={parseCriteria(rubric.criteriaJson)} students={enrol.map((e) => e.student).sort((a, b) => a.rollNumber.localeCompare(b.rollNumber))}
            groups={groups} levels={Object.fromEntries(scores.map((s) => [s.studentId, JSON.parse(s.levelsJson || "{}")]))}
            saveUrl={`/api/instructor/courses/${course.id}/rubrics/${inst.id}/scores`} cloCodes={Object.fromEntries(clos.map((c) => [c.id, c.code]))} />
        </>
      )}
    </Shell>
  );
}
