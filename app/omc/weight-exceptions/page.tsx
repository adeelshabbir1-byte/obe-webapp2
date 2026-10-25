import { redirect } from "next/navigation";
import { requestVotes } from "../../../lib/omcRules";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV } from "../../../components/reportNav";
import WeightExceptionsManager from "../../../components/WeightExceptionsManager";
import { omcLeadScope, omcCourseScope } from "../../../lib/omcScope";



export default async function WeightExceptionsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "", ...omcLeadScope(user) } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const requests = await prisma.weightExceptionRequest.findMany({
    where: { status: "pending", course: { coordinatorId: { in: coordinatorIds }, ...omcCourseScope(user) } },
    include: { course: { include: { subjectExpert: true, instructor: true } } },
    orderBy: { createdAt: "desc" },
  });

  const votesOf = new Map(await Promise.all(requests.map(async (r) => { const v = await requestVotes("WEIGHT", r.id, r.courseId); return [r.id, { line: v.line, panel: v.panel ? v.panel.label || v.panel.term : null }] as const; })));
  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Weight Exceptions</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Course weightages a Subject Expert or Instructor proposed that fall outside your Weight Policy ranges. Two OMC approvals approve one at once; two rejections with reasons reject it (a course with a semester panel: two of its three members).
      </p>
      <WeightExceptionsManager
        initialRequests={requests.map((r) => ({
          id: r.id, courseCode: r.course.code, courseTitle: r.course.title,
          source: r.source, proposedBy: r.source === "INSTRUCTOR" ? (r.course.instructor?.name || "—") : (r.course.subjectExpert?.name || "—"),
          assignmentPct: r.assignmentPct, quizPct: r.quizPct, projectPct: r.projectPct,
          labPct: r.labPct, midtermPct: r.midtermPct, finalPct: r.finalPct, votes: votesOf.get(r.id)?.line, panel: votesOf.get(r.id)?.panel,
        }))}
      />
    </Shell>
  );
}
