import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import ObeAnalytics from "../../../components/ObeAnalytics";

export default async function ObeAnalyticsPage() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  if (student.mustChangePassword) redirect("/student/change-password");

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", padding: "40px 20px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <h1 style={{ fontSize: 22 }}>My OBE Progress</h1>
          <a href="/student/degree-plan" style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>← Degree Plan</a>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 20 }}>
          How your actual coursework has mapped to your program's learning outcomes so far, and what's ahead.
        </p>
        <ObeAnalytics />
      </div>
    </div>
  );
}
