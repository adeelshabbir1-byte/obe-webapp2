import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";

// CVs waiting for review: students of batches this person advises or leads, and of FYP groups they supervise.
export default async function CvReviewPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const batches = await prisma.batch.findMany({ where: { OR: [{ advisorId: user.id }, { coordinatorId: user.id }] }, select: { id: true } });
  const groups = await prisma.fypGroup.findMany({ where: { supervisorId: user.id }, select: { id: true } });
  const fypStudents = (await prisma.fypGroupMember.findMany({ where: { groupId: { in: groups.map((g) => g.id) }, status: "JOINED" }, select: { studentId: true } })).map((m) => m.studentId);
  const students = await prisma.student.findMany({ where: { OR: [{ batchId: { in: batches.map((b) => b.id) } }, { id: { in: fypStudents } }] }, select: { id: true, name: true, rollNumber: true, batch: { select: { batchName: true } } }, take: 2000 });
  const cvs = (await (prisma as unknown as Record<string, any>).studentCv.findMany({ where: { studentId: { in: students.map((s) => s.id) } } }).catch(() => [])) as { studentId: string; status: string; published: boolean; updatedAt: Date }[];
  const st = new Map(students.map((s) => [s.id, s]));
  const order: Record<string, number> = { SUBMITTED: 0, CHANGES: 1, DRAFT: 2, APPROVED: 3 };
  const rows = cvs.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>CV Review</h1>
      <p style={{ color: "var(--slate)", fontSize: 13 }}>Students of batches you advise or lead, and of FYP groups you supervise. Only approved CVs can be shared with industry.</p>
      <div className="card">
        {rows.length === 0 ? <p style={{ margin: 0 }}>No CVs yet.</p> : (
          <table><thead><tr><th>Student</th><th>Status</th><th>Updated</th><th /></tr></thead>
            <tbody>{rows.map((c) => { const s = st.get(c.studentId); return (
              <tr key={c.studentId}>
                <td>{s?.name}<div className="small-note">{s?.rollNumber} · {s?.batch.batchName}</div></td>
                <td>{c.status === "SUBMITTED" ? <b style={{ color: "#1B6CA8" }}>Waiting</b> : c.status.toLowerCase()}{c.published ? " · shared" : ""}</td>
                <td className="small-note">{new Date(c.updatedAt).toISOString().slice(0, 10)}</td>
                <td style={{ whiteSpace: "nowrap" }}><a href={`/cv/${c.studentId}`} target="_blank" rel="noopener noreferrer" className="act">Open</a>{" "}
                  {c.status === "SUBMITTED" && <><ActionButton url="/api/cv-review" body={{ studentId: c.studentId, action: "approve" }} label="Approve" className="act act-primary" />{" "}<ActionButton url="/api/cv-review" body={{ studentId: c.studentId, action: "changes" }} label="Ask for changes" className="act act-danger" askNote="What should change?" noteRequired /></>}</td>
              </tr>); })}</tbody></table>
        )}
      </div>
    </Shell>
  );
}
