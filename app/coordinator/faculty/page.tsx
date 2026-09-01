import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import FacultyManager from "../../../components/FacultyManager";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
  { href: "/coordinator/semester", label: "Current Semester" },
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
        Create Subject Expert and Course Instructor accounts, and set each instructor's normal teaching load.
      </p>
      <FacultyManager
        initialFaculty={faculty.map((f) => ({
          id: f.id, username: f.username, name: f.name, role: f.role, mustChangePassword: f.mustChangePassword,
          normalLoad: f.normalLoad, externalLoadCount: f.externalLoadCount, externalLoadNote: f.externalLoadNote,
        }))}
      />
    </Shell>
  );
}
