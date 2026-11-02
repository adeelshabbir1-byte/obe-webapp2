import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import { pilotFigures, PERIODS } from "../../lib/pilotFigures";
import PilotMinutesForm from "../../components/PilotMinutesForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pilot figures" };

// Time saved (for a pilot report to HEC or the Vice Chancellor): work counted by OBEHUB, minutes entered by the institute.
export default async function PilotFiguresPage({ searchParams }: { searchParams: { days?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["CHAIRMAN", "DEAN"].includes(user.role)) redirect("/home");
  const d = Number(searchParams.days);
  const days = PERIODS.includes(d) ? d : 90;
  const f = await pilotFigures(await chairmanIdFor(user), days);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>Pilot figures</h1>
      <p className="small-note">Work done in OBEHUB by your staff, and the time it saves. OBEHUB counts the tasks from its activity log; the minutes per task are your own institute's estimates.</p>
      <p style={{ fontSize: 13 }}>Period: {PERIODS.map((p) => <Link key={p} href={`/pilot-figures?days=${p}`} style={{ marginRight: 10, fontWeight: p === days ? 700 : 400 }}>{p === 365 ? "1 year" : `${p} days`}</Link>)}
        <a className="btn btn-secondary btn-sm" href={`/api/pilot-figures?days=${days}`} style={{ marginLeft: 8 }}>Download PDF</a></p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div className="card" style={{ flex: "1 1 180px" }}><div className="small-note">Tasks recorded</div><div style={{ fontSize: 28, fontWeight: 700 }} data-total>{f.total.toLocaleString()}</div></div>
        <div className="card" style={{ flex: "1 1 180px" }}><div className="small-note">Staff who used it</div><div style={{ fontSize: 28, fontWeight: 700 }}>{f.people} <span className="small-note">of {f.staff}</span></div></div>
        <div className="card" style={{ flex: "1 1 180px" }}><div className="small-note">Hours saved</div><div style={{ fontSize: 28, fontWeight: 700 }} data-hours>{f.hoursSaved === null ? "—" : f.hoursSaved.toLocaleString()}</div>{f.hoursSaved === null ? <div className="small-note">Enter your minutes below</div> : <div className="small-note">from {f.entered} of {f.rows.length} areas</div>}</div>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 13 }}><thead><tr><th>Area</th><th>Tasks recorded</th><th>Minutes before</th><th>Minutes now</th><th>Hours saved</th></tr></thead>
          <tbody>{f.rows.map((r) => <tr key={r.key} data-area={r.key}><td>{r.label}</td><td>{r.count.toLocaleString()}</td><td>{r.before ?? "—"}</td><td>{r.now ?? "—"}</td><td>{r.hoursSaved ?? "—"}</td></tr>)}</tbody></table>
        <p className="small-note">Hours saved = tasks × (minutes before − minutes now) ÷ 60. Sign-ins and settings are not counted as tasks.</p>
      </div>
      {user.role === "CHAIRMAN" ? <PilotMinutesForm rows={f.rows} /> : <p className="small-note">The Institute Head enters the minutes per task.</p>}
    </Shell>
  );
}
