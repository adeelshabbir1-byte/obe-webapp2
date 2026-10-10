import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import RepeatOfferingManager from "../../../components/RepeatOfferingManager";
import { computeRepeatOfferingSuggestions } from "../../../lib/repeatOfferingSuggestions";
import { navForRole } from "../../../components/reportNav";


export default async function RepeatOfferingPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const [courses, students, suggestions] = await Promise.all([
    prisma.course.findMany({
      where: { coordinatorId: user.id },
      include: { batch: true, studentEnrollments: { where: { isRepeat: true }, include: { student: { include: { batch: true } } } } },
      orderBy: { code: "asc" },
    }),
    prisma.student.findMany({ where: { batch: { coordinatorId: user.id } }, include: { batch: true }, orderBy: { name: "asc" } }),
    computeRepeatOfferingSuggestions(user.id),
  ]);

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Repeat / Summer Offering</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Select any course (from any batch, any semester) to offer again for students who need to repeat it,
        and enroll the specific students who'll retake it.
      </p>
      <RepeatOfferingManager
        suggestions={suggestions}
        initialCourses={courses.map((c) => ({
          id: c.id, code: c.code, title: c.title,
          batchLabel: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—",
          isOffered: c.isOffered, offeredTermName: c.offeredTermName, offeredTermYear: c.offeredTermYear,
          enrolledStudents: c.studentEnrollments.map((e) => ({ id: e.student.id, name: e.student.name, rollNumber: e.student.rollNumber, batchLabel: e.student.batch ? `${e.student.batch.degreeProgram} — ${e.student.batch.batchName}` : "—" })),
        }))}
        allStudents={students.map((s) => ({ id: s.id, name: s.name, rollNumber: s.rollNumber, batchLabel: s.batch ? `${s.batch.degreeProgram} — ${s.batch.batchName}` : "—" }))}
      />
    </Shell>
  );
}
