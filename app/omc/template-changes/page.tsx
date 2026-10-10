import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV } from "../../../components/reportNav";
import TemplateChangeReview from "../../../components/TemplateChangeReview";
import TemplateChangeHistory from "../../../components/TemplateChangeHistory";
import { loadChangeItems } from "../../../lib/templateChangeItems";
import { deptScope } from "../../../lib/omcScope";

export default async function TemplateChangesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "", ...deptScope(user) }, select: { id: true } });
  const courses = await prisma.course.findMany({ where: { coordinatorId: { in: coordinators.map((c: { id: string }) => c.id) } }, select: { id: true } });
  const ids = courses.map((c: { id: string }) => c.id);
  const all = await loadChangeItems({ courseId: { in: ids } });
  const pending = all.filter((i) => i.status === "pending");
  const history = all.filter((i) => i.status !== "pending");

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Template Changes</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Approved course templates are locked. A Subject Expert who wants to change one sends a request here. If you agree, the template reopens;
        when they resubmit, everything they changed is recorded below, semester by semester.
      </p>
      <h2 style={{ fontSize: 15, marginBottom: 8 }}>Waiting for you ({pending.length})</h2>
      <TemplateChangeReview initial={pending.map((i) => ({ id: i.id, courseCode: i.courseCode, courseTitle: i.courseTitle, requestedBy: i.requestedBy, reason: i.reason, termLabel: i.termLabel, date: i.date }))} />
      <h2 style={{ fontSize: 15, margin: "20px 0 8px" }}>Change log by semester</h2>
      <TemplateChangeHistory items={history} />
    </Shell>
  );
}
