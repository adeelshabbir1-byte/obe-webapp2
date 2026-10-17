import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import { ActionForm } from "../../../components/fyp/FypClient";
import { cmdb, CATEGORIES, STATUS, type Complaint } from "../../../lib/complaints";

export const dynamic = "force-dynamic";

export default async function StudentComplaints() {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  const list = ((await cmdb.complaint.findMany({ where: { byStudentId: st.id }, orderBy: { createdAt: "desc" } }).catch(() => [])) as Complaint[]);
  return (
    <StudentShell studentName={st.name}>
      <h1 style={{ fontSize: 22 }}>Complaints &amp; Suggestions</h1>
      <div className="card"><p className="small-note">Raise a problem with teaching, exams, fees, facilities or anything else. Student Affairs will respond. Tick &quot;anonymous&quot; to hide your name from the people handling it.</p>
        <ActionForm url="/api/complaints" fixed={{ action: "lodge" }} submit="Send" collapsed openLabel="New complaint" initial={{ category: CATEGORIES[0], anonymous: false }} done="Sent. You can follow it below."
          fields={[{ name: "category", label: "Category", type: "select", options: CATEGORIES.map((c) => [c, c] as [string, string]) }, { name: "subject", label: "Subject", width: 300 }, { name: "details", label: "Details", type: "textarea" }, { name: "anonymous", label: "Keep my name hidden", type: "checkbox" }]} />
        {list.map((c) => <div key={c.id} style={{ borderTop: "1px solid #E3E9F0", padding: "6px 0", fontSize: 13.5 }}><b>{c.subject}</b> <span className="small-note">{c.category} · {c.createdAt.toISOString().slice(0, 10)} · {STATUS[c.status]}</span>{c.resolution && <div><i>Response:</i> {c.resolution}</div>}</div>)}
      </div>
    </StudentShell>
  );
}
