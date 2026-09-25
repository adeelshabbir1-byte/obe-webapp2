import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentRegistrationManager from "../../../components/StudentRegistrationManager";
import StudentShell from "../../../components/StudentShell";

export default async function StudentRegistrationPage() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  if (student.mustChangePassword) redirect("/student/change-password");

  return (
    <StudentShell studentName={student.name}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
          <h1 style={{ fontSize: 22 }}>Course Registration</h1>
        </div>
        <StudentRegistrationManager />
      </div>
    </StudentShell>
  );
}
