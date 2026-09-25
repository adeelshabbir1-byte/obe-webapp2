import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentElectiveDashboard from "../../../components/StudentElectiveDashboard";
import StudentShell from "../../../components/StudentShell";

export default async function StudentDashboardPage() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  if (student.mustChangePassword) redirect("/student/change-password");

  return (
    <StudentShell studentName={student.name}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 20 }}>Elective Choices</h1>
        <StudentElectiveDashboard studentName={student.name} />
      </div>
    </StudentShell>
  );
}
