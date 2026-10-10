import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import SemesterManager from "../../../components/SemesterManager";
import { navForRole } from "../../../components/reportNav";


export default async function CoordinatorSemesterPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const currentTerm = await prisma.currentTerm.findUnique({ where: { coordinatorId: user.id } });

  const offeredCourses = await prisma.course.findMany({
    where: { coordinatorId: user.id, isOffered: true },
    orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
    include: { batch: true, instructor: true },
  });

  const notOfferedCourses = await prisma.course.findMany({
    where: { coordinatorId: user.id, isOffered: false },
    orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
    include: { batch: true },
  });

  const instructors = await prisma.user.findMany({
    where: { managedById: user.id, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] } },
    orderBy: { name: "asc" },
  });

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Current Semester</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Set the current term to automatically offer every batch's current-semester courses. Instructor
        assignment happens separately, via Course Assigner.
      </p>
      <SemesterManager
        currentTerm={currentTerm ? { termName: currentTerm.termName, year: currentTerm.year } : null}
        offeredCourses={offeredCourses.map((c) => ({
          id: c.id, code: c.code, title: c.title, semesterNumber: c.semesterNumber, instructorName: c.instructor?.name || null,
          batchLabel: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—",
        }))}
        notOfferedCourses={notOfferedCourses.map((c) => ({
          id: c.id, code: c.code, title: c.title, semesterNumber: c.semesterNumber,
          batchLabel: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—",
        }))}
        instructors={instructors.map((i) => ({ id: i.id, name: i.name }))}
      />
    </Shell>
  );
}
