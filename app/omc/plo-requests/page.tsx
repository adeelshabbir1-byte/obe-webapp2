import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV } from "../../../components/reportNav";
import { deptScope } from "../../../lib/omcScope";
import { pdb, type PloRequestRow } from "../../../lib/ploRequests";
import { PloRequestDecision } from "../../../components/PloRequestControls";

export const dynamic = "force-dynamic";

export default async function PloRequestsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinatorIds = (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "", ...deptScope(user) }, select: { id: true } })).map((c) => c.id);
  let rows: PloRequestRow[] = [], missing = false;
  try { rows = (await pdb.ploChangeRequest.findMany({ where: { chairmanId: user.managedById || "" }, orderBy: { createdAt: "desc" }, take: 300 })) as PloRequestRow[]; } catch { missing = true; }
  const courses = rows.length ? await prisma.course.findMany({
    where: { id: { in: Array.from(new Set(rows.map((r) => r.courseId))) }, coordinatorId: { in: coordinatorIds } },
    select: { id: true, code: true, title: true, batch: { select: { degreeProgram: true, batchName: true } }, clos: { select: { code: true, statement: true, source: true, mappedPloId: true }, orderBy: { code: "asc" } }, ploMappings: { select: { plo: { select: { number: true } } } } },
  }) : [];
  const cOf = new Map(courses.map((c) => [c.id, c]));
  rows = rows.filter((r) => cOf.has(r.courseId));
  const [plos, people] = await Promise.all([
    prisma.pLO.findMany({ where: { id: { in: Array.from(new Set(rows.map((r) => r.ploId))) } }, select: { id: true, number: true, title: true, description: true } }),
    prisma.user.findMany({ where: { id: { in: Array.from(new Set(rows.flatMap((r) => [r.requestedById, r.decidedById].filter((x): x is string => !!x)))) } }, select: { id: true, name: true } }),
  ]);
  const pOf = new Map(plos.map((p) => [p.id, p]));
  const name = new Map(people.map((u) => [u.id, u.name]));
  const pending = rows.filter((r) => r.status === "PENDING");
  const done = rows.filter((r) => r.status === "APPROVED" || r.status === "REJECTED").slice(0, 40);

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>PLO Change Requests</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        A course&apos;s Subject Expert or Instructor asking you to add a PLO to the course, or take one off. Approving changes the
        PLO–Course Matrix exactly as ticking the box would (and carries it to linked future offerings). Taking a PLO off also clears it
        from the course&apos;s CLOs that pointed to it, and their owners are told to map those CLOs again.
      </p>
      {missing && <div className="err">The PLO request table is not in the database yet — run prisma/migration_plo_requests.sql in Supabase.</div>}

      <h3 style={{ marginBottom: 8 }}>Waiting for you ({pending.length})</h3>
      {pending.length === 0 && <div className="card"><p style={{ color: "var(--slate)", margin: 0 }}>Nothing waiting.</p></div>}
      {pending.map((r) => {
        const c = cOf.get(r.courseId)!;
        const p = pOf.get(r.ploId);
        const pointing = c.clos.filter((x) => x.mappedPloId === r.ploId);
        const current = c.ploMappings.map((m) => m.plo.number).sort((a, b) => a - b);
        return (
          <div key={r.id} className="card">
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className={`badge ${r.action === "ADD" ? "badge-ok" : "badge-no"}`}>{r.action === "ADD" ? "Add" : "Remove"} PLO-{p?.number}</span>
              <b>{c.code} — {c.title}</b>
              <span style={{ color: "var(--slate)", fontSize: 12.5 }}>{c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : ""}</span>
            </div>
            <div style={{ fontSize: 12.5, marginTop: 6 }}><b>PLO-{p?.number}: {p?.title}</b>{p?.description ? <span style={{ color: "var(--slate)" }}> — {p.description}</span> : null}</div>
            <div style={{ fontSize: 13, marginTop: 8, background: "#F7F7F4", padding: "8px 10px", borderRadius: 6 }}>
              <span style={{ color: "var(--slate)" }}>{name.get(r.requestedById) || "—"} ({r.requestedAs === "INSTRUCTOR" ? "Instructor" : "Subject Expert"}), {new Date(r.createdAt).toLocaleDateString("en-GB")}:</span> {r.reason}
            </div>
            <div style={{ fontSize: 12.5, marginTop: 8, color: "var(--slate)" }}>
              PLOs on the course now: {current.length ? current.map((n) => `PLO-${n}`).join(", ") : "none"}.
              {r.action === "REMOVE" && <> {pointing.length ? <span style={{ color: "#B42318" }}>{pointing.map((x) => `${x.code}${x.source === "INSTRUCTOR" ? " (instructor)" : ""}`).join(", ")} point to it and would be cleared.</span> : "No CLO points to it."}</>}
            </div>
            {r.action === "ADD" && c.clos.length > 0 && (
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: "pointer", fontSize: 12.5 }}>The course&apos;s CLOs ({c.clos.length}) — does any of them serve this PLO?</summary>
                <ul style={{ fontSize: 12.5, margin: "6px 0" }}>{c.clos.map((x, i) => <li key={i}><b>{x.code}</b>{x.source === "INSTRUCTOR" ? " (instructor)" : ""}: {x.statement}</li>)}</ul>
              </details>
            )}
            <PloRequestDecision id={r.id} />
          </div>
        );
      })}

      {done.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Decided</h3>
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Course</th><th>Change</th><th>Asked by</th><th>Decision</th><th>Note</th></tr></thead>
            <tbody>{done.map((r) => (
              <tr key={r.id}>
                <td>{cOf.get(r.courseId)?.code}</td>
                <td>{r.action === "ADD" ? "Add" : "Remove"} PLO-{pOf.get(r.ploId)?.number}</td>
                <td>{name.get(r.requestedById) || "—"}</td>
                <td><span className={`badge ${r.status === "APPROVED" ? "badge-ok" : "badge-no"}`}>{r.status === "APPROVED" ? "approved" : "declined"}</span> {r.decidedById ? name.get(r.decidedById) : ""}{r.decidedAt ? `, ${new Date(r.decidedAt).toLocaleDateString("en-GB")}` : ""}</td>
                <td style={{ color: "var(--slate)" }}>{r.decisionNote}{r.closUnmapped ? ` (${r.closUnmapped} CLO(s) cleared)` : ""}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
