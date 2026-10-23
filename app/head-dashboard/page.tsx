import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import HowCalculated from "../../components/HowCalculated";
import PrintButton from "../../components/PrintButton";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { whoIs } from "../../lib/registers";
import { DASH_ROLES, DASH_HINT, DEFAULT_TARGETS, TARGET_LABELS, latestSnapshot, refreshDashboard, scopeOf, inScope, figures, light, targetsOf, fmtFigure, type Snapshot } from "../../lib/headDashboard";
import { ActionButton, ActionForm } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LIGHT = { green: { bg: "#E7F4EC", bar: "#1E6B3A", text: "On target" }, amber: { bg: "#FFF3DC", bar: "#B45309", text: "Close to target" }, red: { bg: "#FDECEA", bar: "#B3261E", text: "Below target" }, grey: { bg: "#F6F2F1", bar: "#9A8B89", text: "No target" } } as const;

// The Institute Head's dashboard (Deans and HODs see their own area): headline figures, each opening its detail page.
export default async function HeadDashboardPage({ searchParams }: { searchParams: { dept?: string; program?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!DASH_ROLES.includes(user.role)) redirect("/dashboard");
  const w = await whoIs(user as never);
  if (!w) redirect("/dashboard");
  let snap: Snapshot | null | "missing" = await latestSnapshot(w.chairmanId);
  let error = "";
  // The first visit works the figures out straight away; after that the nightly job keeps them up to date.
  if (snap === null) { try { snap = await refreshDashboard(w.chairmanId); } catch (e) { error = String((e as Error).message || e).slice(0, 200); } }
  const shell = (body: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{body}</Shell>;
  if (snap === "missing" || !snap) return shell(<><h1 style={{ fontSize: 22 }}>Institute Dashboard</h1><div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{snap === "missing" ? DASH_HINT : `The figures could not be worked out: ${error}`}</p></div></>);

  const sc = scopeOf(user as never, snap, searchParams.dept || null, searchParams.program || null);
  const targets = await targetsOf(w.chairmanId);
  const figs = figures(snap, sc, targets);
  const { programs } = inScope(snap, sc);
  const allowedDepts = scopeOf(user as never, snap).departmentIds;
  const deptOptions = snap.departments.filter((d) => !allowedDepts || allowedDepts.includes(d.departmentId));
  const progOptions = snap.programs.filter((p) => !sc.departmentIds || (p.departmentId && sc.departmentIds.includes(p.departmentId)));
  const whole = !sc.departmentIds && !sc.program;
  const area = sc.program || (sc.departmentIds ? deptOptions.filter((d) => sc.departmentIds!.includes(d.departmentId)).map((d) => d.name).join(", ") || "your area" : "Whole institute");
  const ageH = (Date.now() - new Date(snap.computedAt).getTime()) / 3600_000;
  const counts = { green: 0, amber: 0, red: 0, grey: 0 }; for (const f of figs) counts[light(f)]++;
  const qs = new URLSearchParams({ ...(searchParams.dept ? { dept: searchParams.dept } : {}), ...(sc.program ? { program: sc.program } : {}) }).toString();

  return shell(
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: "0 0 2px" }}>Institute Dashboard</h1>
          <p className="small-note" style={{ margin: 0 }}><b>{area}</b> · last updated {new Date(snap.computedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}{ageH > 30 ? <b style={{ color: "#B3261E" }}> (more than a day old)</b> : null} · <b style={{ color: "#1E6B3A" }}>{counts.green} on target</b>, <b style={{ color: "#B45309" }}>{counts.amber} close</b>, <b style={{ color: "#B3261E" }}>{counts.red} below</b></p>
        </div>
        <div className="no-print" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <ActionButton url="/api/head-dashboard" body={{ action: "refresh" }} label="Work out again now" className="btn btn-secondary btn-sm" />
          <a className="btn btn-brass btn-sm" href={`/api/head-dashboard${qs ? `?${qs}` : ""}`}>Export PDF</a>
          <PrintButton label="Print" className="btn btn-secondary btn-sm" />
        </div>
      </div>

      <form method="get" className="card no-print" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end", marginBottom: 10 }}>
        {deptOptions.length > 1 && <label style={{ fontSize: 13 }}>Department<br /><select name="dept" className="input" defaultValue={searchParams.dept || ""}><option value="">{user.role === "CHAIRMAN" ? "Whole institute" : "All my departments"}</option>{deptOptions.map((d) => <option key={d.departmentId} value={d.departmentId}>{d.name}</option>)}</select></label>}
        <label style={{ fontSize: 13 }}>Program<br /><select name="program" className="input" defaultValue={sc.program || ""}><option value="">All programs</option>{progOptions.map((p) => <option key={p.program} value={p.program}>{p.program}</option>)}</select></label>
        <button type="submit" className="btn btn-brass btn-sm">Show</button>
        {(searchParams.dept || searchParams.program) && <a href="/head-dashboard" className="btn btn-secondary btn-sm">Clear</a>}
        <span className="small-note" style={{ margin: 0 }}>Campus: programs are not linked to campuses in OBEHUB yet, so there is no campus filter.</span>
      </form>

      <HowCalculated shows="Where each figure comes from, the colours, and 'before'.">
        <ul style={{ margin: "0 0 4px 18px", padding: 0 }}>
          <li>Figures are worked out every night from the records (and when you press “Work out again now”). Each card opens the page with the detail.</li>
          <li>Green = on or better than the Institute Head&apos;s target; amber = within 15% of it (25% for “at most” targets); red = further away; grey = no target. Arrows compare with the previous term (results, attainment, feedback) or the previous calendar year (students who left, FDP hours, publications).</li>
          <li>Pass rate and CLO/PLO attainment come from students&apos; transcript records of the latest term with results. Teacher feedback shows the raw average; the detail line also gives the score adjusted for each batch&apos;s usual way of rating.</li>
          <li>Deans see their faculty&apos;s departments and HODs their own department. Budget is for the whole institute.</li>
        </ul>
      </HowCalculated>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 10, marginBottom: 16 }}>
        {figs.map((f) => {
          const l = LIGHT[light(f)];
          const diff = f.now !== null && f.before !== null ? Math.round((f.now - f.before) * 10) / 10 : null;
          const good = diff === null || diff === 0 || !f.better ? null : (diff > 0) === (f.better === "up");
          return (
            <a key={f.key} href={f.href} className="card" style={{ display: "block", textDecoration: "none", color: "inherit", background: l.bg, borderLeft: `6px solid ${l.bar}`, padding: "12px 14px", margin: 0, breakInside: "avoid" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#4A3B39", textTransform: "uppercase", letterSpacing: 0.3 }}>{f.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: l.bar, whiteSpace: "nowrap" }}>{l.text}</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "4px 0 2px" }}>
                <span style={{ fontSize: 30, fontWeight: 800, color: l.bar === "#9A8B89" ? "#2A1F1E" : l.bar, fontFamily: "Georgia, serif" }}>{fmtFigure(f)}</span>
                {diff !== null && <span style={{ fontSize: 13, fontWeight: 700, color: good === null ? "#6b5a58" : good ? "#1E6B3A" : "#B3261E" }}>{diff > 0 ? "▲" : diff < 0 ? "▼" : "="} {Math.abs(diff)}{f.unit === "%" ? " pts" : ""} vs {f.beforeLabel} ({fmtFigure(f, f.before)})</span>}
              </div>
              {f.target !== null && <div style={{ fontSize: 12, color: "#4A3B39" }}>Target: {f.better === "down" ? "at most" : "at least"} {fmtFigure(f, f.target)}</div>}
              <div className="small-note" style={{ margin: "4px 0 0", color: "#4A3B39" }}>{f.sub}{f.instituteOnly && !whole ? " (not split by department)" : ""}</div>
            </a>
          );
        })}
      </div>

      <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>By program</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table" style={{ fontSize: 13 }}>
          <thead><tr><th>Program</th><th>Students</th><th>Pass rate</th><th>CLO</th><th>Readiness</th><th>Left this year</th><th>Warning / probation</th><th>Short of attendance</th><th>Feedback</th><th>Next visit</th></tr></thead>
          <tbody>{programs.map((p) => {
            const pass = p.results.cur.students ? Math.round((100 * p.results.cur.pass) / p.results.cur.students) : null;
            const clo = p.clo.cur.total ? Math.round((100 * p.clo.cur.pass) / p.clo.cur.total) : null;
            const left = ["DROPPED", "LEFT", "TRANSFER_OUT", "RUSTICATED"].reduce((t, k) => t + (p.moved.cur[k] || 0), 0);
            const fb = p.feedback.cur.n ? Math.round((10 * p.feedback.cur.sum) / p.feedback.cur.n) / 10 : null;
            const c = (v: number | null, t: number, up = true) => (v === null ? undefined : (up ? v >= t : v <= t) ? "#1E6B3A" : "#B3261E");
            return (
              <tr key={p.program}>
                <td><a href={`/head-dashboard?${new URLSearchParams({ ...(searchParams.dept ? { dept: searchParams.dept } : {}), program: p.program }).toString()}`}><b>{p.program}</b></a></td>
                <td>{p.enrolled}</td>
                <td style={{ color: c(pass, targets.passRate ?? DEFAULT_TARGETS.passRate), fontWeight: 700 }}>{pass === null ? "—" : `${pass}%`}</td>
                <td style={{ color: c(clo, targets.clo ?? DEFAULT_TARGETS.clo), fontWeight: 700 }}>{clo === null ? "—" : `${clo}%`}</td>
                <td style={{ color: c(p.readiness, targets.readiness ?? DEFAULT_TARGETS.readiness), fontWeight: 700 }}>{p.readiness === null ? "—" : `${p.readiness}%`}</td>
                <td>{left}</td>
                <td>{p.warning} / {p.probation}</td>
                <td>{p.shortages}</td>
                <td>{fb ?? "—"}</td>
                <td>{p.nextVisit ? `${new Date(p.nextVisit).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}${p.body ? ` (${p.body})` : ""}` : "—"}</td>
              </tr>
            );
          })}</tbody>
        </table>
        {programs.length === 0 && <p className="small-note">No programs in this area.</p>}
      </div>

      {w.head && (
        <div className="no-print">
          <h2 style={{ fontSize: 17, margin: "18px 0 6px" }}>Targets</h2>
          <div className="card" style={{ overflowX: "auto" }}>
            <p className="small-note" style={{ marginTop: 0 }}>The colours on every card compare the figure with these targets. Deans and HODs see the same targets for their area.</p>
            <table className="table" style={{ fontSize: 13 }}>
              <thead><tr><th>Figure</th><th>Target</th><th></th></tr></thead>
              <tbody>{TARGET_LABELS.map(([key, label, dir]) => {
                const v = targets[key] ?? (key === "fdp" ? snap!.institute.fdpTarget : key === "str" ? snap!.institute.studentsPerFteLimit : DEFAULT_TARGETS[key]);
                return (
                  <tr key={key}><td>{label}</td><td>{dir} <b>{v}</b>{targets[key] === undefined ? <span className="small-note"> (default)</span> : null}</td>
                    <td><ActionForm url="/api/head-dashboard" fixed={{ action: "target", key }} collapsed openLabel="Change" submit="Save" initial={{ target: v }} fields={[{ name: "target", label, type: "number" }]} /></td></tr>
                );
              })}</tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
