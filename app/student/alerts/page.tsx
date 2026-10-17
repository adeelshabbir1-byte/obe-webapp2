import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import { ActionForm } from "../../../components/fyp/FypClient";
import { xdb } from "../../../lib/messaging";

export const dynamic = "force-dynamic";

export default async function StudentAlerts() {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  const c = (await xdb.studentContact.findUnique({ where: { studentId: st.id } }).catch(() => null)) as { phone: string | null; guardianPhone: string | null; whatsapp: boolean } | null;
  const local = (p: string | null | undefined) => (p ? p.replace(/^\+92/, "0") : "");
  return (
    <StudentShell studentName={st.name}>
      <h1 style={{ fontSize: 22 }}>Alerts &amp; Contact</h1>
      <div className="card">
        <p className="small-note">Get a WhatsApp or SMS when a quiz opens, a hand-in is due, or results are out. Your number is used only by your institute for academic alerts.</p>
        <ActionForm url="/api/student/alerts" fixed={{}} submit="Save" initial={{ phone: local(c?.phone), guardianPhone: local(c?.guardianPhone), whatsapp: c ? c.whatsapp : true }}
          fields={[{ name: "phone", label: "My mobile", width: 160, placeholder: "03001234567" }, { name: "guardianPhone", label: "Parent / guardian mobile", width: 160, placeholder: "03001234567" }, { name: "whatsapp", label: "Prefer WhatsApp", type: "checkbox" }]} />
      </div>
    </StudentShell>
  );
}
