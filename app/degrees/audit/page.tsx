import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { whoIs } from "../../../lib/registers";
import { canManageDegrees } from "../../../lib/degrees";
import { batchAudit } from "../../../lib/degreeAuditOps";
import { graduateCgpa } from "../../../lib/workCalendar";
import { academicRules } from "../../../lib/academicRules";
import { MinCgpa, WarnButton } from "../../../components/DegreeAuditTools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Batch degree audit" };

// Queue item 16: the degree audit for a whole batch — who would graduate today, who not and why; early warnings at the
// start of the final year; the minimum CGPA to graduate; the signed audit of each issued degree.
export default async function BatchAuditPage({ searchParams }: { searchParams: { batch?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const w = await whoIs(user as never);
  if (!w || !canManageDegrees(w)) redirect("/degrees");
  const batches = await prisma.batch.findMany({ where: { coordinator: { managedById: w.chairmanId } }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { batchName: "asc" }] });
  const sel = batches.find((b) => b.id === searchParams.batch);
  const rows = sel ? await batchAudit(sel.id) : [];
  const issued = new Set(((await (prisma as unknown as Record<string, any>).degreeAuditSnapshot?.findMany({ where: { studentId: { in: rows.map((r) => r.id).concat("none") } }, select: { studentId: true } }).catch(() => [])) || []).map((x: { studentId: string }) => x.studentId));
  const min = await graduateCgpa(w.chairmanId, (await academicRules(w.chairmanId)).probationCgpa);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div className="small-note"><Link href="/degrees">Degrees</Link> › Batch audit</div>
      <h1 style={{ fontSize: 22, margin: "2px 0 4px" }}>Batch degree audit</h1>
      <p className="small-note" style={{ marginTop: 0 }}>Every student of a batch checked against the scheme of studies: credits, CGPA, no failed course outstanding, every PLO, deficiency courses. Send early warnings at the start of the final year. When a degree is issued, the audit it was issued on is kept, signed, as a PDF.</p>
      <div className="card" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}><MinCgpa value={min} />
        <form style={{ display: "flex", gap: 6 }}><select name="batch" defaultValue={sel?.id || ""}><option value="">— choose a batch —</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} {b.batchName}</option>)}</select><button className="btn btn-sm">Run the audit</button></form></div>
      {sel && <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}><b>{rows.filter((r) => r.eligible).length} of {rows.length} would graduate today</b>
          <a className="btn btn-sm btn-secondary" href={`/api/degree-audit?batch=${sel.id}&format=csv`}>⬇ Excel (CSV)</a><WarnButton batchId={sel.id} /></div>
        <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Roll no.</th><th>Name</th><th>Result</th><th>CGPA</th><th>Courses left</th><th>What fails</th><th>Signed audit</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td>{r.roll}</td><td>{r.name}</td><td style={{ color: r.eligible ? "#1E6B3A" : "#B3261E", fontWeight: 700 }}>{r.eligible ? "✓ passes" : "✗"}</td><td>{r.cgpa?.toFixed(2) ?? "—"}</td><td>{r.missing}</td><td>{r.failing.join("; ") || "—"}</td><td>{issued.has(r.id) ? <a href={`/api/degree-audit?snapshot=${r.id}`}>PDF</a> : "—"}</td></tr>)}</tbody></table></div>}
    </Shell>
  );
}
