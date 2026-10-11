import { redirect } from "next/navigation";
import PeopleRolesEditor from "../../../components/PeopleRolesEditor";
import { prisma } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/session";
import { institutePeople } from "../../../lib/institutePeople";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import PeopleTabs from "../../../components/PeopleTabs";

export default async function ChairmanPeoplePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  const [people, departments, faculties, deptPrograms] = await Promise.all([
    institutePeople(user.id),
    prisma.department.findMany({ where: { chairmanId: user.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.faculty.findMany({ where: { chairmanId: user.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.departmentProgram.findMany({ where: { chairmanId: user.id }, select: { degreeProgram: true, departmentId: true } }),
  ]);
  const programs = deptPrograms.map((x) => ({ name: x.degreeProgram, department: departments.find((d) => d.id === x.departmentId)?.name || "" })).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={navForRole("CHAIRMAN")}>
      <PeopleTabs />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>All Users and Roles</h1>
        <a href="/api/chairman/people/export" className="btn btn-brass" style={{ textDecoration: "none" }}>Export to Excel</a>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Everyone who works in your institute, with their login name. Passwords are never shown: a new account has the temporary password it was created with, and “Temporary password” below means the person has not signed in and changed it yet.
        A teacher with an extra role signs in with the same login name and chooses the role at sign-in. Click <b>Edit</b> on anyone to change their name, email, department, login on/off and every role they hold.
      </p>
      <PeopleRolesEditor people={people} departments={departments} faculties={faculties} programs={programs} />
    </Shell>
  );
}
