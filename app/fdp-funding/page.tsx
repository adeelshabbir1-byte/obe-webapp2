import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import HowCalculated from "../../components/HowCalculated";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { whoIs, rdb, staffOf, day } from "../../lib/registers";
import { FDP_HINT, KINDS, SPONSORS, STATUS, canManageFdp, total, bond, spending, hasBond, type Funding } from "../../lib/fdpFunding";
import { ActionForm } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

// Faculty development funding: study leave, scholarships (with bonds and progress reports) and conference / training grants.
export default async function FdpFundingPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const w = await whoIs(user as never);
  if (!w) redirect("/dashboard");
  const manage = canManageFdp(w);
  let rows: Funding[] | null = null;
  try { rows = (await rdb.fdpFunding.findMany({ where: { chairmanId: w.chairmanId, ...(manage || w.qec ? {} : { userId: w.id }) }, orderBy: [{ status: "asc" }, { sanctionedAt: "desc" }] })) as Funding[]; } catch { rows = null; }
  if (!manage && !w.qec && !(rows || []).length) redirect("/dashboard");
  const staff = await staffOf(w.chairmanId);
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name || "—";
  const reports = (await rdb.fdpProgress.findMany({ where: { fundingId: { in: (rows || []).map((r) => r.id).concat(["none"]) } }, orderBy: { submittedAt: "desc" } }).catch(() => [])) as { id: string; fundingId: string; term: string; report: string; submittedAt: Date; reviewNote: string | null }[];
  const sp = spending(rows || []);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Faculty Development Funding</h1>
      <p className="small-note" style={{ marginBottom: 10 }}>{manage ? "Study leave and scholarships for higher studies, with their bonds and progress reports, and conference and training grants. The yearly totals feed the councils' faculty development tables." : "Your study leave, scholarship or grants, and your progress reports."}</p>
      <HowCalculated shows="A study leave or scholarship carries a bond: the teacher serves the bond years after returning.">
        <ul style={{ margin: "0 0 4px 18px", padding: 0 }}>
          <li>Bond served % = time since returning ÷ bond period. Leaving before it is served means refunding the unserved share of the total amount (fee + stipend + travel + other).</li>
          <li>Spending is totalled by Pakistan&apos;s fiscal year (1 July – 30 June) of the sanction date.</li>
        </ul>
      </HowCalculated>
      {rows === null && <div className="err">{FDP_HINT}</div>}
      {manage && <div className="card"><h3 style={{ marginTop: 0 }}>Sanction funding</h3><ActionForm url="/api/fdp-funding" fixed={{ action: "add" }} submit="Save" collapsed openLabel="Add study leave, scholarship or grant" fields={[
        { name: "userId", label: "Teacher", type: "select", options: staff.map((s) => [s.id, s.name] as [string, string]) }, { name: "kind", label: "Kind", type: "select", options: Object.entries(KINDS) }, { name: "purpose", label: "Degree / event", width: 220 }, { name: "place", label: "University / venue", width: 180 }, { name: "country", label: "Country", width: 110 },
        { name: "sponsor", label: "Paid by", type: "select", options: Object.entries(SPONSORS) }, { name: "sponsorName", label: "Sponsor's name (if other)", width: 150 },
        { name: "feeAmount", label: "Fee (Rs)", type: "number", width: 100 }, { name: "stipendAmount", label: "Stipend (Rs)", type: "number", width: 100 }, { name: "travelAmount", label: "Travel (Rs)", type: "number", width: 100 }, { name: "otherAmount", label: "Other (Rs)", type: "number", width: 100 },
        { name: "sanctionedAt", label: "Sanctioned", type: "date" }, { name: "startDate", label: "Starts", type: "date" }, { name: "expectedReturn", label: "Expected return", type: "date" }, { name: "bondYears", label: "Bond (years)", type: "number", width: 70 }, { name: "notes", label: "Notes", width: 220 }]} /></div>}
      {manage && sp.length > 0 && <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><h3 style={{ margin: 0 }}>Spending by fiscal year</h3><a className="btn btn-secondary btn-sm no-print" style={{ marginLeft: "auto" }} href="/api/fdp-funding">⬇ Excel</a></div>
        <table className="table" style={{ fontSize: 13, marginTop: 8 }}><thead><tr><th>Fiscal year</th>{Object.values(KINDS).map((k) => <th key={k}>{k}</th>)}<th>Total</th></tr></thead>
          <tbody>{sp.map(([fy, r]) => <tr key={fy}><td>{fy}</td>{Object.keys(KINDS).map((k) => <td key={k}>{r[k] ? rs(r[k]) : "—"}</td>)}<td style={{ fontWeight: 800 }}>{rs(r.all || 0)}</td></tr>)}</tbody></table></div>}
      {(rows || []).map((f) => { const bd = bond(f); const mine = f.userId === w.id; const rp = reports.filter((r) => r.fundingId === f.id); return (
        <div key={f.id} className="card" style={{ borderLeft: `5px solid ${f.status === "BOND_BROKEN" || f.status === "DISCONTINUED" ? "#B3261E" : f.status === "COMPLETED" ? "#1E6B3A" : "#1F4E8C"}` }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}><h3 style={{ margin: 0 }}>{nameOf(f.userId)} — {f.purpose}</h3><span className="small-note">{KINDS[f.kind]} · {[f.place, f.country].filter(Boolean).join(", ")} · {f.sponsorName || SPONSORS[f.sponsor]}</span></div>
          <p style={{ fontSize: 13, margin: "6px 0" }}><b>{rs(total(f))}</b> (fee {rs(f.feeAmount)}, stipend {rs(f.stipendAmount)}, travel {rs(f.travelAmount)}{f.otherAmount ? `, other ${rs(f.otherAmount)}` : ""}) · sanctioned {day(f.sanctionedAt)} · {f.startDate ? `from ${day(f.startDate)}` : ""}{f.expectedReturn ? ` · expected back ${day(f.expectedReturn)}` : ""}{f.actualReturn ? ` · returned ${day(f.actualReturn)}` : ""}</p>
          <p style={{ fontSize: 13, margin: "4px 0", fontWeight: 700, color: f.status === "BOND_BROKEN" ? "#B3261E" : undefined }}>{STATUS[f.status]}{hasBond(f) ? ` · bond ${f.bondYears} years${bd.until ? `, served ${bd.servedPct}% (until ${day(bd.until)})` : ""}` : ""}{f.refundDue ? ` · refund due ${rs(f.refundDue)}${f.refundPaid ? `, paid ${rs(f.refundPaid)}` : ""}` : ""}</p>
          {f.notes && <p className="small-note" style={{ margin: 0 }}>{f.notes}</p>}
          {hasBond(f) && <div style={{ marginTop: 6 }}><b style={{ fontSize: 13 }}>Progress reports</b>{rp.map((r) => <div key={r.id} style={{ fontSize: 13, margin: "4px 0 4px 10px" }}><b>{r.term}</b> <span className="small-note">{day(r.submittedAt)}</span> — {r.report}{r.reviewNote ? <div className="small-note" style={{ margin: 0 }}>Reviewed: {r.reviewNote}</div> : manage ? <ActionForm url="/api/fdp-funding" fixed={{ action: "review", reportId: r.id }} submit="Save" collapsed openLabel="Review" fields={[{ name: "reviewNote", label: "Comment", width: 260 }]} /> : null}</div>)}{!rp.length && <span className="small-note"> none yet</span>}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {mine && hasBond(f) && f.status === "ACTIVE" && <ActionForm url="/api/fdp-funding" fixed={{ action: "report", id: f.id }} submit="Send report" collapsed openLabel="Send a progress report" fields={[{ name: "term", label: "Semester", placeholder: "Fall 2026", width: 120 }, { name: "report", label: "Progress (courses passed, research, expected completion)", type: "textarea", full: true }]} />}
            {manage && <ActionForm url="/api/fdp-funding" fixed={{ action: "status", id: f.id }} submit="Save" collapsed openLabel="Update status" initial={{ status: f.status, actualReturn: f.actualReturn ? new Date(f.actualReturn).toISOString().slice(0, 10) : "", leftOn: "", refundPaid: f.refundPaid ?? "", notes: f.notes || "" }} fields={[{ name: "status", label: "Status", type: "select", options: Object.entries(STATUS) }, { name: "actualReturn", label: "Returned on", type: "date" }, { name: "leftOn", label: "Left the institute on (bond broken)", type: "date" }, { name: "refundPaid", label: "Refund paid (Rs)", type: "number", width: 110 }, { name: "notes", label: "Notes", width: 200 }]} />}
          </div>
        </div>); })}
      {rows && !rows.length && <div className="card">No funding recorded yet.</div>}
    </Shell>
  );
}
