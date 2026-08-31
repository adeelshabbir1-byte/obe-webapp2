import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CoursesManager from "../../../components/CoursesManager";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
];

export default async function CoordinatorCoursesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const courses = await prisma.course.findMany({
    where: { coordinatorId: user.id },
    orderBy: [{ semesterNumber: "asc" }, { createdAt: "desc" }],
  });

  const subjectExperts = await prisma.user.findMany({
    where: { role: "SUBJECT_EXPERT", managedById: user.id },
    orderBy: { name: "asc" },
  });

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Courses</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Import the full HEC curriculum in one click, or add courses manually. Everything stays editable afterward.
      </p>
      <CoursesManager
        courses={courses.map((c) => ({
          id: c.id, code: c.code, title: c.title, creditHours: c.creditHours, courseType: c.courseType,
          semesterNumber: c.semesterNumber, fromHec: !!c.masterCourseId, subjectExpertId: c.subjectExpertId,
        }))}
        subjectExperts={subjectExperts.map((se) => ({ id: se.id, name: se.name }))}
      />
    </Shell>
  );
}
