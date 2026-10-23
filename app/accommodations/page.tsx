import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import HowCalculated from "../../components/HowCalculated";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { whoIs, day } from "../../lib/registers";
import { DIS_HINT, CATEGORIES, keepsRegister, visibleAccommodations, accommodationText } from "../../lib/disabilities";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";

// Student accommodations: the register (for its keepers) and what each teacher / the exam office must provide.
export default async function AccommodationsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const w = await whoIs(user as never);
  if (!w) redirect("/dashboard");
  const keeper = await keepsRegister(w);
  const v = await visibleAccommodations(w);
  const students = await prisma.student.findMany({ where: { id: { in: (v?.recs || []).map((r) => r.studentId).concat(["none"]) } }, select: { id: true, name: true, rollNumber: true, batch: { select: { degreeProgram: true, batchName: true } } } });
  const sOf = new Map(students.map((s) => [s.id, s]));
  const fields = [{ name: "category", label: "Category", type: "select" as const, options: CATEGORIES.map((c) => [c, c] as [string, string]) }, { name: "extraTimePct", label: "Extra exam time %", type: "number" as const, width: 80 }, { name: "seating", label: "Seating", placeholder: "front row, ground floor", width: 170 }, { name: "materials", label: "Materials", placeholder: "large print, soft copy", width: 170 }, { name: "assistive", label: "Assistive technology", placeholder: "screen reader, scribe", width: 170 }, { name: "other", label: "Other", width: 200 }, { name: "details", label: "Confidential details (register only)", width: 240 }, { name: "validUntil", label: "Valid until", type: "date" as const }, { name: "verified", label: "Documents verified", type: "checkbox" as const }];
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Student Accommodations</h1>
      <p className="small-note" style={{ marginBottom: 10 }}>{keeper ? "The confidential register of students with disabilities and their accommodations." : "Students in your classes (or, for the exam office, in any class) who need accommodations, and what to provide. The reason is confidential and not shown."}</p>
      <HowCalculated shows="Who sees what (HEC Policy for Students with Disabilities, 2021).">
        <ul style={{ margin: "0 0 4px 18px", padding: 0 }}>
          <li>The register (category and details) is kept by the disability focal person, Student Affairs and the institute head.</li>
          <li>The Controller of Examinations and OMC see every student&apos;s accommodations; a teacher sees those of students in their current courses. Neither sees the category or the details.</li>
          <li>A record past its &quot;valid until&quot; date is no longer shown to teachers.</li>
        </ul>
      </HowCalculated>
      {v === null && <div className="err">{DIS_HINT}</div>}
      {keeper && <div className="card"><h3 style={{ marginTop: 0 }}>Add a student</h3><ActionForm url="/api/disabilities" fixed={{ action: "save" }} submit="Save" collapsed openLabel="Add to the register" fields={[{ name: "rollNumber", label: "Roll number", width: 150 }, ...fields]} />
        <a className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} href="/api/disabilities?report=xlsx">⬇ Counts for HEC (no names)</a></div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Student</th>{keeper && <th>Category</th>}<th>Accommodations</th>{!keeper && <th>Your courses</th>}<th>Valid until</th>{keeper && <th />}</tr></thead>
          <tbody>{(v?.recs || []).map((r) => { const s = sOf.get(r.studentId); return (
            <tr key={r.studentId}><td><b>{s?.name}</b><div className="small-note" style={{ margin: 0 }}>{s?.rollNumber} · {s?.batch.degreeProgram} {s?.batch.batchName}</div></td>
              {keeper && <td>{r.category}{r.verified ? <div className="small-note" style={{ margin: 0, color: "#1E6B3A" }}>documents verified</div> : <div className="small-note" style={{ margin: 0, color: "#9A3412" }}>documents not verified</div>}{r.details && <div className="small-note" style={{ margin: 0 }}>{r.details}</div>}</td>}
              <td style={{ fontWeight: 600 }}>{accommodationText(r)}</td>{!keeper && <td>{(v?.courses.get(r.studentId) || []).join(", ") || "all (exam office)"}</td>}<td>{day(r.validUntil)}</td>
              {keeper && <td><ActionForm url="/api/disabilities" fixed={{ action: "save", studentId: r.studentId }} submit="Save" collapsed openLabel="Edit" initial={{ category: r.category, extraTimePct: r.extraTimePct, seating: r.seating || "", materials: r.materials || "", assistive: r.assistive || "", other: r.other || "", details: r.details || "", validUntil: r.validUntil ? new Date(r.validUntil).toISOString().slice(0, 10) : "", verified: r.verified }} fields={fields} /> <ActionButton url="/api/disabilities" body={{ action: "remove", studentId: r.studentId }} label="Remove" className="act" confirmText="Remove this student from the register?" /></td>}</tr>); })}
            {!(v?.recs || []).length && <tr><td colSpan={5}>{keeper ? "The register is empty." : "None of your current students needs an accommodation."}</td></tr>}</tbody></table>
      </div>
    </Shell>
  );
}
