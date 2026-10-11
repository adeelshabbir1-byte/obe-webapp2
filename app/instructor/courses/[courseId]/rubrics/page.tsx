import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import { navForRole } from "../../../../../components/reportNav";
import { rdb, parseCriteria, type RubricRow } from "../../../../../lib/rubrics";

export default async function RubricsPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");
  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.instructorId !== user.id) notFound();

  const [instruments, enrolled] = await Promise.all([
    prisma.assessmentInstrument.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: [{ type: "asc" }, { label: "asc" }] }),
    prisma.studentEnrollment.count({ where: { courseId: course.id, status: { not: "WITHDRAWN" } } }),
  ]);
  let rubrics: RubricRow[] = [], missing = false;
  const counts = new Map<string, number>();
  try {
    rubrics = (await rdb.rubric.findMany({ where: { courseId: course.id } })) as RubricRow[];
    if (rubrics.length) {
      const g = (await rdb.rubricScore.groupBy({ by: ["rubricId"], where: { rubricId: { in: rubrics.map((r) => r.id) } }, _count: { _all: true } })) as { rubricId: string; _count: { _all: number } }[];
      for (const x of g) counts.set(x.rubricId, x._count._all);
    }
  } catch { missing = true; }
  const byInst = new Map(rubrics.map((r) => [r.instrumentId, r]));
  const needs = (t: string) => ["Assignment", "Project", "Lab"].includes(t);

  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={navForRole(user.role)}>
      <InstructorCourseSubNav courseId={course.id} active="rubrics" code={course.code} title={course.title} />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        A rubric says how each assessment item is marked: criteria, their share of the marks, the CLO each one tests, and what
        &quot;Excellent&quot; to &quot;Unsatisfactory&quot; looks like. Marking a student with the rubric fills that item&apos;s mark in Marks Entry,
        and shows which CLOs the class attained criterion by criterion — the evidence accreditation reviewers ask for.
      </p>
      {missing && <div className="err">The rubric tables are not in the database yet — run prisma/migration_rubrics.sql in Supabase.</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Assessment item</th><th style={{ textAlign: "center" }}>Marks</th><th>Rubric</th><th style={{ textAlign: "center" }}>Students marked</th><th></th></tr></thead>
          <tbody>
            {instruments.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No assessment items yet — set them up on the Assessments tab.</td></tr>}
            {instruments.map((i) => {
              const r = byInst.get(i.id); const crit = r ? parseCriteria(r.criteriaJson) : [];
              return (
                <tr key={i.id}>
                  <td><b>{i.label}</b> <span style={{ fontSize: 12, color: "var(--slate)" }}>{i.type}</span></td>
                  <td style={{ textAlign: "center" }}>{i.maxScore} <span style={{ fontSize: 11, color: "var(--slate)" }}>({i.marksPct}% of course)</span></td>
                  <td>{r ? <span className="badge badge-ok">{crit.length} criteria · {new Set(crit.map((c) => c.cloId).filter(Boolean)).size} CLO(s)</span> : needs(i.type) ? <span className="badge badge-warn">No rubric yet</span> : <span style={{ fontSize: 12, color: "var(--slate)" }}>Optional</span>}</td>
                  <td style={{ textAlign: "center" }}>{r ? `${counts.get(r.id) || 0} / ${enrolled}` : "—"}</td>
                  <td><Link className="act act-primary" href={`/instructor/courses/${course.id}/rubrics/${i.id}`}>{r ? "Open" : "Create rubric"}</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
