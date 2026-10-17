import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { labAccessFor } from "../../../../../../lib/labAccess";
import { labSessions, labCloOptions } from "../../../../../../lib/labSessions";
import { groupsOf } from "../../../../../../lib/workGroups";
import Shell from "../../../../../../components/Shell";
import EvaluateWindow from "../../../../../../components/EvaluateWindow";
import { navForRole } from "../../../../../../components/reportNav";

export const dynamic = "force-dynamic";

export default async function LabEvaluatePage({ params }: { params: { courseId: string; labNumber: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const access = await labAccessFor(user, params.courseId);
  if (!access) notFound();
  const n = Number(params.labNumber);
  const session = (await labSessions(access.lab.id)).find((s) => s.labNumber === n);
  if (!session) notFound();
  const [enrol, marks, groups, clos] = await Promise.all([
    prisma.studentEnrollment.findMany({ where: { courseId: access.lab.id, status: { not: "WITHDRAWN" } }, select: { student: { select: { id: true, name: true, rollNumber: true } } } }),
    (prisma as unknown as Record<string, any>).labMark.findMany({ where: { courseId: access.lab.id, labNumber: n } }).catch(() => []) as Promise<{ studentId: string; levelsJson?: string | null }[]>,
    groupsOf(access.lab.id),
    labCloOptions(access.lab.id, access.theory?.id || null),
  ]);
  return (
    <Shell roleLabel={access.as === "ENGINEER" ? "Lab Engineer" : "Instructor"} userName={user.name} navLinks={navForRole(user.role)}>
      <Link href={`/lab-engineer/labs/${access.lab.id}`} style={{ fontSize: 13 }}>← {access.lab.code}</Link>
      <h1 style={{ fontSize: 20, margin: "6px 0" }}>Evaluate Lab {n}: {session.title}</h1>
      {!session.criteria ? <div className="card">This lab has no rubric — add one under “Lab sessions — CLO and rubric”, or enter plain marks in the marks grid.</div> : (
        <EvaluateWindow courseId={access.lab.id} criteria={session.criteria} students={enrol.map((e) => e.student).sort((a, b) => a.rollNumber.localeCompare(b.rollNumber))} groups={groups}
          levels={Object.fromEntries(marks.filter((m) => m.levelsJson).map((m) => [m.studentId, JSON.parse(m.levelsJson as string)]))}
          saveUrl="/api/lab/eval" extra={{ labCourseId: access.lab.id, labNumber: n }} cloCodes={Object.fromEntries(clos.map((c) => [c.id, c.code]))} />
      )}
    </Shell>
  );
}
