import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { peerGroupsFor } from "../../../lib/coTeachers";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";

export default async function PeerPlansPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");

  const groups = await peerGroupsFor(user);
  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Colleagues’ Plans</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Other teachers who teach the same course as you this semester, in other batches or other sections. You can read their CLOs, lecture plan and assessments to compare and stay aligned.
        You cannot change their plan, and students, marks and attendance stay private.
      </p>
      {groups.length === 0 && <div className="card" style={{ color: "var(--slate)" }}>No one else is teaching a course you teach this semester.</div>}
      {groups.map((g) => (
        <div className="card" key={g.code}>
          <h3 style={{ marginTop: 0 }}>{g.code} — {g.title}</h3>
          <table>
            <thead><tr><th>Teacher</th><th>Batch</th><th>Semester</th><th></th></tr></thead>
            <tbody>
              {g.entries.map((e) => (
                <tr key={e.courseId}>
                  <td><b>{e.teacher}</b>{e.sectionTeachers.length > 1 || (e.mine && e.sectionTeachers.length > 0) ? <div style={{ fontSize: 12, color: "var(--slate)" }}>{e.mine ? "Shared with you: " : "With: "}{e.sectionTeachers.join(", ")}</div> : null}</td>
                  <td style={{ fontSize: 12 }}>{e.batch}{e.mine ? " (yours too)" : ""}</td>
                  <td>{e.semester ?? "—"}</td>
                  <td><Link href={`/instructor/peers/${e.courseId}`} style={{ color: "var(--brass-dark)", fontSize: 12.5 }}>View plan</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </Shell>
  );
}
