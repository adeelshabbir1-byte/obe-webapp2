import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { hasSubjectExpertHat } from "../../../lib/dualRoles";
import { homeOf } from "../../../lib/seNaming";
import HodSeMatrix from "./HodSeMatrix";

export const dynamic = "force-dynamic";

// The HOD names the Subject Experts of department-common and service / GE courses whose approved home is his department
// (Adeel prompt §11, §35). One row per course (its base copies), never followers; live SE load next to every name.
export default async function HodAssignSePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "HEAD_OF_DEPARTMENT") redirect("/dashboard");
  const chairmanId = user.managedById || "";
  const courses = await prisma.course.findMany({
    where: { coordinator: { managedById: chairmanId }, OR: [{ contentSyncMember: { is: null } }, { contentSyncMember: { is: { isBase: true } } }] },
    select: { id: true, code: true, title: true, semesterNumber: true, subjectExpertId: true, isOffered: true, templateStatus: true, batch: { select: { degreeProgram: true, batchName: true } }, },
    orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
  });
  const mine: typeof courses = [];
  for (const c of courses) {
    if (!c.isOffered && c.templateStatus === "approved") continue;
    const h = await homeOf(chairmanId, c.title);
    if (h && h.level !== "PROGRAM" && h.departmentId === user.departmentId) mine.push(c);
  }
  const byCode = new Map<string, { code: string; title: string; semester: number | null; ids: string[]; batches: string[]; seId: string | null }>();
  for (const c of mine) {
    const g = byCode.get(c.code) || { code: c.code, title: c.title, semester: c.semesterNumber, ids: [] as string[], batches: [] as string[], seId: c.subjectExpertId as string | null };
    g.ids.push(c.id); g.batches.push(c.batch ? `${c.batch.degreeProgram} ${c.batch.batchName}` : "department copy");
    if (!g.seId) g.seId = c.subjectExpertId;
    byCode.set(c.code, g);
  }
  const staff = await prisma.user.findMany({ where: { departmentId: user.departmentId || "none", isActive: true }, select: { id: true, name: true, role: true, secondaryRole: true, tertiaryRole: true, extraRoles: true }, orderBy: { name: "asc" } });
  const experts = staff.filter((s) => hasSubjectExpertHat(s as never)).map((s) => ({ id: s.id, name: s.name }));
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>Name Subject Experts — department courses</h1>
      <p className="small-note">Courses whose approved home is your department (department-common, service and General Education). One row per course: its base copies only — followers use the base&apos;s SE. The count next to each name is that teacher&apos;s SE load across the whole institute, updated live.</p>
      {byCode.size === 0 ? <div className="card"><p>No department-common or service courses have their home in your department yet. Homes are set by the Dean / HOD and approved by the BOS (Course Homes &amp; Codes).</p></div>
        : <HodSeMatrix rows={Array.from(byCode.values())} experts={experts} />}
    </Shell>
  );
}
