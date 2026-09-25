import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import DegreePlanner from "../../../components/DegreePlanner";
import StudentShell from "../../../components/StudentShell";

export default async function DegreePlanPage() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  if (student.mustChangePassword) redirect("/student/change-password");

  return (
    <StudentShell studentName={student.name}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <h1 style={{ fontSize: 22 }}>Degree Plan</h1>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 20 }}>
          Plan out your future semesters, try different course orderings, and play with hypothetical grades to
          see how they'd affect your CGPA — nothing here is real until you actually register and pass a
          course.
        </p>
        <DegreePlanner />
      </div>
    </StudentShell>
  );
}
