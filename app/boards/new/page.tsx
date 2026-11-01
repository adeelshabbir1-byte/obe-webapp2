import { redirect } from "next/navigation";
import { prisma } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { chairmanIdFor, roleLabel } from "../../../lib/reportScope";
import { TYPES } from "../../../lib/committeeEngine";
import NewCommitteeWizard from "../../../components/NewCommitteeWizard";

export const dynamic = "force-dynamic";

// "New committee", step by step (UX review): type → scope → Convener and Secretary → members → rules → create.
export default async function NewCommittee() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role)) redirect("/boards");
  const cid = await chairmanIdFor(user as never);
  const db = prisma as unknown as Record<string, any>;
  const [departments, faculties, people] = await Promise.all([
    prisma.department.findMany({ where: { chairmanId: cid }, select: { id: true, name: true, facultyId: true }, orderBy: { name: "asc" } }),
    (db.faculty?.findMany({ where: { chairmanId: cid }, select: { id: true, name: true } }).catch(() => []) || []) as Promise<{ id: string; name: string }[]>,
    prisma.user.findMany({ where: { isActive: true, OR: [{ id: cid }, { managedById: cid }, { managedBy: { managedById: cid } }] }, select: { id: true, name: true, role: true, departmentId: true, facultyId: true }, orderBy: { name: "asc" } }),
  ]);
  const start = user.role === "HEAD_OF_DEPARTMENT" ? { scope: "DEPARTMENT", scopeId: user.departmentId || "" } : user.role === "DEAN" ? { scope: "FACULTY", scopeId: (user as { facultyId?: string | null }).facultyId || "" } : { scope: "INSTITUTE", scopeId: "" };
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <NewCommitteeWizard types={Object.entries(TYPES).filter(([k]) => k !== "OMC")} departments={departments} faculties={faculties} people={people.map((p) => ({ ...p, role: String(p.role) }))} start={start} isHead={user.role === "CHAIRMAN"} />
    </Shell>
  );
}
