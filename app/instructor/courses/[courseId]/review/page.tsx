import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import { navForRole } from "../../../../../components/reportNav";
import { ActionForm } from "../../../../../components/fyp/FypClient";
import { computeCloPloPassRates } from "../../../../../lib/resultMate";
import { cdb } from "../../../../../lib/complexProblems";

export const dynamic = "force-dynamic";

// Teacher exit review: the course's CLO results (from marks) beside the teacher's reasons and actions for next time.
export default async function CourseReviewPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");
  const course = await prisma.course.findUnique({ where: { id: params.courseId }, select: { id: true, code: true, title: true, instructorId: true } });
  if (!course || course.instructorId !== user.id) notFound();
  const shell = (c: React.ReactNode) => <Shell roleLabel="Instructor" userName={user.name} navLinks={navForRole(user.role)}><InstructorCourseSubNav courseId={course.id} active="review" code={course.code} title={course.title} />{c}</Shell>;
  const r = (await cdb.courseReview.findUnique({ where: { courseId: course.id } }).catch(() => undefined)) as { perCloJson: string; worked: string | null; challenges: string | null; changes: string | null; submittedAt: Date | null } | null | undefined;
  if (r === undefined) return shell(<div className="err">Run prisma/migration_teaching_extras.sql first.</div>);
  const stats = await computeCloPloPassRates(course.id).catch(() => null);
  const per = r ? (JSON.parse(r.perCloJson) as Record<string, { reason: string; action: string }>) : {};
  const rows = (stats?.cloStats || []).map((c) => { const n = c.passCount + c.failCount; const pct = n ? Math.round((100 * c.passCount) / n) : 0; return { code: c.code, pct, n }; });
  return shell(<>
    <div className="card">
      <h3 style={{ marginTop: 0 }}>End-of-course review {r?.submittedAt ? <span className="small-note">submitted {r.submittedAt.toISOString().slice(0, 10)}</span> : null}</h3>
      <p className="small-note">Your reflection on the course, kept in the course folder and read by the Program Lead for CQI. The CLO results come from your marks; explain each one below 60% and what you will change.</p>
      <table><thead><tr><th>CLO</th><th>Students who met it</th></tr></thead><tbody>{rows.map((x) => <tr key={x.code}><td>{x.code}</td><td style={{ color: x.pct >= 60 ? "#1F5E36" : "#B3261E", fontWeight: 700 }}>{x.pct}% <span className="small-note">of {x.n}</span></td></tr>)}</tbody></table>
    </div>
    <div className="card">
      <ActionForm url="/api/course-review" fixed={{ courseId: course.id, submit: true }} submit={r?.submittedAt ? "Update review" : "Submit review"}
        initial={{ ...Object.fromEntries(rows.flatMap((x) => [[`reason_${x.code}`, per[x.code]?.reason || ""], [`action_${x.code}`, per[x.code]?.action || ""]])), worked: r?.worked || "", challenges: r?.challenges || "", changes: r?.changes || "" }}
        fields={[...rows.flatMap((x) => [{ name: `reason_${x.code}`, label: `${x.code} (${x.pct}%) — why`, width: 300 }, { name: `action_${x.code}`, label: `${x.code} — action next time`, width: 300 }]),
          { name: "worked", label: "What worked well", type: "textarea" as const }, { name: "challenges", label: "Challenges (students' preparation, resources, time)", type: "textarea" as const }, { name: "changes", label: "Changes recommended to the course (CLOs, topics, assessments, books)", type: "textarea" as const }]} />
    </div>
  </>);
}
