import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV } from "../../../components/reportNav";
import OmcReviewQueue from "../../../components/OmcReviewQueue";

export default async function OmcQueuePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const [courses, omcMembers] = await Promise.all([
    prisma.course.findMany({
      where: { coordinatorId: { in: coordinatorIds }, templateStatus: { not: "draft" } },
      include: { subjectExpert: true, assignedOmcReviewer: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({ where: { role: "OMC", managedById: user.managedById || "" }, orderBy: { name: "asc" } }),
  ]);

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Review Queue</h1>
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
