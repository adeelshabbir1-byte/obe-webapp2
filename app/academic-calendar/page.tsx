import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import AcademicCalendarManager from "../../components/AcademicCalendarManager";
import { VIEWER_ROLES, academicScope } from "../../lib/academic";

const LABEL: Record<string, string> = { CHAIRMAN: "Institute Head", DEAN: "Dean", HEAD_OF_DEPARTMENT: "Chairman", DEPARTMENT_COORDINATOR: "Program Coordinator", PROGRAM_COORDINATOR: "Program Lead" };

export default async function AcademicCalendarPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!VIEWER_ROLES.includes(user.role)) redirect("/dashboard");

  const { chairmanId, facultyId, isChairman, isDean } = await academicScope(user);
  const [faculties, rows] = await Promise.all([
    prisma.faculty.findMany({ where: { chairmanId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.academicCalendarEntry.findMany({
      where: { chairmanId, ...(isChairman ? {} : { OR: [{ facultyId: null }, ...(facultyId ? [{ facultyId }] : [])] }) },
      orderBy: { startDate: "asc" },
    }),
  ]);
  const name = new Map(faculties.map((f) => [f.id, f.name]));
  const entries = rows.map((e) => ({
    id: e.id, kind: e.kind, title: e.title, startDate: e.startDate.toISOString(), endDate: e.endDate?.toISOString() || null,
    termName: e.termName, termYear: e.termYear, facultyId: e.facultyId,
    scope: e.facultyId ? `${name.get(e.facultyId) || "Faculty"} only` : "Whole institute",
    canDelete: isChairman || (isDean && e.facultyId === facultyId),
  }));
  return (
    <Shell roleLabel={LABEL[user.role] || "Calendar"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Academic Calendar</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        The official dates for the institute. The Institute Head sets dates for everyone, and each Dean adds dates for their own faculty. Program Leads copy them into their own calendar.
      </p>
      <AcademicCalendarManager entries={entries} canSet={isChairman || isDean} faculties={faculties} canChooseFaculty={isChairman} canApply={user.role === "PROGRAM_COORDINATOR"} />
    </Shell>
  );
}
