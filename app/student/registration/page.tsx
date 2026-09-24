import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentRegistrationManager from "../../../components/StudentRegistrationManager";

export default async function StudentRegistrationPage() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  if (student.mustChangePassword) redirect("/student/change-password");

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", padding: "40px 20px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
          <h1 style={{ fontSize: 22 }}>Course Registration</h1>
          <div style={{ display: "flex", gap: 14 }}>
            <a href="/student/dashboard" style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>Elective Choices</a>
            <a href="/student/degree-plan" style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>Degree Plan →</a>
          </div>
        </div>
        <StudentRegistrationManager />
      </div>
    </div>
  );
}
