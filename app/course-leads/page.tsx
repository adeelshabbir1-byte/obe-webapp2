import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { loadTeams, LEAD_MANAGER_ROLES } from "../../lib/courseTeams";
import { courseScopeFor, roleLabel } from "../../lib/reportScope";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import CourseLeadManager from "../../components/CourseLeadManager";

export default async function CourseLeadsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!LEAD_MANAGER_ROLES.includes(user.role)) redirect("/dashboard");

  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById || "";
  const teams = await loadTeams(chairmanId);
  const scope = user.role === "COURSE_ASSIGNER" ? { coordinator: { managedById: chairmanId } } : courseScopeFor(user);
  const visible = new Set<string>((await prisma.course.findMany({ where: { id: { in: teams.flatMap((t) => t.rows.map((r) => r.courseId)) }, ...scope }, select: { id: true } })).map((c) => c.id));
  const mine = teams.filter((t) => t.rows.some((r) => visible.has(r.courseId)));

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course Leads</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        When a course (or equivalent courses) is taught in several sections by different teachers, one of them is the Course Lead.
        The lead finalises the Midterm and Final paper; the other teachers approve it. Once everyone approves, every section gets the approved paper.
      </p>
      <CourseLeadManager teams={mine.map((t) => ({ key: t.key, code: t.code, title: t.title, term: t.term, leadId: t.leadId, teachers: t.teachers, rows: t.rows.map((r) => ({ batch: r.batch, teachers: r.teachers.map((x) => x.name).join(", ") })) }))} />
    </Shell>
  );
}
