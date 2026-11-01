import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import QuestionBankApp from "../../components/QuestionBankApp";
import { courseCtx, planOfCourse, mayOpen } from "../../lib/qbank";

export const dynamic = "force-dynamic";
export const metadata = { title: "Question bank" };
const ROLES = ["INSTRUCTOR", "SUBJECT_EXPERT", "PROGRAM_COORDINATOR"];

// The course's question bank — every question type, the MCQ bank in the same search. Confidential: only the course's
// Subject Expert, its teachers and the Program Lead (paper vetting sees the questions of the papers it vets). Opening it
// asks for the bank PIN.
export default async function QuestionBankPage({ searchParams }: { searchParams: { courseId?: string; course?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!ROLES.includes(user.role)) redirect("/dashboard");
  const where = user.role === "INSTRUCTOR" ? { instructorId: user.id } : user.role === "SUBJECT_EXPERT" ? { subjectExpertId: user.id } : { coordinatorId: user.id };
  const courses = await prisma.course.findMany({ where, select: { id: true, code: true, title: true, batch: { select: { batchName: true } } }, orderBy: [{ code: "asc" }, { createdAt: "desc" }], take: 400 });
  const course = courses.find((c) => c.id === searchParams.courseId) || courses.find((c) => c.code === searchParams.course) || courses[0];
  const ctx = course ? await courseCtx(course.id).catch(() => null) : null;
  const plan = ctx ? await planOfCourse(ctx.baseId) : { lectures: [], clos: [] };
  const colleagues = ctx ? await prisma.user.findMany({ where: { id: { in: ctx.teacherIds.concat(ctx.seId || "none").filter((x) => x !== user.id) } }, select: { id: true, name: true } }) : [];
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Question Bank</h1>
      <p className="small-note">The bank belongs to the course (its base course: every linked section shares it); questions stay when a teacher leaves and keep the author&apos;s name. The Subject Expert adds directly; other teachers&apos; shared questions are reviewed first. A question used in a mid or final is locked for 3 terms. Course teams also have <Link href="/exam-board">Team Exam Papers</Link>.</p>
      <div className="card" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{courses.map((c) => <Link key={c.id} href={`/question-bank?courseId=${c.id}`} className={`btn btn-sm ${c.id === course?.id ? "btn-brass" : "btn-secondary"}`} title={`${c.title} ${c.batch?.batchName || ""}`}>{c.code}{c.batch ? ` · ${c.batch.batchName}` : ""}</Link>)}</div>
      {!course ? <p className="small-note">No courses yet.</p> : !ctx || !mayOpen(ctx, user) ? <div className="err">Only the course&apos;s Subject Expert, its teachers and the Program Lead open this bank.</div>
        : <QuestionBankApp key={course.id} courseId={course.id} plan={plan} userId={user.id} colleagues={colleagues} />}
    </Shell>
  );
}
