import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { prisma } from "../../../lib/db";
import { ActionButton } from "../../../components/fyp/FypClient";
import { syncRows, requirementCheck } from "../../../lib/curriculumSync";

export const dynamic = "force-dynamic";
export const metadata = { title: "My curriculum vs the master" };

const STATE: Record<string, [string, string]> = { SAME: ["In step with the master", "#2E7D32"], MASTER: ["The master changed", "#1565C0"], LOCAL: ["You changed it", "#B26A00"], BOTH: ["Both changed", "#C62828"] };

export default async function CurriculumSync({ searchParams }: { searchParams: { batch?: string; show?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["PROGRAM_COORDINATOR", "OMC", "CHAIRMAN"].includes(user.role)) redirect("/home");
  const batches = await prisma.batch.findMany({ where: user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id } : { coordinator: { managedById: user.role === "CHAIRMAN" ? user.id : user.managedById || "none" } }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] });
  const sel = batches.find((b) => b.id === searchParams.batch) || batches[0];
  const rows = sel ? await syncRows(sel.id).catch(() => null) : [];
  const req = sel ? await requirementCheck(sel.id).catch(() => null) : null;
  const counts = { SAME: 0, MASTER: 0, LOCAL: 0, BOTH: 0 } as Record<string, number>;
  (rows || []).forEach((r) => counts[r.state]++);
  const show = searchParams.show || (counts.MASTER || counts.BOTH ? "changes" : "all");
  const list = (rows || []).filter((r) => show === "all" || (show === "changes" ? r.state !== "SAME" : r.state === show));
  const master = (rows || []).filter((r) => r.state === "MASTER" && !r.locked);
  const v = (x: unknown) => (x === null || x === undefined || x === "" ? "—" : String(x));
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>University Curriculum vs National</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0, maxWidth: "80ch" }}>Courses imported from a master curriculum stay linked to it. A course you have not changed follows the master: when the master is corrected, you see the change here and apply it with one click. A course you changed keeps your version, marked “You changed it”, and can return to the master any time. Nothing changes until you choose.</p>
      <form className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select name="batch" defaultValue={sel?.id}>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select>
        <button className="btn btn-sm">Show</button>
      </form>
      {rows === null ? <div className="err">Needs prisma/migration_curriculum_builder.sql — run it in Supabase (or System Health).</div> : sel && (
        <>
          {req && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Requirements of {req.curriculum}</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                {req.per.map((p) => <div key={p.name} style={{ borderLeft: `4px solid ${p.ok ? "#2E7D32" : "#C62828"}`, paddingLeft: 8 }}><div className="small-note">{p.name}</div><b style={{ color: p.ok ? undefined : "#C62828" }}>{p.counts ? `${p.ch}${p.minCredits ? ` / ${p.minCredits}` : ""} CH` : `${p.n} option(s)`}</b>{p.minCourses ? <span className="small-note"> · {p.n}/{p.minCourses} courses</span> : null}</div>)}
                <div style={{ borderLeft: "4px solid #0D2A4A", paddingLeft: 8 }}><div className="small-note">Total (slots only)</div><b>{req.total} CH</b></div>
              </div>
              {req.local.length > 0 && <p className="small-note">Added by you (not in the master): {req.local.join(", ")}.</p>}
            </div>
          )}
          <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {(["changes", "MASTER", "LOCAL", "BOTH", "all"] as const).map((k) => <Link key={k} href={`/coordinator/curriculum-sync?batch=${sel.id}&show=${k}`} className={`btn btn-sm ${show === k ? "" : "btn-secondary"}`}>{k === "changes" ? "Everything not in step" : k === "all" ? `All (${rows.length})` : `${STATE[k][0]} (${counts[k]})`}</Link>)}
            {master.length > 0 && <ActionButton url="/api/coordinator/curriculum-sync" body={{ batchId: sel.id, courseIds: master.map((r) => r.courseId), take: "master" }} label={`Apply all ${master.length} master change(s)`} confirmText="Update these courses from the master?" />}
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            {list.length === 0 ? <p className="small-note">{rows.length ? "Everything shown here is in step with the master." : "No course of this batch comes from a master curriculum."}</p> : (
              <table style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th>State</th><th>What differs (master → yours)</th><th></th></tr></thead>
                <tbody>{list.map((r) => (
                  <tr key={r.courseId}><td><b>{r.code}</b> {r.title}</td>
                    <td style={{ color: STATE[r.state][1], fontWeight: 700, whiteSpace: "nowrap" }}>{STATE[r.state][0]}</td>
                    <td>{r.fields.filter((x) => x.s !== "SAME").map((x) => <div key={x.f}><span className="small-note">{x.label}:</span> <b>{v(x.m)}</b> → {v(x.c)}</div>)}{r.locked && <div className="small-note" style={{ color: "#7A2E3B" }}>{r.locked}</div>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.state !== "SAME" && !r.locked && <>
                      <ActionButton url="/api/coordinator/curriculum-sync" body={{ batchId: sel.id, courseIds: [r.courseId], take: "master", all: r.state !== "MASTER" }} label={r.state === "MASTER" ? "Apply" : "Return to master"} className="btn btn-sm" />{" "}
                      {r.state !== "LOCAL" && <ActionButton url="/api/coordinator/curriculum-sync" body={{ batchId: sel.id, courseIds: [r.courseId], take: "mine" }} label="Keep mine" className="btn btn-secondary btn-sm" />}
                    </>}</td></tr>
                ))}</tbody></table>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}
