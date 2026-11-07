import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import * as M from "../../lib/workMonitor";
void prisma;
export const dynamic = "force-dynamic";
export const metadata = { title: "Responsibility monitor" };

// Queue item 20: everyone's deadlines in one view — on time, late (by how many days), overdue, still open — judged on
// each person's own working days. The Head gets a summary on the 1st of each month.
export default async function ResponsibilityPage({ searchParams }: { searchParams: { days?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "OMC", "PROGRAM_COORDINATOR", "LAB_MANAGER"].includes(user.role)) redirect("/home");
  const cid = await chairmanIdFor(user as never);
  const shell = (title: string, c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><h1 style={{ fontSize: 22, marginBottom: 4 }}>{title}</h1>{c}</Shell>;
  const days = Math.max(7, Math.min(365, Number(searchParams.days) || 90));
  const rows = await M.responsibility(cid, new Date(Date.now() - days * 864e5), new Date(Date.now() + 30 * 864e5));
  const depts = new Map<string, { on: number; judged: number }>();
  for (const r of rows) { const d = depts.get(r.department) || { on: 0, judged: 0 }; d.on += r.onTime; d.judged += r.onTime + r.late + r.overdue; depts.set(r.department, d); }
  return shell("Responsibility monitor", <>
    <form className="small-note">Deadlines of the last <input name="days" type="number" defaultValue={days} style={{ width: 60 }} /> days and the next 30 <button className="btn btn-sm btn-secondary">Show</button></form>
    <div className="card" style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>{Array.from(depts.entries()).map(([d, x]) => <span key={d}><b>{d}</b>: {x.judged ? Math.round((100 * x.on) / x.judged) : "—"}% on time</span>)}</div>
    <div className="card" style={{ overflowX: "auto" }}><table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Name</th><th>Role</th><th>Department</th><th>On time</th><th>Late</th><th>Overdue</th><th>Days late (total)</th><th>Open</th><th>On-time %</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.role}</td><td>{r.department}</td><td>{r.onTime}</td><td>{r.late}</td><td style={{ color: r.overdue ? "#B3261E" : undefined }}>{r.overdue}</td><td>{r.lateDays}</td><td>{r.open}</td><td>{r.pct ?? "—"}{r.pct !== null ? "%" : ""}</td></tr>)}</tbody></table>
      {!rows.length && <p className="small-note">No deadlines in this period.</p>}</div>
  </>);
}
