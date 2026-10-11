import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentRegistrationManager from "../../../components/StudentRegistrationManager";
import StudentShell from "../../../components/StudentShell";
import { studentContext, selfRegistrationBlock, loadLimit, planLock } from "../../../lib/registrationRules";

export default async function StudentRegistrationPage() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  if (student.mustChangePassword) redirect("/student/change-password");

  const ctx = await studentContext(student.id);
  const blocked = ctx ? selfRegistrationBlock(ctx) : null;
  const limit = ctx ? loadLimit(ctx) : null;
  const lock = await planLock(student.id);

  return (
    <StudentShell studentName={student.name}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
          <h1 style={{ fontSize: 22 }}>Course Registration</h1>
        </div>
        {blocked && (
          <div className="card" style={{ borderColor: "#B3261E", background: "#FBEAEA" }}>
            <p style={{ margin: 0, fontSize: 13 }}>{blocked}</p>
            <p style={{ margin: "6px 0 0", fontSize: 12.5 }}>{lock ? "Your advisor has locked your plan — see it on the Degree Plan page." : "Your advisor hasn't locked your plan yet — contact your advisor."}</p>
          </div>
        )}
        {limit && !blocked && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Your credit-hour limit this semester: <b>{limit.max}</b> ({limit.why}).</p>}
        <StudentRegistrationManager />
      </div>
    </StudentShell>
  );
}
