import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { labCoursesFor } from "../../../lib/labAccess";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";

export default async function LabsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");
  const labs = await labCoursesFor(user);
  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My Labs</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>Labs of the courses you teach. You are the lead of each lab: read the manuals set by the Lab Engineer, upload updates, and bring lab marks into your course result if needed.</p>
      {labs.length === 0 && <div className="card" style={{ color: "var(--slate)" }}>No lab is offered to you this semester.</div>}
      {labs.length > 0 && (
        <div className="card">
          <table>
            <thead><tr><th>Lab</th><th>Batch</th><th></th></tr></thead>
            <tbody>{labs.map((l: any) => (
              <tr key={l.id}><td><b>{l.code}</b> — {l.title}</td><td style={{ fontSize: 12 }}>{l.batch ? `${l.batch.degreeProgram} ${l.batch.batchName}` : "—"}</td>
                <td><Link href={`/instructor/labs/${l.id}`} className="act act-primary">Open</Link></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
