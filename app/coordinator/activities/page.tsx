import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import ActivityLogManager from "../../../components/ActivityLogManager";
import { ACTIVITY_CATEGORIES } from "../../../lib/resources";

export default async function ActivitiesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");
  const [items, batches] = await Promise.all([
    prisma.activityLog.findMany({ where: { coordinatorId: user.id }, orderBy: { activityDate: "desc" } }),
    prisma.batch.findMany({ where: { coordinatorId: user.id }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] }),
  ]);
  const label = (id: string | null) => { const b = batches.find((x) => x.id === id); return b ? `${b.degreeProgram} ${b.batchName}` : ""; };
  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Extra-curricular Activities</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        A log of sports, societies, competitions, workshops, trips and community work for your program. Accreditation reviewers look for evidence that students have a life beyond the classroom.
      </p>
      <ActivityLogManager categories={ACTIVITY_CATEGORIES} batches={batches.map((b) => ({ id: b.id, label: `${b.degreeProgram} ${b.batchName}` }))}
        items={items.map((i) => ({ id: i.id, title: i.title, category: i.category, activityDate: i.activityDate.toISOString(), organizer: i.organizer, venue: i.venue, participants: i.participants, description: i.description, outcome: i.outcome, photo: i.photo, batchId: i.batchId, batchLabel: label(i.batchId) }))} />
    </Shell>
  );
}
