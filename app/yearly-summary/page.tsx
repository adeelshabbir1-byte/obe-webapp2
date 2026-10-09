import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import { computeReadiness } from "../../lib/readiness";
import { OVERVIEW_ROLES, leadsInScope } from "../../lib/readinessScope";
import { planProgress } from "../../lib/deadlines";
import { MEETING_KINDS } from "../../lib/evidenceFiles";

const money = (n: number) => `PKR ${Math.round(n).toLocaleString("en-US")}`;
const pc = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export default async function YearlySummaryPage({ searchParams }: { searchParams: { year?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!OVERVIEW_ROLES.includes(user.role)) redirect("/dashboard");
  const thisYear = new Date().getFullYear();
  const year = Math.min(thisYear, Math.max(2015, parseInt(searchParams.year || "", 10) || thisYear));
  const from = new Date(Date.UTC(year, 0, 1)), to = new Date(Date.UTC(year + 1, 0, 1));
  const { chairmanId, leads } = await leadsInScope(user);
  const leadIds = leads.map((l) => l.id).concat(["none"]);
  const [meetings, surveys, figs, files, plan] = await Promise.all([
    prisma.meetingMinutes.findMany({ where: { chairmanId, meetingDate: { gte: from, lt: to } } as never, select: { kind: true, fileName: true } }),
    prisma.surveyResult.findMany({ where: { leadId: { in: leadIds }, surveyDate: { gte: from, lt: to } } as never, select: { leadId: true, kind: true, avgRating: true } }),
    prisma.outcomeFigure.findMany({ where: { leadId: { in: leadIds }, intakeYear: { lte: year } } as never, orderBy: { intakeYear: "desc" } }),
    prisma.evidenceFile.count({ where: { chairmanId, createdAt: { gte: from, lt: to } } as never }),
    planProgress(user, { stamp: false }),
  ]) as unknown as [{ kind: string; fileName: string | null }[], { leadId: string; kind: string; avgRating: number | null }[], { leadId: string; intakeYear: number; admitted: number; graduated: number; droppedOut: number }[], number, Awaited<ReturnType<typeof planProgress>>];
  const fin = user.role === "CHAIRMAN" ? ((await prisma.financeEntry.findMany({ where: { chairmanId, fiscalYear: { in: [`${year - 1}-${String(year % 100).padStart(2, "0")}`, `${year}-${String((year + 1) % 100).padStart(2, "0")}`] } } as never, select: { kind: true, amount: true } })) as unknown as { kind: string; amount: number }[]) : [];
  const sum = (k: string) => fin.filter((f) => f.kind === k).reduce((n, f) => n + f.amount, 0);
  const reports: { id: string; overall: number | null; areas: { no: number; s: number | null }[] }[] = [];
  for (const l of leads) { // one at a time: each report runs many queries
    const d = await computeReadiness({ id: l.id, managedById: chairmanId, departmentId: l.departmentId }, "");
    reports.push({ id: l.id, overall: d.overall, areas: d.scored.map((x: { a: { no: number }; s: number | null }) => ({ no: x.a.no, s: x.s })) });
  }
  const byKind = new Map<string, number>(); for (const m of meetings) byKind.set(m.kind, (byKind.get(m.kind) || 0) + 1);
  const planDone = plan.reduce((n, l) => n + l.done, 0), planTotal = plan.reduce((n, l) => n + l.total, 0);
  return (
    <Shell roleLabel="Yearly summary" userName={user.name} navLinks={navForRole(user.role)}>
      <style>{`@media print { .no-print { display: none !important; } aside, nav { display: none !important; } }`}</style>
      <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <form method="get"><label style={{ fontSize: 13 }}>Year <input name="year" type="number" defaultValue={year} min={2015} max={thisYear} style={{ width: 80, padding: "5px 8px" }} /></label> <button className="btn" type="submit">Show</button></form>
        <a className="btn" href="javascript:window.print()">Print</a>
      </div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Yearly summary {year}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13 }}>Meetings, surveys and files are for {year}. Readiness scores and plan progress are as of today.</p>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>Readiness by program</h3>
        <table><thead><tr><th>Program</th><th>Program Lead</th><th>Overall</th>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <th key={n}>C{n}</th>)}</tr></thead>
          <tbody>{leads.map((l) => { const r = reports.find((x) => x.id === l.id); return <tr key={l.id}><td>{l.leadProgram || "—"}</td><td>{l.name}</td><td><b>{r?.overall ?? "—"}{r?.overall != null ? "%" : ""}</b></td>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <td key={n}>{r?.areas.find((a) => a.no === n)?.s ?? "—"}</td>)}</tr>; })}</tbody></table>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>Students: admitted, graduated, dropped out</h3>
        {figs.length === 0 ? <p style={{ margin: 0, color: "var(--slate)" }}>No figures recorded.</p> : (
          <table><thead><tr><th>Program</th><th>Intake</th><th>Admitted</th><th>Graduated</th><th>Dropped out</th><th>Graduation</th><th>Dropout</th></tr></thead>
            <tbody>{figs.slice(0, 40).map((f, i) => <tr key={i}><td>{leads.find((l) => l.id === f.leadId)?.leadProgram || "—"}</td><td>{f.intakeYear}</td><td>{f.admitted}</td><td>{f.graduated}</td><td>{f.droppedOut}</td><td>{pc(f.graduated, f.admitted)}</td><td>{pc(f.droppedOut, f.admitted)}</td></tr>)}</tbody></table>
        )}
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>Activity in {year}</h3>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
          <li><b>{meetings.length}</b> meetings recorded{meetings.length ? ` (${Array.from(byKind.entries()).map(([k, n]) => `${n} ${MEETING_KINDS[k] || k}`).join(", ")}); ${meetings.filter((m) => m.fileName).length} with signed minutes filed` : ""}</li>
          <li><b>{surveys.length}</b> surveys held{surveys.length ? ` (${Array.from(new Set(surveys.map((s) => s.kind))).join(", ").toLowerCase()})` : ""}</li>
          <li><b>{files}</b> evidence files added</li>
          <li>Semester plan: <b>{planDone}</b> of <b>{planTotal}</b> tasks done ({pc(planDone, planTotal)}); {plan.filter((l) => l.state === "BEHIND").length} tasks behind</li>
        </ul>
      </div>
      {user.role === "CHAIRMAN" && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Finance, fiscal years ending in {year} and {year + 1}</h3>
          <p style={{ margin: 0, fontSize: 13.5 }}>Budget {money(sum("BUDGET"))} · Spent {money(sum("SPENT"))} · Income {money(sum("INCOME"))}</p>
        </div>
      )}
    </Shell>
  );
}
