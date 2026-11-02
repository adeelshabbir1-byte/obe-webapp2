import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import PlanGenerateApp from "../../components/PlanGenerateApp";

export const dynamic = "force-dynamic";
export const metadata = { title: "Generate from the plan" };

export default async function PlanGeneratePage({ searchParams }: { searchParams: { courseId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const shell = (body: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{body}</Shell>;
  if (searchParams.courseId) return shell(<PlanGenerateApp courseId={String(searchParams.courseId)} />);
  const cs = await prisma.course.findMany({ where: { isOffered: true, OR: [{ instructorId: user.id }, { subjectExpertId: user.id }, { sectionAssignments: { some: { instructorId: user.id } } }] }, orderBy: { code: "asc" }, take: 60, select: { id: true, code: true, title: true, batch: { select: { degreeProgram: true, batchName: true } } } });
  return shell(
    <div>
      <h1>Generate from the plan</h1>
      <p className="small-note">Quizzes, assignments, the mid and the final of each course, generated from the question bank by the Subject Expert&apos;s plan: its topics, CLOs and marks.</p>
      {cs.length === 0 ? <div className="card"><p>You have no course this term.</p></div> : <div className="card"><ul>{cs.map((c) => <li key={c.id}><Link href={`/plan-generate?courseId=${c.id}`}>{c.code} {c.title}</Link> <span className="small-note">{c.batch ? `${c.batch.degreeProgram} ${c.batch.batchName}` : ""}</span></li>)}</ul></div>}
    </div>
  );
}
