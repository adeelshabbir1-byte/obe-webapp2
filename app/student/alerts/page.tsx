import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import { ActionForm } from "../../../components/fyp/FypClient";
import { xdb } from "../../../lib/messaging";
import { prefsOf, STUDENT_KINDS } from "../../../lib/studentAlerts";

export const dynamic = "force-dynamic";

export default async function StudentAlerts() {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  const c = (await xdb.studentContact.findUnique({ where: { studentId: st.id } }).catch(() => null)) as { phone: string | null; guardianPhone: string | null; whatsapp: boolean } | null;
  const pr = (await prefsOf([st.id])).get(st.id);
  const local = (p: string | null | undefined) => (p ? p.replace(/^\+92/, "0") : "");
  return (
    <StudentShell studentName={st.name}>
      <h1 style={{ fontSize: 22 }}>Alerts &amp; Contact</h1>
      <div className="card">
        <p className="small-note">Get a WhatsApp or SMS when a quiz opens, a hand-in is due, or results are out. Your number is used only by your institute for academic alerts.</p>
        <ActionForm url="/api/student/alerts" fixed={{}} submit="Save" initial={{ phone: local(c?.phone), guardianPhone: local(c?.guardianPhone), whatsapp: c ? c.whatsapp : true }}
          fields={[{ name: "phone", label: "My mobile", width: 160, placeholder: "03001234567" }, { name: "guardianPhone", label: "Parent / guardian mobile", width: 160, placeholder: "03001234567" }, { name: "whatsapp", label: "Prefer WhatsApp", type: "checkbox" }]} />
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>What I receive by SMS / WhatsApp</h3>
        <p className="small-note">Everything always appears in your bell here; untick what you don&apos;t want on your phone. Your parent / guardian gets a short weekly summary with a link to your attendance, marks and results.</p>
        <ActionForm url="/api/student/alert-prefs" fixed={{}} submit="Save choices"
          initial={{ ...Object.fromEntries(STUDENT_KINDS.map(([k]) => [`k_${k}`, !pr?.off.has(k)])), parentWeekly: pr ? pr.parentWeekly : true }}
          fields={[...STUDENT_KINDS.map(([k, l]) => ({ name: `k_${k}`, label: l, type: "checkbox" as const })), { name: "parentWeekly", label: "Weekly summary to my parent / guardian", type: "checkbox" as const }]} />
      </div>
      <div className="card"><h3 style={{ marginTop: 0 }}>My data</h3><p className="small-note">Download everything the institute keeps about you in this system (profile, courses, marks, attendance, grades, fees, notices).</p><a className="btn btn-secondary btn-sm" href="/api/student/my-data">Download my data</a></div>
    </StudentShell>
  );
}
