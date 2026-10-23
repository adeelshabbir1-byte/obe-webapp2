import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { visibleBatchIds } from "../../lib/studentScope";
import { gaCoverage } from "../../lib/gaCoverage";

export const dynamic = "force-dynamic";
export const metadata = { title: "GA Coverage" };
const KCOL: Record<string, string> = { Theory: "#1565C0", Lab: "#6A1B9A", Project: "#AD1457", General: "#00796B" };

export default async function GaCoveragePage({ searchParams }: { searchParams: { batch?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const ids = await visibleBatchIds(user);
  const batches = await prisma.batch.findMany({ where: { id: { in: ids.concat("none") } }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] });
  const sel = batches.find((b) => b.id === searchParams.batch) || batches[0];
  const g = sel ? await gaCoverage(sel.id, await chairmanIdFor(user)) : null;
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>GA Coverage</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Which courses teach each graduate attribute, split into theory, lab, project and general-education courses (from the course–GA map and the CLO→GA mapping). Computing and engineering programs must show Modern Tool Usage in their labs.</p>
      <form className="card" style={{ display: "flex", gap: 8 }}>
        <select name="batch" defaultValue={sel?.id}>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select>
        <button className="btn btn-sm">Show</button>
      </form>
      {g && (
        <>
          <div className="card" style={{ borderLeft: `5px solid ${g.flags.length ? "#C62828" : "#1E7B45"}` }}>
            <b>{g.flags.length ? `${g.flags.length} gap(s)` : "Every GA is taught, and the labs cover tool usage ✓"}</b> <span className="small-note">· council {g.body}{g.tool ? ` · tool-usage GA: GA-${g.tool.number} ${g.tool.title}` : ""} · {g.labs} lab course(s)</span>
            <ul style={{ fontSize: 13, margin: "6px 0 0" }}>{g.flags.map((f, i) => <li key={i}>{f}</li>)}</ul>
            {g.flags.length > 0 && <p className="small-note" style={{ marginBottom: 0 }}>Fix: the Subject Expert maps a CLO of each lab to the tool-usage GA (course page → CLOs), or the Program Lead adds the GA on the <Link href="/omc/plo-matrix">course–GA matrix</Link>.</p>}
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ fontSize: 12.5, width: "100%" }}>
              <thead><tr><th>GA</th>{Object.keys(KCOL).map((k) => <th key={k} style={{ color: KCOL[k] }}>{k}</th>)}<th style={{ textAlign: "center" }}>Courses</th></tr></thead>
              <tbody>{g.rows.map((r) => (
                <tr key={r.number} style={{ background: !r.total ? "#FDE2E2" : g.tool?.number === r.number && !r.byKind.Lab.length ? "#FFF0D0" : undefined }}>
                  <td><b>GA-{r.number}</b> {r.title}</td>
                  {(Object.keys(KCOL) as (keyof typeof r.byKind)[]).map((k) => <td key={k} className="small-note">{r.byKind[k].map((c) => c.code).join(", ") || "—"}</td>)}
                  <td style={{ textAlign: "center", fontWeight: 700 }}>{r.total}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
