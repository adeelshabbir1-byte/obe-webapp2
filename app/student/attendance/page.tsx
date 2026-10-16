import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import StudentAttendance from "../../../components/attendance/StudentAttendance";

export const dynamic = "force-dynamic";
export const metadata = { title: "My attendance" };

export default async function StudentAttendancePage() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  if (student.mustChangePassword) redirect("/student/change-password");
  return (
    <StudentShell studentName={student.name}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My attendance</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, margin: "0 0 12px", maxWidth: 820 }}>
        Your attendance in each course this semester. Falling below the minimum is an attendance shortage under the university&apos;s policy, so act early.
      </p>
      <StudentAttendance />
    </StudentShell>
  );
}
