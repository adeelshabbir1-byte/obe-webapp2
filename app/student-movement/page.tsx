import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { reviewBatchWhere } from "../../lib/reviewScope";
import { movement, computedOutcomeFigures } from "../../lib/studentStatus";
import HowCalculated from "../../components/HowCalculated";
import PrintButton from "../../components/PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Student movement" };

// Per batch: admitted, current, frozen, transferred in and out, dropped, left, graduated — with the reasons and the trend,
// and the intake / graduation / dropout figures the councils ask for (NCEAC 4.h, NBEAC Form 3), from the student records.
export default async function StudentMovementPage({ searchParams }: { searchParams: { batch?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const where = (await reviewBatchWhere(user)) || ((user.extraRoles || []).includes("EXAM_CONTROLLER") ? { coordinator: { managedById: await chairmanIdFor(user) } } : null);
  if (!where) redirect("/dashboard");
  const batches = await prisma.batch.findMany({ where, select: { id: true, degreeProgram: true, batchName: true, coordinatorId: true, startYear: true }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] });
  const sel = batches.find((b) => b.id === searchParams.batch);
  const rows = await Promise.all((sel ? [sel] : batches).map(async (b) => ({ b, m: await movement([b.id]) })));
  const leads = Array.from(new Set((sel ? [sel] : batches).map((b) => b.coordinatorId)));
  const figures = (await Promise.all(leads.map(async (l) => ({ program: batches.find((b) => b.coordinatorId === l)?.degreeProgram || "", rows: await computedOutcomeFigures(l) })))).filter((f) => f.rows.length);
  const COLS: [keyof Awaited<ReturnType<typeof movement>>, string][] = [["admitted", "Admitted"], ["current", "Current"], ["frozen", "Frozen"], ["transferredIn", "Transferred in"], ["transferredOut", "Transferred out"], ["dropped", "Dropped"], ["left", "Left"], ["rusticated", "Rusticated"], ["graduated", "Graduated"]];
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div><h1 style={{ fontSize: 22, marginBottom: 4 }}>Student movement</h1><p className="small-note" style={{ margin: 0 }}>Where each batch&apos;s students are now, and why those who left did.</p></div>
        <div style={{ display: "flex", gap: 6 }}><Link href="/status-changes" className="btn btn-secondary btn-sm">Status changes</Link><span className="no-print"><PrintButton /></span></div>
      </div>
      <HowCalculated shows="Counts of the batch's student records by their status, and the reasons recorded when the status changed.">
        Admitted = every student record of the batch (students who transferred in included). Current = still active. The council figures per intake year: admitted, graduated (and within four years), and dropped out = dropped, left or rusticated — all counted from the student records, so nothing has to be typed in separately.
      </HowCalculated>
      <form className="card no-print" style={{ display: "flex", gap: 8 }}><select name="batch" defaultValue={sel?.id || ""} aria-label="Batch"><option value="">All batches</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select><button className="btn btn-secondary btn-sm">Show</button></form>
      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 13 }}><thead><tr><th>Batch</th>{COLS.map(([, l]) => <th key={l} style={{ textAlign: "center" }}>{l}</th>)}</tr></thead>
          <tbody>{rows.map(({ b, m }) => <tr key={b.id}><td><b>{b.degreeProgram}</b> — {b.batchName}</td>{COLS.map(([k]) => <td key={String(k)} style={{ textAlign: "center", color: ["dropped", "left", "rusticated"].includes(String(k)) && Number(m[k]) > 0 ? "#C62828" : undefined, fontWeight: k === "current" ? 700 : 400 }}>{String(m[k])}</td>)}</tr>)}</tbody></table>
      </div>
      {rows.filter(({ m }) => m.reasons.DROPPED.length || m.reasons.LEFT.length || m.reasons.TRANSFERRED.length || m.reasons.FROZEN.length).map(({ b, m }) => (
        <div key={b.id} className="card">
          <b>{b.degreeProgram} — {b.batchName}: reasons</b>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 6, fontSize: 12.5 }}>
            {([["DROPPED", "Dropped"], ["LEFT", "Left"], ["TRANSFERRED", "Transferred out"], ["FROZEN", "Frozen"]] as const).filter(([k]) => m.reasons[k].length).map(([k, l]) => <div key={k}><b>{l}</b><ul style={{ margin: "2px 0 0", paddingLeft: 16 }}>{m.reasons[k].map(([r, n]) => <li key={r}>{r} — {n}</li>)}</ul></div>)}
          </div>
          {m.trend.length > 0 && <div className="small-note" style={{ marginTop: 6 }}>By year: {m.trend.map((t) => `${t.year}: ${Object.entries(t).filter(([k]) => k !== "year").map(([k, v]) => `${v} ${k.toLowerCase()}`).join(", ")}`).join(" · ")}</div>}
        </div>
      ))}
      {figures.map((f) => (
        <div key={f.program} className="card" style={{ overflowX: "auto" }}>
          <b>{f.program} — intake, graduation and dropout (NCEAC criterion 4.h, NBEAC Form 3)</b>
          <table style={{ fontSize: 13, marginTop: 6 }}><thead><tr><th>Intake year</th><th>Admitted</th><th>Graduated</th><th>Within 4 years</th><th>Dropped out</th><th>Dropout rate</th></tr></thead>
            <tbody>{f.rows.map((r) => <tr key={r.intakeYear}><td>{r.intakeYear}</td><td>{r.admitted}</td><td>{r.graduated}</td><td>{r.graduatedOnTime}</td><td>{r.droppedOut}</td><td>{r.admitted ? `${Math.round((100 * r.droppedOut) / r.admitted)}%` : "—"}</td></tr>)}</tbody></table>
        </div>
      ))}
    </Shell>
  );
}
