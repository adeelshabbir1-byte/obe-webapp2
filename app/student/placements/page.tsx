import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import { ActionForm, ActionButton } from "../../../components/fyp/FypClient";
import { cdb } from "../../../lib/complexProblems";
import { KINDS, SALARY, type Placement } from "../../../lib/placements";

export const dynamic = "force-dynamic";

export default async function StudentPlacements() {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  const list = ((await cdb.placement.findMany({ where: { studentId: st.id }, orderBy: { createdAt: "desc" } }).catch(() => [])) as Placement[]);
  const kn = new Map(KINDS);
  return (
    <StudentShell studentName={st.name}>
      <h1 style={{ fontSize: 22 }}>Internships &amp; Jobs</h1>
      <p className="small-note">Record your internships, jobs and admission to further study, now and after you graduate. The department uses these (in total, never your salary on its own) to show how its graduates do.</p>
      <div className="card"><ActionForm url="/api/placements" fixed={{}} submit="Add" collapsed openLabel="Add internship / job" initial={{ kind: "INTERNSHIP", inField: true, salaryBand: "" }}
        fields={[{ name: "kind", label: "Type", type: "select", options: KINDS }, { name: "organization", label: "Organisation / university", width: 220 }, { name: "position", label: "Position / program", width: 180 }, { name: "city", label: "City", width: 110 }, { name: "startDate", label: "Start", type: "date" }, { name: "endDate", label: "End (if any)", type: "date" }, { name: "salaryBand", label: "Monthly pay", type: "select", options: SALARY }, { name: "inField", label: "Related to my degree", type: "checkbox" }, { name: "supervisorEmail", label: "Supervisor's email (for the internship evaluation)", width: 240 }]} />
        {list.map((p) => <div key={p.id} style={{ borderTop: "1px solid #E3E9F0", padding: "6px 0", fontSize: 13.5 }}><b>{kn.get(p.kind)}</b> · {p.organization}{p.position ? ` · ${p.position}` : ""}{p.city ? ` · ${p.city}` : ""} <span className="small-note">{p.startDate?.toISOString().slice(0, 10) || ""}{p.verifiedById ? " · verified ✓" : ""}</span> {!p.verifiedById && <ActionButton url="/api/placements" body={{ action: "delete", id: p.id }} label="Remove" className="btn btn-secondary btn-sm" />}</div>)}
        {!list.length && <p className="small-note">Nothing recorded yet.</p>}</div>
    </StudentShell>
  );
}
