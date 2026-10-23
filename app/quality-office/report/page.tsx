import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import QualityShell from "../../../components/QualityShell";
import PrintButton from "../../../components/PrintButton";
import { canViewQa, qaInstitute, annualReport, records } from "../../../lib/qaOffice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Annual QA report" };

export default async function QaReport({ searchParams }: { searchParams: { year?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!canViewQa(user)) redirect("/home");
  const cid = await qaInstitute(user);
  const year = Number(searchParams.year) || new Date().getFullYear();
  const r = await annualReport(cid, year);
  const plan = ((await records(cid, "QA_PLAN")) || []).find((p) => String(p.data.year) === String(year));
  const planActs = plan ? (await records(cid, "ACTION", plan.id)) || [] : [];
  const profile = (await records(cid, "QA_PROFILE"))?.[0];
  const row = (l: string, v: React.ReactNode) => <tr><td style={{ padding: "4px 10px 4px 0" }}>{l}</td><td><b>{v}</b></td></tr>;
  return (
    <QualityShell user={user} title={`Annual QA report ${year}`} intro={`${profile?.data.name || "Quality Enhancement Cell"} — generated from the Quality Office registers, IPE and the yearly plan.`}>
      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 10 }}><Link href="/quality-office">← Quality Office</Link><form><input name="year" type="number" defaultValue={year} style={{ width: 90 }} /> <button className="btn btn-sm btn-secondary">Show</button></form><PrintButton /></div>
      {profile?.data.vision && <div className="card"><b>Vision.</b> {profile.data.vision}<br /><b>Mission.</b> {profile.data.mission}</div>}
      <div className="card"><table style={{ fontSize: 13.5 }}><tbody>
        {row("Quality awareness sessions", `${r.awareness.sessions} sessions, ${r.awareness.attendees} attendees (${r.awareness.students} students)`)}
        {row("Citizen Portal complaints", `${r.citizen.received} received, ${r.citizen.closed} replied/closed, ${r.citizen.overdue} overdue`)}
        {row("Department reviews", r.reviews)}
        {row("New program proposals", `${r.proposals.total} in all, ${r.proposals.approved} approved`)}
        {row("PQR registrations", `${r.pqr.registered} registered of ${r.pqr.total}`)}
        {row("Affiliated colleges", `${r.affiliates.total}, ${r.affiliates.inspected} inspected this year`)}
        {row("IPE self-assessment", r.ipe.scored ? `${r.ipe.scored} of 11 standards scored, average ${r.ipe.avg} / 4` : "not started")}
        {row("Actions (all plans)", `${r.actions.done} done of ${r.actions.total}; ${r.actions.overdue} overdue`)}
      </tbody></table></div>
      {plan && <div className="card"><h3 style={{ marginTop: 0 }}>Yearly plan {year} — {plan.data.status}</h3>{plan.data.targets && <p style={{ whiteSpace: "pre-wrap" }}>{plan.data.targets}</p>}
        <table style={{ fontSize: 12.5 }}><thead><tr><th>Activity</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>{planActs.map((a) => <tr key={a.id}><td>{a.data.action}</td><td>{a.data.owner}</td><td>{a.data.due}</td><td>{a.data.status}</td></tr>)}</tbody></table></div>}
    </QualityShell>
  );
}
