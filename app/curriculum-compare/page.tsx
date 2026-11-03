import { redirect } from "next/navigation";
import { prisma } from "../../lib/db";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import CompareTabs from "../../components/CompareTabs";
import { batchDiff } from "../../lib/curriculumDiff";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Curriculum comparison — CLOs & topics" };
const ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "OMC", "DEPARTMENT_COORDINATOR"];

export default async function CurriculumCompare({ searchParams }: { searchParams: { batch?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!ROLES.includes(user.role)) redirect("/home");
  const cid = await chairmanIdFor(user as never);
  const batches = await prisma.batch.findMany({ where: user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id } : { coordinator: { managedById: cid } }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }], select: { id: true, degreeProgram: true, batchName: true } });
  const id = searchParams.batch || searchParams.batchId;
  const b = batches.find((x) => x.id === id) || batches[0];
  const rows = b ? await batchDiff(b.id) : [];
  const changed = rows.filter((r) => r.total > 0);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>Curriculum comparison</h1>
      <CompareTabs active="detail" batchId={b?.id} />
      <p className="small-note">Each course's CLOs and lecture topics (the Subject Expert's plan) against the national master course it came from, and who last changed it. Course-level differences (code, credits, semester) are on the other two tabs.</p>
      <form method="get" className="no-print" style={{ fontSize: 13, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select name="batch" defaultValue={b?.id}>{batches.map((x) => <option key={x.id} value={x.id}>{x.degreeProgram} — {x.batchName}</option>)}</select>
        <button className="btn btn-secondary btn-sm">Show</button>
        {b && <a className="btn btn-sm" href={`/api/curriculum-compare?batch=${b.id}`}>Download PDF for the BOS</a>}
      </form>
      {!b ? <div className="card"><p>No batch yet.</p></div> : rows.length === 0 ? <div className="card"><p>No course of this batch comes from a master curriculum.</p></div> : <>
        <p style={{ fontSize: 13 }}><b>{changed.length}</b> of {rows.length} courses differ from the master at CLO or topic level.</p>
        {changed.map((r) => (
          <div key={r.courseId} className="card" data-diff={r.code}>
            <b>{r.code} {r.title}</b> <span className="small-note">master {r.masterCode}{r.lastBy ? ` · last changed by ${r.lastBy}${r.lastAt ? ` on ${new Date(r.lastAt).toLocaleDateString("en-GB")}` : ""}` : ""}</span>
            {([["CLOs", r.clo], ["Topics", r.topics]] as const).map(([k, d]) => (d.added.length + d.removed.length + d.changed.length) > 0 && (
              <div key={k} style={{ fontSize: 13, marginTop: 6 }}><b>{k}:</b> {d.same} same
                {d.changed.map((x, i) => <div key={`c${i}`} style={{ marginLeft: 10 }}>✎ <s style={{ color: "#8a5a00" }}>{x.from}</s> → {x.to}</div>)}
                {d.added.map((x, i) => <div key={`a${i}`} style={{ marginLeft: 10, color: "#1E6B3A" }}>+ {x}</div>)}
                {d.removed.map((x, i) => <div key={`r${i}`} style={{ marginLeft: 10, color: "#B3261E" }}>− {x}</div>)}
              </div>))}
          </div>
        ))}
        {changed.length === 0 && <div className="card"><p>Every course's CLOs and topics match the master ✓</p></div>}
      </>}
    </Shell>
  );
}
