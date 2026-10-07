import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import HodApprovals from "../../../components/HodApprovals";

export default async function LeadProgramPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_LEAD") redirect("/dashboard");

  const program = user.leadProgram || "none";
  const coordinatorScope = { managedById: user.managedById || "", departmentId: user.departmentId || "none" };
  const [pending, department, batches, courses] = await Promise.all([
    prisma.course.findMany({
      where: { instructorApproval: "PENDING", batch: { degreeProgram: program }, coordinator: coordinatorScope },
      select: { id: true, code: true, title: true, instructor: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: { code: "asc" },
    }),
    prisma.department.findUnique({ where: { id: user.departmentId || "none" } }),
    prisma.batch.findMany({ where: { degreeProgram: program, coordinator: coordinatorScope }, orderBy: { batchName: "desc" } }),
    prisma.course.findMany({
      where: { isOffered: true, batch: { degreeProgram: program }, coordinator: coordinatorScope },
      select: { id: true, code: true, title: true, semesterNumber: true, instructorApproval: true, instructorResponse: true, instructor: { select: { name: true, isVisitingPlaceholder: true } }, subjectExpert: { select: { name: true } }, batch: { select: { batchName: true } } },
      orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
    }),
  ]);

  const teacherStatus = (c: (typeof courses)[number]) => {
    if (!c.instructor) return <span style={{ color: "#b3261e" }}>No teacher yet</span>;
    if (c.instructor.isVisitingPlaceholder) return <span style={{ color: "#96650F" }}>Visiting — to be decided</span>;
    const waits = [c.instructorApproval === "PENDING" ? "head's approval" : "", c.instructorResponse === "PENDING" ? "their answer" : ""].filter(Boolean);
    return <span>{c.instructor.name}{waits.length > 0 && <span style={{ color: "#96650F", fontSize: 11.5 }}> — waiting for {waits.join(" and ")}</span>}</span>;
  };

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{user.leadProgram || "My Program"}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>{department?.name ? `${department.name} · ` : ""}Your program at a glance: its batches, offered courses, and who teaches each one.</p>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Teacher assignments waiting for your approval ({pending.length})</h3>
        <HodApprovals items={pending.map((c) => ({ id: c.id, code: c.code, title: c.title, batch: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—", teacher: c.instructor?.name || "—" }))} />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Batches ({batches.length})</h3>
        <table><thead><tr><th>Batch</th><th>Students</th></tr></thead>
          <tbody>{batches.length === 0 ? <tr><td colSpan={2} style={{ color: "var(--slate)" }}>No batches yet.</td></tr> : batches.map((b) => <tr key={b.id}><td>{b.batchName}</td><td>{b.studentCount}</td></tr>)}</tbody></table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Offered courses ({courses.length})</h3>
        <table><thead><tr><th>Sem</th><th>Course</th><th>Batch</th><th>Teacher</th><th>Subject Expert</th></tr></thead>
          <tbody>
            {courses.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No offered courses yet.</td></tr>}
            {courses.map((c) => (
              <tr key={c.id}>
                <td>{c.semesterNumber ?? "—"}</td><td>{c.code} — {c.title}</td><td>{c.batch?.batchName || "—"}</td>
                <td>{teacherStatus(c)}</td><td>{c.subjectExpert?.name || <span style={{ color: "var(--slate)" }}>—</span>}</td>
              </tr>
            ))}
          </tbody></table>
      </div>
    </Shell>
  );
}
