import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentElectiveDashboard from "../../../components/StudentElectiveDashboard";

export default async function StudentDashboardPage() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  if (student.mustChangePassword) redirect("/student/change-password");

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", padding: "40px 20px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 20 }}>Elective Choices</h1>
        <div style={{ marginBottom: 14 }}>
          <a href="/student/registration" style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>← Course Registration</a>
        </div>
        <StudentElectiveDashboard studentName={student.name} />
      </div>
    </div>
  );
}
