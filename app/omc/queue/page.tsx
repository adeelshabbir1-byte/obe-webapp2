import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV } from "../../../components/reportNav";
import OmcReviewQueue from "../../../components/OmcReviewQueue";
import { omcLeadScope, omcCourseScope } from "../../../lib/omcScope";
import Link from "next/link";
import { planFlags, flagText } from "../../../lib/sePlan";
import { queueFor } from "../../../lib/batchApproval";

export default async function OmcQueuePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "", ...omcLeadScope(user) } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const [courses, omcMembers] = await Promise.all([
    prisma.course.findMany({
      where: { coordinatorId: { in: coordinatorIds }, templateStatus: { not: "draft" }, ...omcCourseScope(user) },
      include: { subjectExpert: true, assignedOmcReviewer: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({ where: { role: "OMC", managedById: user.managedById || "" }, orderBy: { name: "asc" } }),
  ]);

  // Registration waits for these: offered courses whose plan is not OMC-approved yet, and new batches to approve.
  const offeredOpen = await prisma.course.findMany({ where: { coordinatorId: { in: coordinatorIds }, isOffered: true, templateStatus: { not: "approved" }, ...omcCourseScope(user) }, select: { id: true, code: true, title: true, batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: { code: "asc" }, take: 60 });
  const flags = await planFlags(offeredOpen.map((c) => c.id));
  const batchesWaiting = (await queueFor(user.managedById || "", user.departmentId || null)).filter((r) => r.status === "SUBMITTED");
  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Review Queue</h1>
      {batchesWaiting.length > 0 && <div className="card" style={{ borderLeft: "5px solid #1565C0" }}><b>New batches to approve ({batchesWaiting.length}):</b> {batchesWaiting.map((r) => <Link key={r.batchId} href={`/omc/batch-review?batchId=${r.batchId}`} style={{ marginRight: 10 }}>{r.batch!.degreeProgram} {r.batch!.batchName}</Link>)}</div>}
      {offeredOpen.length > 0 && <div className="card" style={{ borderLeft: "5px solid #C62828" }}>
        <b>Offered courses without an OMC-approved plan ({offeredOpen.length}) — registration waits for these</b>
        <ul style={{ fontSize: 12.5, margin: "4px 0 0", paddingLeft: 18 }}>{offeredOpen.map((c) => <li key={c.id}><Link href={`/omc/templates/${c.id}`}><b>{c.code}</b> {c.title}</Link> · {c.batch?.degreeProgram} {c.batch?.batchName} · <span style={{ color: "#B3261E", fontWeight: 600 }}>⚑ {flagText(flags.get(c.id))}</span></li>)}</ul>
      </div>}
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Subject Expert course templates submitted for review, split by who's responsible for getting to each
        one.
      </p>
      <OmcReviewQueue
        myId={user.id}
        omcMembers={omcMembers.map((m) => ({ id: m.id, name: m.name }))}
        courses={courses.map((c) => ({
          id: c.id, code: c.code, title: c.title, subjectExpertName: c.subjectExpert?.name || null,
          templateStatus: c.templateStatus, assignedOmcReviewerId: c.assignedOmcReviewerId,
          assignedOmcReviewerName: c.assignedOmcReviewer?.name || null,
        }))}
      />
    </Shell>
  );
}
