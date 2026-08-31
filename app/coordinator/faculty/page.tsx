import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CreateUserForm from "../../../components/CreateUserForm";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/courses", label: "Courses" },
];

export default async function CoordinatorFacultyPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const faculty = await prisma.user.findMany({
    where: { role: { in: ["SUBJECT_EXPERT", "INSTRUCTOR"] }, managedById: user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Faculty Onboarding</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Create Subject Expert and Course Instructor accounts. They set a new password on first login.
      </p>

      <div className="card">
        <table>
          <thead><tr><th>Username</th><th>Name</th><th>Role</th></tr></thead>
          <tbody>
            {faculty.length === 0 && (
              <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No faculty onboarded yet.</td></tr>
            )}
            {faculty.map((f) => (
              <tr key={f.id}><td>{f.username}</td><td>{f.name}</td><td>{f.role === "SUBJECT_EXPERT" ? "Subject Expert" : "Course Instructor"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateUserForm
        endpoint="/api/coordinator/faculty"
        buttonLabel="Onboard Faculty"
        showRoleSelect
        roleOptions={[
          { value: "SUBJECT_EXPERT", label: "Subject Expert" },
          { value: "INSTRUCTOR", label: "Course Instructor" },
        ]}
      />
    </Shell>
  );
}
