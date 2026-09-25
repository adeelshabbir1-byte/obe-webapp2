import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import ObeAnalytics from "../../../components/ObeAnalytics";
import StudentShell from "../../../components/StudentShell";

export default async function ObeAnalyticsPage() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  if (student.mustChangePassword) redirect("/student/change-password");

  return (
    <StudentShell studentName={student.name}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <h1 style={{ fontSize: 22 }}>My OBE Progress</h1>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 20 }}>
          How your actual coursework has mapped to your program's learning outcomes so far, and what's ahead.
        </p>
        <ObeAnalytics />
      </div>
    </StudentShell>
  );
}
